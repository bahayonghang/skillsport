import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

/** SkillPort 1.1.0 ships exactly two Light Glass themes (DESIGN.md). */
export type ThemeFlavor = "glass-light" | "glass-dark";

export type FontThemeMode = "light" | "dark";

export const THEME_FLAVORS: ThemeFlavor[] = ["glass-light", "glass-dark"];

export function fontThemeModeForFlavor(
  flavor: ThemeFlavor,
): FontThemeMode {
  return flavor === "glass-light" ? "light" : "dark";
}

const THEME_STORAGE_KEY = "skillport-theme";

/**
 * 1.0.x persisted a Catppuccin / Claude flavor plus an accent. Both keys are
 * read once for migration and removed after the new key is written.
 */
const LEGACY_FLAVOR_STORAGE_KEY = "catppuccin-flavor";
const LEGACY_ACCENT_STORAGE_KEY = "catppuccin-accent";
const LEGACY_FLAVOR_MIGRATION = new Map<string, ThemeFlavor>([
  ["latte", "glass-light"],
  ["claude-light", "glass-light"],
  ["mocha", "glass-dark"],
  ["macchiato", "glass-dark"],
  ["frappe", "glass-dark"],
  ["claude-dark", "glass-dark"],
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Detect system color-scheme preference. */
function systemFlavor(): ThemeFlavor {
  if (typeof window === "undefined" || !window.matchMedia) return "glass-dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "glass-light"
    : "glass-dark";
}

function isThemeFlavor(value: string | null): value is ThemeFlavor {
  return THEME_FLAVORS.includes(value as ThemeFlavor);
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // localStorage unavailable (SSR, privacy mode, etc.)
    return null;
  }
}

/** Write a key; returns false when storage is unavailable or rejects it. */
function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently ignore storage errors
  }
}

/** Resolve the startup flavor: new key → migrated legacy flavor → system. */
function readFlavor(): ThemeFlavor {
  const stored = readStorage(THEME_STORAGE_KEY);
  if (isThemeFlavor(stored)) return stored;

  const legacy = readStorage(LEGACY_FLAVOR_STORAGE_KEY);
  const migrated = legacy === null ? undefined : LEGACY_FLAVOR_MIGRATION.get(legacy);
  if (migrated) return migrated;

  return systemFlavor();
}

let themeSwitchEpoch = 0;

/**
 * Commit a theme DOM write while color and shadow transitions are off.
 * offsetWidth flushes that commit before the marker is removed; a same-turn
 * clear would let the browser interpolate the new tokens. A newer commit
 * bumps the epoch so the older frame callback leaves the marker in place.
 */
function applyThemeDom(mutate: () => void): void {
  if (typeof document === "undefined") {
    mutate();
    return;
  }
  const html = document.documentElement;
  const epoch = ++themeSwitchEpoch;
  html.dataset.themeSwitching = "";
  mutate();
  void html.offsetWidth;
  requestAnimationFrame(() => {
    if (epoch !== themeSwitchEpoch) return;
    delete html.dataset.themeSwitching;
  });
}

/**
 * Apply flavor to the DOM and persist it. Returns whether the new key was
 * written, so migration only deletes legacy keys after a successful write.
 */
function applyFlavor(flavor: ThemeFlavor): boolean {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = flavor;
  }
  return writeStorage(THEME_STORAGE_KEY, flavor);
}

// ─── State ────────────────────────────────────────────────────────────────────

interface ThemeState {
  flavor: ThemeFlavor;

  // Actions
  setFlavor: (flavor: ThemeFlavor) => void;
  /** Switch between glass-light and glass-dark (top bar / sidebar toggle). */
  toggleFlavor: () => void;
  /** Initialize theme — call once before React renders to prevent flash. */
  init: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useThemeStore = create<ThemeState>((set, get) => ({
  flavor: "glass-dark", // safe default; init() overrides

  setFlavor: (flavor) => {
    applyThemeDom(() => {
      applyFlavor(flavor);
    });
    set({ flavor });
  },

  toggleFlavor: () => {
    get().setFlavor(get().flavor === "glass-light" ? "glass-dark" : "glass-light");
  },

  init: () => {
    const flavor = readFlavor();
    // Direct write: startup has no previous frame, so do not suppress transitions.
    if (applyFlavor(flavor)) {
      removeStorage(LEGACY_FLAVOR_STORAGE_KEY);
      removeStorage(LEGACY_ACCENT_STORAGE_KEY);
    }
    if (typeof document !== "undefined") {
      // 1.0.x wrote data-accent; nothing reads it any more.
      delete document.documentElement.dataset.accent;
    }
    set({ flavor });
  },
}));
