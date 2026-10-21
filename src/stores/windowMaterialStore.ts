import { create } from "zustand";

import { backendErrorStateValue } from "@/lib/backendError";
import { invoke, type CommandResult } from "@/lib/ipc";

import { useThemeStore, type ThemeFlavor } from "./themeStore";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Persisted user choice (settings key `window_material_v1`). */
export type WindowMaterialPreference = "mica" | "off";

/** What Rust actually did; mirrors `services::window_material::WindowMaterialState`. */
export type WindowMaterialState = CommandResult<"set_window_material">;

/** DOM marker on `<html>`; CSS keeps the canvas opaque unless it is `mica`. */
export type WindowMaterialDom = "none" | "mica";

export const WINDOW_MATERIAL_SETTING_KEY = "window_material_v1";
export const DEFAULT_WINDOW_MATERIAL_PREFERENCE: WindowMaterialPreference =
  "mica";

export function normalizeWindowMaterialPreference(
  value: unknown,
): WindowMaterialPreference {
  return value === "off" ? "off" : DEFAULT_WINDOW_MATERIAL_PREFERENCE;
}

// ─── DOM ──────────────────────────────────────────────────────────────────────

function writeMaterialDom(material: WindowMaterialDom): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.windowMaterial = material;
}

function isDarkFlavor(flavor: ThemeFlavor): boolean {
  return flavor === "glass-dark";
}

// Latest-request-wins: a slower, older reply must not overwrite a newer one.
let applyEpoch = 0;
let unsubscribeTheme: (() => void) | null = null;

// ─── State ────────────────────────────────────────────────────────────────────

interface WindowMaterialStoreState {
  preference: WindowMaterialPreference;
  /** Last result from Rust; null until the first request settles. */
  state: WindowMaterialState | null;
  isSaving: boolean;
  error: string | null;

  /** Read the preference, request the material, follow theme changes. */
  init: () => Promise<void>;
  /** Persist the preference, then re-apply. Rejects when persisting fails. */
  setPreference: (preference: WindowMaterialPreference) => Promise<void>;
  /** Re-apply for a new light / dark theme (called after a theme commit). */
  syncTheme: (dark: boolean) => Promise<void>;
  /** Test helper: drop subscriptions and return to the opaque default. */
  reset: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useWindowMaterialStore = create<WindowMaterialStoreState>(
  (set, get) => {
    async function apply(dark: boolean): Promise<void> {
      const epoch = ++applyEpoch;
      const enabled = get().preference === "mica";
      // Turning the material off is always safe to show immediately.
      if (!enabled) writeMaterialDom("none");
      try {
        const state = await invoke("set_window_material", { enabled, dark });
        if (epoch !== applyEpoch) return;
        writeMaterialDom(state.applied === "mica" ? "mica" : "none");
        set({ state });
      } catch {
        if (epoch !== applyEpoch) return;
        // Unknown native state: fall back to the opaque canvas.
        writeMaterialDom("none");
      }
    }

    return {
      preference: DEFAULT_WINDOW_MATERIAL_PREFERENCE,
      state: null,
      isSaving: false,
      error: null,

      init: async () => {
        writeMaterialDom("none");
        if (!unsubscribeTheme) {
          unsubscribeTheme = useThemeStore.subscribe((theme, previous) => {
            if (theme.flavor === previous.flavor) return;
            void get().syncTheme(isDarkFlavor(theme.flavor));
          });
        }

        let preference: WindowMaterialPreference =
          DEFAULT_WINDOW_MATERIAL_PREFERENCE;
        try {
          preference = normalizeWindowMaterialPreference(
            await invoke("get_setting", { key: WINDOW_MATERIAL_SETTING_KEY }),
          );
        } catch {
          // Settings unavailable (e.g. startup recovery): keep the default.
        }
        set({ preference });
        await apply(isDarkFlavor(useThemeStore.getState().flavor));
      },

      setPreference: async (preference) => {
        set({ isSaving: true, error: null });
        try {
          await invoke("set_setting", {
            key: WINDOW_MATERIAL_SETTING_KEY,
            value: preference,
          });
        } catch (error) {
          set({ isSaving: false, error: backendErrorStateValue(error) });
          throw error;
        }
        set({ preference, isSaving: false });
        await apply(isDarkFlavor(useThemeStore.getState().flavor));
      },

      syncTheme: async (dark) => {
        // Nothing native to sync off Windows.
        if (get().state?.reason === "unsupportedPlatform") return;
        await apply(dark);
      },

      reset: () => {
        unsubscribeTheme?.();
        unsubscribeTheme = null;
        applyEpoch += 1;
        writeMaterialDom("none");
        set({
          preference: DEFAULT_WINDOW_MATERIAL_PREFERENCE,
          state: null,
          isSaving: false,
          error: null,
        });
      },
    };
  },
);
