import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ipcFixtureError } from "@/lib/ipc/errors";
import { useThemeStore } from "@/stores/themeStore";
import {
  WINDOW_MATERIAL_SETTING_KEY,
  normalizeWindowMaterialPreference,
  useWindowMaterialStore,
  type WindowMaterialState,
} from "@/stores/windowMaterialStore";
import { ipcInvokeCalls, mockIpcCommand, mockIpcCommands } from "@/test/support/ipcMock";

const MICA: WindowMaterialState = { applied: "mica", reason: null, supported: true };
const DISABLED: WindowMaterialState = {
  applied: "none",
  reason: "disabled",
  supported: true,
};
const UNSUPPORTED_OS: WindowMaterialState = {
  applied: "none",
  reason: "unsupportedOs",
  supported: false,
};

function materialDom() {
  return document.documentElement.dataset.windowMaterial;
}

/** Rust stand-in: Windows 11, honours `enabled`. */
function win11(args: unknown): WindowMaterialState {
  return (args as { enabled: boolean }).enabled ? MICA : DISABLED;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("windowMaterialStore", () => {
  beforeEach(() => {
    useWindowMaterialStore.getState().reset();
    useThemeStore.setState({ flavor: "glass-light" });
    delete document.documentElement.dataset.windowMaterial;
  });

  afterEach(() => {
    useWindowMaterialStore.getState().reset();
  });

  it("normalizes the stored preference and defaults to mica", () => {
    expect(normalizeWindowMaterialPreference("off")).toBe("off");
    expect(normalizeWindowMaterialPreference("mica")).toBe("mica");
    expect(normalizeWindowMaterialPreference(null)).toBe("mica");
    expect(normalizeWindowMaterialPreference("acrylic")).toBe("mica");
  });

  it("init reads the setting, requests the material and marks mica only after Rust applied it", async () => {
    let resolveMaterial: (state: WindowMaterialState) => void = () => {};
    mockIpcCommands({
      get_setting: null,
      set_window_material: () =>
        new Promise<WindowMaterialState>((resolve) => {
          resolveMaterial = resolve;
        }),
    });

    const pending = useWindowMaterialStore.getState().init();
    // Opaque until the native result arrives.
    expect(materialDom()).toBe("none");
    await flush();
    expect(ipcInvokeCalls("get_setting")).toEqual([
      { command: "get_setting", args: { key: WINDOW_MATERIAL_SETTING_KEY } },
    ]);
    expect(ipcInvokeCalls("set_window_material")).toEqual([
      { command: "set_window_material", args: { enabled: true, dark: false } },
    ]);
    expect(materialDom()).toBe("none");

    resolveMaterial(MICA);
    await pending;
    expect(materialDom()).toBe("mica");
    expect(useWindowMaterialStore.getState().state).toEqual(MICA);
  });

  it("requests no material when the stored preference is off", async () => {
    mockIpcCommands({ get_setting: "off", set_window_material: win11 });
    await useWindowMaterialStore.getState().init();
    expect(useWindowMaterialStore.getState().preference).toBe("off");
    expect(ipcInvokeCalls("set_window_material")[0]?.args).toEqual({
      enabled: false,
      dark: false,
    });
    expect(materialDom()).toBe("none");
  });

  it("stays opaque on Windows 10", async () => {
    mockIpcCommands({ get_setting: "mica", set_window_material: UNSUPPORTED_OS });
    await useWindowMaterialStore.getState().init();
    expect(materialDom()).toBe("none");
    expect(useWindowMaterialStore.getState().state?.supported).toBe(false);
  });

  it("keeps none when the command fails, and falls back to the default when the setting read fails", async () => {
    mockIpcCommands({
      get_setting: () => {
        throw ipcFixtureError("database.unavailable", "Database unavailable");
      },
      set_window_material: () => {
        throw ipcFixtureError("internal.unexpected", "boom");
      },
    });
    await useWindowMaterialStore.getState().init();
    expect(useWindowMaterialStore.getState().preference).toBe("mica");
    expect(ipcInvokeCalls("set_window_material")).toHaveLength(1);
    expect(materialDom()).toBe("none");
    expect(useWindowMaterialStore.getState().state).toBeNull();
  });

  it("re-syncs the native theme after every theme commit", async () => {
    mockIpcCommands({ get_setting: "mica", set_window_material: win11 });
    await useWindowMaterialStore.getState().init();

    useThemeStore.getState().setFlavor("glass-dark");
    await flush();
    expect(ipcInvokeCalls("set_window_material").map((call) => call.args)).toEqual([
      { enabled: true, dark: false },
      { enabled: true, dark: true },
    ]);
    expect(materialDom()).toBe("mica");

    // A second init must not double-subscribe.
    await useWindowMaterialStore.getState().init();
    useThemeStore.getState().toggleFlavor();
    await flush();
    const calls = ipcInvokeCalls("set_window_material").map((call) => call.args);
    expect(calls.slice(-2)).toEqual([
      { enabled: true, dark: true },
      { enabled: true, dark: false },
    ]);
    expect(calls).toHaveLength(4);
  });

  it("does not call native sync off Windows", async () => {
    mockIpcCommands({
      get_setting: null,
      set_window_material: {
        applied: "none",
        reason: "unsupportedPlatform",
        supported: false,
      },
    });
    await useWindowMaterialStore.getState().init();
    useThemeStore.getState().setFlavor("glass-dark");
    await flush();
    expect(ipcInvokeCalls("set_window_material")).toHaveLength(1);
  });

  it("lets a newer request win over a slower older one", async () => {
    const resolvers: Array<(state: WindowMaterialState) => void> = [];
    mockIpcCommands({
      get_setting: "mica",
      set_window_material: () =>
        new Promise<WindowMaterialState>((resolve) => resolvers.push(resolve)),
    });
    const first = useWindowMaterialStore.getState().init();
    await flush();
    const second = useWindowMaterialStore.getState().syncTheme(true);
    await flush();
    expect(resolvers).toHaveLength(2);

    resolvers[1]!(DISABLED);
    await second;
    resolvers[0]!(MICA);
    await first;
    expect(materialDom()).toBe("none");
    expect(useWindowMaterialStore.getState().state).toEqual(DISABLED);
  });

  it("setPreference persists the key, then re-applies; off is opaque immediately", async () => {
    mockIpcCommands({ get_setting: "mica", set_window_material: win11 });
    await useWindowMaterialStore.getState().init();
    expect(materialDom()).toBe("mica");

    mockIpcCommand("set_setting", undefined);
    await useWindowMaterialStore.getState().setPreference("off");
    expect(ipcInvokeCalls("set_setting")).toEqual([
      {
        command: "set_setting",
        args: { key: WINDOW_MATERIAL_SETTING_KEY, value: "off" },
      },
    ]);
    expect(useWindowMaterialStore.getState().preference).toBe("off");
    expect(materialDom()).toBe("none");
    expect(ipcInvokeCalls("set_window_material").slice(-1)[0]?.args).toEqual({
      enabled: false,
      dark: false,
    });

    await useWindowMaterialStore.getState().setPreference("mica");
    expect(materialDom()).toBe("mica");
  });

  it("setPreference rejects and keeps the previous preference when persisting fails", async () => {
    mockIpcCommands({ get_setting: "mica", set_window_material: win11 });
    await useWindowMaterialStore.getState().init();
    mockIpcCommand("set_setting", () => {
      throw ipcFixtureError("database.unavailable", "Database unavailable");
    });

    await expect(
      useWindowMaterialStore.getState().setPreference("off"),
    ).rejects.toBeDefined();
    const state = useWindowMaterialStore.getState();
    expect(state.preference).toBe("mica");
    expect(state.isSaving).toBe(false);
    expect(state.error).toBeTruthy();
    expect(materialDom()).toBe("mica");
    expect(ipcInvokeCalls("set_window_material")).toHaveLength(1);
  });
});
