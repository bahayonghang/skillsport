import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  THEME_FLAVORS,
  fontThemeModeForFlavor,
  type ThemeFlavor,
  useThemeStore,
} from "@/stores/themeStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THEME_KEY = "skillport-theme";
const LEGACY_FLAVOR_KEY = "catppuccin-flavor";
const LEGACY_ACCENT_KEY = "catppuccin-accent";

/** Reset the store to default state and clear localStorage. */
function resetStore() {
  useThemeStore.setState({ flavor: "glass-dark" });
  for (const key of [THEME_KEY, LEGACY_FLAVOR_KEY, LEGACY_ACCENT_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.accent;
    delete document.documentElement.dataset.themeSwitching;
  }
}

function mockSystemPrefersLight(prefersLight: boolean) {
  return vi
    .spyOn(window, "matchMedia")
    .mockReturnValue({ matches: prefersLight } as MediaQueryList);
}

function spyAnimationFrames() {
  const frames: FrameRequestCallback[] = [];
  const spy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
  return { frames, spy };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("themeStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it("only exposes the two Light Glass themes", () => {
    expect(THEME_FLAVORS).toEqual(["glass-light", "glass-dark"]);
  });

  it("classifies every flavor into its shared font theme mode", () => {
    expect(
      Object.fromEntries(
        THEME_FLAVORS.map((flavor) => [flavor, fontThemeModeForFlavor(flavor)]),
      ),
    ).toEqual({ "glass-light": "light", "glass-dark": "dark" });
  });

  it("has glass-dark as the default flavor before init", () => {
    expect(useThemeStore.getState().flavor).toBe("glass-dark");
  });

  it("no longer carries accent state or actions", () => {
    const state = useThemeStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("accent");
    expect(state).not.toHaveProperty("setAccent");
  });

  // ── setFlavor / toggleFlavor ─────────────────────────────────────────────

  it("setFlavor updates store, data-theme, and the new storage key", () => {
    const flavors: ThemeFlavor[] = THEME_FLAVORS;
    for (const flavor of flavors) {
      useThemeStore.getState().setFlavor(flavor);
      expect(useThemeStore.getState().flavor).toBe(flavor);
      expect(document.documentElement.dataset.theme).toBe(flavor);
      expect(localStorage.getItem(THEME_KEY)).toBe(flavor);
    }
    expect(localStorage.getItem(LEGACY_FLAVOR_KEY)).toBeNull();
  });

  it("toggleFlavor flips between glass-light and glass-dark", () => {
    useThemeStore.getState().setFlavor("glass-dark");
    useThemeStore.getState().toggleFlavor();
    expect(useThemeStore.getState().flavor).toBe("glass-light");
    expect(document.documentElement.dataset.theme).toBe("glass-light");

    useThemeStore.getState().toggleFlavor();
    expect(useThemeStore.getState().flavor).toBe("glass-dark");
    expect(document.documentElement.dataset.theme).toBe("glass-dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("glass-dark");
  });

  // ── init: stored value, migration, system fallback ────────────────────────

  it.each(THEME_FLAVORS)("init restores stored %s", (flavor) => {
    localStorage.setItem(THEME_KEY, flavor);
    useThemeStore.getState().init();
    expect(useThemeStore.getState().flavor).toBe(flavor);
    expect(document.documentElement.dataset.theme).toBe(flavor);
  });

  it.each([
    ["latte", "glass-light"],
    ["claude-light", "glass-light"],
    ["mocha", "glass-dark"],
    ["macchiato", "glass-dark"],
    ["frappe", "glass-dark"],
    ["claude-dark", "glass-dark"],
  ] as const)(
    "migrates legacy flavor %s to %s and removes the 1.0.x keys",
    (legacy, expected) => {
      // System preference must not win over a migrated legacy choice.
      mockSystemPrefersLight(expected === "glass-dark");
      localStorage.setItem(LEGACY_FLAVOR_KEY, legacy);
      localStorage.setItem(LEGACY_ACCENT_KEY, "green");
      document.documentElement.dataset.accent = "green";

      useThemeStore.getState().init();

      expect(useThemeStore.getState().flavor).toBe(expected);
      expect(document.documentElement.dataset.theme).toBe(expected);
      expect(localStorage.getItem(THEME_KEY)).toBe(expected);
      expect(localStorage.getItem(LEGACY_FLAVOR_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_ACCENT_KEY)).toBeNull();
      expect(document.documentElement.dataset.accent).toBeUndefined();
    },
  );

  it("prefers the new key over a leftover legacy flavor", () => {
    localStorage.setItem(THEME_KEY, "glass-light");
    localStorage.setItem(LEGACY_FLAVOR_KEY, "mocha");

    useThemeStore.getState().init();

    expect(useThemeStore.getState().flavor).toBe("glass-light");
    expect(localStorage.getItem(LEGACY_FLAVOR_KEY)).toBeNull();
  });

  it.each([
    [true, "glass-light"],
    [false, "glass-dark"],
  ] as const)(
    "follows the system (prefers light: %s) when nothing is stored",
    (prefersLight, expected) => {
      mockSystemPrefersLight(prefersLight);
      useThemeStore.getState().init();
      expect(useThemeStore.getState().flavor).toBe(expected);
      expect(localStorage.getItem(THEME_KEY)).toBe(expected);
    },
  );

  it("falls back to the system for invalid stored and legacy values", () => {
    mockSystemPrefersLight(true);
    localStorage.setItem(THEME_KEY, "mocha");
    localStorage.setItem(LEGACY_FLAVOR_KEY, "invalid-flavor");

    useThemeStore.getState().init();

    expect(useThemeStore.getState().flavor).toBe("glass-light");
    expect(localStorage.getItem(THEME_KEY)).toBe("glass-light");
    expect(localStorage.getItem(LEGACY_FLAVOR_KEY)).toBeNull();
  });

  it("keeps legacy keys when the new key cannot be written", () => {
    localStorage.setItem(LEGACY_FLAVOR_KEY, "latte");
    localStorage.setItem(LEGACY_ACCENT_KEY, "sky");
    const setItem = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    expect(() => useThemeStore.getState().init()).not.toThrow();

    setItem.mockRestore();
    expect(useThemeStore.getState().flavor).toBe("glass-light");
    expect(document.documentElement.dataset.theme).toBe("glass-light");
    expect(localStorage.getItem(LEGACY_FLAVOR_KEY)).toBe("latte");
    expect(localStorage.getItem(LEGACY_ACCENT_KEY)).toBe("sky");
  });

  it("degrades silently when localStorage reads throw", () => {
    mockSystemPrefersLight(false);
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => useThemeStore.getState().init()).not.toThrow();
    expect(useThemeStore.getState().flavor).toBe("glass-dark");
    expect(document.documentElement.dataset.theme).toBe("glass-dark");
  });

  it("setFlavor still updates the DOM when storage writes throw", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => useThemeStore.getState().setFlavor("glass-light")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("glass-light");
    expect(useThemeStore.getState().flavor).toBe("glass-light");
  });

  // ── Theme-switch transition suppression ───────────────────────────────────

  it("setFlavor keeps data-theme-switching until the captured animation frame", () => {
    const { frames } = spyAnimationFrames();
    const html = document.documentElement;
    let flushedWhileMarked = false;
    vi.spyOn(html, "offsetWidth", "get").mockImplementation(() => {
      flushedWhileMarked = html.dataset.themeSwitching === "";
      return 0;
    });

    useThemeStore.getState().setFlavor("glass-light");

    expect(html.dataset.themeSwitching).toBe("");
    expect(flushedWhileMarked).toBe(true);
    expect(html.dataset.theme).toBe("glass-light");
    expect(localStorage.getItem(THEME_KEY)).toBe("glass-light");
    expect(frames).toHaveLength(1);

    frames[0]?.(0);
    expect(html.dataset.themeSwitching).toBeUndefined();
    expect(html.dataset.theme).toBe("glass-light");
  });

  it("toggleFlavor goes through the same suppressed commit", () => {
    const { frames } = spyAnimationFrames();
    const html = document.documentElement;
    let flushedWhileMarked = false;
    vi.spyOn(html, "offsetWidth", "get").mockImplementation(() => {
      flushedWhileMarked = html.dataset.themeSwitching === "";
      return 0;
    });

    useThemeStore.getState().toggleFlavor();

    expect(flushedWhileMarked).toBe(true);
    expect(html.dataset.themeSwitching).toBe("");
    expect(frames).toHaveLength(1);
    frames[0]?.(0);
    expect(html.dataset.themeSwitching).toBeUndefined();
  });

  it("keeps suppression until the second setFlavor frame", () => {
    const { frames } = spyAnimationFrames();

    useThemeStore.getState().setFlavor("glass-light");
    useThemeStore.getState().setFlavor("glass-dark");

    expect(document.documentElement.dataset.theme).toBe("glass-dark");
    expect(document.documentElement.dataset.themeSwitching).toBe("");
    expect(frames).toHaveLength(2);

    frames[0]?.(0);
    expect(document.documentElement.dataset.themeSwitching).toBe("");
    expect(document.documentElement.dataset.theme).toBe("glass-dark");

    frames[1]?.(0);
    expect(document.documentElement.dataset.themeSwitching).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe("glass-dark");
  });

  it("init does not set data-theme-switching", () => {
    const animationFrame = vi.spyOn(window, "requestAnimationFrame");
    localStorage.setItem(LEGACY_FLAVOR_KEY, "frappe");

    useThemeStore.getState().init();

    expect(document.documentElement.dataset.theme).toBe("glass-dark");
    expect(document.documentElement.dataset.themeSwitching).toBeUndefined();
    expect(animationFrame).not.toHaveBeenCalled();
  });
});
