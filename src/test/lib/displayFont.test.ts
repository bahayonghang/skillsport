import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { invoke } from "@/lib/ipc";

vi.mock("@/lib/ipc", () => ({
  invoke: vi.fn(),
}));

import {
  applyDisplayFont,
  applyBodyFont,
  applyFontScale,
  applyFontPreferences,
  DEFAULT_FONT_PREFERENCES,
  DISPLAY_FONT_OPTIONS,
  BODY_FONT_OPTIONS,
  CHINESE_FALLBACK_OPTIONS,
  FONT_SCALE_OPTIONS,
  activateFontTheme,
  loadThemedFontPreferences,
  resolveBodyFontFamily,
  resolveDisplayFontFamily,
  saveBodyFont,
  saveDisplayFont,
} from "@/lib/displayFont";

function resetHtml() {
  const html = document.documentElement;
  delete html.dataset.displayFont;
  delete html.dataset.bodyFont;
  html.style.removeProperty("--font-display");
  html.style.removeProperty("--font-body");
  html.style.removeProperty("--font-scale");
}

describe("displayFont", () => {
  beforeEach(() => {
    resetHtml();
    vi.mocked(invoke).mockReset();
  });
  afterEach(() => resetHtml());

  it("exposes 6 display font options and 5 body font options", () => {
    expect(DISPLAY_FONT_OPTIONS).toHaveLength(6);
    expect(BODY_FONT_OPTIONS).toHaveLength(5);
    expect(CHINESE_FALLBACK_OPTIONS.map((option) => option.key)).toEqual([
      "system",
      "sourceHanSerif",
      "custom",
    ]);
    expect(FONT_SCALE_OPTIONS.map((o) => o.value)).toEqual([0.875, 1, 1.125]);
  });

  it("applies preset display font via data attribute and clears inline style", () => {
    document.documentElement.style.setProperty("--font-display", "stale");
    applyDisplayFont("serif");
    expect(document.documentElement.dataset.displayFont).toBe("serif");
    expect(document.documentElement.style.getPropertyValue("--font-display"))
      .toBe("");
  });

  it("falls back to geist when custom display font has empty family", () => {
    applyDisplayFont("custom", "   ");
    expect(document.documentElement.dataset.displayFont).toBe("geist");
    expect(document.documentElement.style.getPropertyValue("--font-display"))
      .toBe("");
  });

  it("injects inline --font-display when custom display font has a name", () => {
    applyDisplayFont("custom", "Atkinson Hyperlegible");
    expect(document.documentElement.dataset.displayFont).toBe("custom");
    expect(
      document.documentElement.style.getPropertyValue("--font-display"),
    ).toContain("Atkinson Hyperlegible");
  });

  it("adds Source Han after the primary font without bundling an asset", () => {
    applyDisplayFont("geist", "", "sourceHanSerif");
    expect(
      document.documentElement.style.getPropertyValue("--font-display"),
    ).toBe(
      '"Geist Variable", "Source Han Serif SC VF", "思源宋体 VF", ui-sans-serif, system-ui, sans-serif',
    );
  });

  it("quotes a custom Chinese fallback as one family name", () => {
    applyBodyFont("jetbrains", "", "custom", 'Noto "Serif" CJK');
    expect(
      document.documentElement.style.getPropertyValue("--font-body"),
    ).toContain('"Noto \\"Serif\\" CJK"');
  });

  it("sanitizes control characters in custom family names", () => {
    applyDisplayFont("custom", 'Line\nBreak" Font');
    const value = document.documentElement.style.getPropertyValue("--font-display");
    expect(value).toContain('"Line Break\\" Font"');
    expect(value).not.toContain("\n");
  });

  it("treats an empty custom Chinese fallback as System", () => {
    applyDisplayFont("inter", "", "custom", "   ");
    expect(document.documentElement.dataset.displayFont).toBe("inter");
    expect(document.documentElement.style.getPropertyValue("--font-display"))
      .toBe("");
  });

  it("applies preset body font and custom fallback symmetrically", () => {
    applyBodyFont("inter");
    expect(document.documentElement.dataset.bodyFont).toBe("inter");

    applyBodyFont("custom", "Comic Sans MS");
    expect(document.documentElement.dataset.bodyFont).toBe("custom");
    expect(
      document.documentElement.style.getPropertyValue("--font-body"),
    ).toContain("Comic Sans MS");
  });

  it("clamps font scale into [0.75, 1.5]", () => {
    applyFontScale(2);
    expect(document.documentElement.style.getPropertyValue("--font-scale"))
      .toBe("1.5");
    applyFontScale(0);
    expect(document.documentElement.style.getPropertyValue("--font-scale"))
      .toBe("0.75");
    applyFontScale(1);
    expect(document.documentElement.style.getPropertyValue("--font-scale"))
      .toBe("1");
  });

  it("applyFontPreferences walks all three axes", () => {
    applyFontPreferences({
      ...DEFAULT_FONT_PREFERENCES,
      display: "inter",
      body: "geist",
      scale: 1.125,
    });
    expect(document.documentElement.dataset.displayFont).toBe("inter");
    expect(document.documentElement.dataset.bodyFont).toBe("geist");
    expect(document.documentElement.style.getPropertyValue("--font-scale"))
      .toBe("1.125");
  });

  it("keeps both Chinese fallback roles on System by default", () => {
    expect(DEFAULT_FONT_PREFERENCES).toMatchObject({
      display: "geist",
      displayChineseFallback: "system",
      displayChineseFallbackCustom: "",
      body: "geist",
      bodyChineseFallback: "system",
      bodyChineseFallbackCustom: "",
    });
  });

  it("falls back to geist when custom body font has an empty family", () => {
    applyBodyFont("custom", "   ");
    expect(document.documentElement.dataset.bodyFont).toBe("geist");
    expect(resolveBodyFontFamily({ ...DEFAULT_FONT_PREFERENCES, body: "custom" }))
      .toContain("Geist Variable");
  });

  it("resolves specimen families through the same safe chains as DOM apply", () => {
    const profile = {
      ...DEFAULT_FONT_PREFERENCES,
      display: "custom" as const,
      displayCustom: 'Display "Unsafe"',
      displayChineseFallback: "sourceHanSerif" as const,
      body: "inter" as const,
      bodyChineseFallback: "custom" as const,
      bodyChineseFallbackCustom: "Body\nFallback",
    };

    const displayFamily = resolveDisplayFontFamily(profile);
    const bodyFamily = resolveBodyFontFamily(profile);
    applyDisplayFont(
      profile.display,
      profile.displayCustom,
      profile.displayChineseFallback,
      profile.displayChineseFallbackCustom,
    );
    applyBodyFont(
      profile.body,
      profile.bodyCustom,
      profile.bodyChineseFallback,
      profile.bodyChineseFallbackCustom,
    );

    expect(displayFamily).toContain('"Display \\"Unsafe\\""');
    expect(bodyFamily).toContain('"Body Fallback"');
    expect(document.documentElement.style.getPropertyValue("--font-display"))
      .toBe(displayFamily);
    expect(document.documentElement.style.getPropertyValue("--font-body"))
      .toBe(bodyFamily);
  });

  it("migrates one legacy font profile into both theme modes", async () => {
    const legacy = new Map<string, string>([
      ["display_font_v1", "serif"],
      ["display_font_custom_v1", "Legacy Display"],
      ["display_chinese_fallback_v1", "sourceHanSerif"],
      ["display_chinese_fallback_custom_v1", "Legacy Display CJK"],
      ["body_font_v1", "inter"],
      ["body_font_custom_v1", "Legacy Body"],
      ["body_chinese_fallback_v1", "custom"],
      ["body_chinese_fallback_custom_v1", "Legacy Body CJK"],
      ["font_scale_v1", "1.125"],
    ]);
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "get_setting") {
        return legacy.get((args as { key: string }).key) ?? null;
      }
      return undefined;
    });

    const preferences = await loadThemedFontPreferences();

    expect(preferences.light).toEqual({
      display: "serif",
      displayCustom: "Legacy Display",
      displayChineseFallback: "sourceHanSerif",
      displayChineseFallbackCustom: "Legacy Display CJK",
      body: "inter",
      bodyCustom: "Legacy Body",
      bodyChineseFallback: "custom",
      bodyChineseFallbackCustom: "Legacy Body CJK",
    });
    expect(preferences.dark).toEqual(preferences.light);
    expect(preferences.scale).toBe(1.125);
    expect(invoke).toHaveBeenCalledWith("set_setting", {
      key: "display_font_light_v2",
      value: "serif",
    });
    expect(invoke).toHaveBeenCalledWith("set_setting", {
      key: "display_font_dark_v2",
      value: "serif",
    });
  });

  it("isolates saves and applies each profile when its mode becomes active", async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    await loadThemedFontPreferences();
    activateFontTheme("dark");

    await saveDisplayFont("light", "serif");
    expect(document.documentElement.dataset.displayFont).toBe("geist");

    await saveDisplayFont("dark", "inter");
    expect(document.documentElement.dataset.displayFont).toBe("inter");

    activateFontTheme("light");
    expect(document.documentElement.dataset.displayFont).toBe("serif");
    activateFontTheme("dark");
    expect(document.documentElement.dataset.displayFont).toBe("inter");
    expect(invoke).toHaveBeenCalledWith("set_setting", {
      key: "display_font_light_v2",
      value: "serif",
    });
    expect(invoke).toHaveBeenCalledWith("set_setting", {
      key: "display_font_dark_v2",
      value: "inter",
    });
  });

  it("prefers valid themed values and falls back per field", async () => {
    const settings = new Map<string, string>([
      ["display_font_v1", "serif"],
      ["display_font_custom_v1", "Legacy Display"],
      ["display_font_light_v2", "inter"],
      ["display_font_custom_light_v2", ""],
      ["display_font_dark_v2", "invalid"],
    ]);
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "get_setting") {
        return settings.get((args as { key: string }).key) ?? null;
      }
      return undefined;
    });

    const preferences = await loadThemedFontPreferences();

    expect(preferences.light.display).toBe("inter");
    expect(preferences.light.displayCustom).toBe("");
    expect(preferences.dark.display).toBe("serif");
    expect(preferences.dark.displayCustom).toBe("Legacy Display");
  });

  it("keeps edits made while migration reads are in flight", async () => {
    let releaseReads!: () => void;
    const readsReleased = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "get_setting") {
        await readsReleased;
        return (args as { key: string }).key === "body_font_dark_v2"
          ? "geist"
          : null;
      }
      return undefined;
    });

    const loading = loadThemedFontPreferences();
    await saveDisplayFont("dark", "inter");
    releaseReads();
    const preferences = await loading;

    expect(preferences.dark.display).toBe("inter");
    expect(preferences.dark.body).toBe("geist");
    activateFontTheme("dark");
    expect(document.documentElement.dataset.displayFont).toBe("inter");
  });

  it("serializes migration writes before newer edits to the same setting", async () => {
    const persisted = new Map<string, string>();
    let markMigrationStarted!: () => void;
    let releaseMigration!: () => void;
    const migrationStarted = new Promise<void>((resolve) => {
      markMigrationStarted = resolve;
    });
    const migrationReleased = new Promise<void>((resolve) => {
      releaseMigration = resolve;
    });
    let blockedMigration = false;

    vi.mocked(invoke).mockImplementation(async (command, args) => {
      const key = (args as { key: string }).key;
      if (command === "get_setting") {
        return null;
      }
      const value = (args as { value: string }).value;
      if (
        key === "display_font_dark_v2" &&
        value === "geist" &&
        !blockedMigration
      ) {
        blockedMigration = true;
        markMigrationStarted();
        await migrationReleased;
      }
      persisted.set(key, value);
      return undefined;
    });

    const loading = loadThemedFontPreferences();
    await migrationStarted;
    const saving = saveDisplayFont("dark", "inter");
    releaseMigration();
    const [preferences] = await Promise.all([loading, saving]);

    expect(preferences.dark.display).toBe("inter");
    expect(persisted.get("display_font_dark_v2")).toBe("inter");
  });

  // ── D-F1: one-time 1.1.0 body default migration ─────────────────────────

  const MARKER_KEY = "font_defaults_v1_1_applied";

  function fullV2Profile(mode: "light" | "dark", body: string, bodyCustom = "") {
    return [
      [`display_font_${mode}_v2`, "geist"],
      [`display_font_custom_${mode}_v2`, ""],
      [`display_chinese_fallback_${mode}_v2`, "system"],
      [`display_chinese_fallback_custom_${mode}_v2`, ""],
      [`body_font_${mode}_v2`, body],
      [`body_font_custom_${mode}_v2`, bodyCustom],
      [`body_chinese_fallback_${mode}_v2`, "system"],
      [`body_chinese_fallback_custom_${mode}_v2`, ""],
    ] as const;
  }

  function mockPersistedSettings(initial: Iterable<readonly [string, string]>) {
    const persisted = new Map<string, string>(initial);
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      const { key, value } = args as { key: string; value?: string };
      if (command === "get_setting") return persisted.get(key) ?? null;
      if (command === "set_setting") persisted.set(key, value ?? "");
      return undefined;
    });
    return persisted;
  }

  it("rewrites the persisted old jetbrains body default to geist once", async () => {
    const persisted = mockPersistedSettings([
      ...fullV2Profile("light", "jetbrains"),
      ...fullV2Profile("dark", "jetbrains"),
    ]);

    const preferences = await loadThemedFontPreferences();

    expect(preferences.light.body).toBe("geist");
    expect(preferences.dark.body).toBe("geist");
    expect(persisted.get("body_font_light_v2")).toBe("geist");
    expect(persisted.get("body_font_dark_v2")).toBe("geist");
    expect(persisted.get(MARKER_KEY)).toBe("1");
    // Only the body key is rewritten for an otherwise complete v2 profile.
    expect(invoke).not.toHaveBeenCalledWith("set_setting", {
      key: "display_font_light_v2",
      value: "geist",
    });
  });

  it("migrates a v1-only jetbrains body into geist v2 profiles", async () => {
    const persisted = mockPersistedSettings([["body_font_v1", "jetbrains"]]);

    const preferences = await loadThemedFontPreferences();

    expect(preferences.light.body).toBe("geist");
    expect(preferences.dark.body).toBe("geist");
    expect(persisted.get("body_font_light_v2")).toBe("geist");
    expect(persisted.get(MARKER_KEY)).toBe("1");
  });

  it("keeps jetbrains when a custom body family is recorded", async () => {
    const persisted = mockPersistedSettings([
      ...fullV2Profile("light", "jetbrains", "Iosevka"),
      ...fullV2Profile("dark", "jetbrains"),
    ]);

    const preferences = await loadThemedFontPreferences();

    expect(preferences.light.body).toBe("jetbrains");
    expect(preferences.light.bodyCustom).toBe("Iosevka");
    expect(persisted.get("body_font_light_v2")).toBe("jetbrains");
    expect(preferences.dark.body).toBe("geist");
  });

  it("does not run again once the marker is set", async () => {
    const persisted = mockPersistedSettings([
      ...fullV2Profile("light", "jetbrains"),
      ...fullV2Profile("dark", "jetbrains"),
      [MARKER_KEY, "1"],
    ]);

    const preferences = await loadThemedFontPreferences();

    expect(preferences.light.body).toBe("jetbrains");
    expect(preferences.dark.body).toBe("jetbrains");
    expect(persisted.get("body_font_dark_v2")).toBe("jetbrains");
    expect(invoke).not.toHaveBeenCalledWith(
      "set_setting",
      expect.objectContaining({ key: MARKER_KEY }),
    );
  });

  it("lets a body save made during migration reads win", async () => {
    let releaseReads!: () => void;
    const readsReleased = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const persisted = new Map<string, string>([
      ...fullV2Profile("light", "jetbrains"),
      ...fullV2Profile("dark", "jetbrains"),
    ]);
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      const { key, value } = args as { key: string; value?: string };
      if (command === "get_setting") {
        await readsReleased;
        return persisted.get(key) ?? null;
      }
      persisted.set(key, value ?? "");
      return undefined;
    });

    const loading = loadThemedFontPreferences();
    await saveBodyFont("dark", "jetbrains");
    releaseReads();
    const preferences = await loading;

    expect(preferences.dark.body).toBe("jetbrains");
    expect(persisted.get("body_font_dark_v2")).toBe("jetbrains");
    expect(preferences.light.body).toBe("geist");
    expect(persisted.get("body_font_light_v2")).toBe("geist");
  });

  it("serializes the migration rewrite before a newer body save", async () => {
    const persisted = new Map<string, string>([
      ...fullV2Profile("light", "jetbrains"),
      ...fullV2Profile("dark", "jetbrains"),
    ]);
    let markRewriteStarted!: () => void;
    let releaseRewrite!: () => void;
    const rewriteStarted = new Promise<void>((resolve) => {
      markRewriteStarted = resolve;
    });
    const rewriteReleased = new Promise<void>((resolve) => {
      releaseRewrite = resolve;
    });
    let blocked = false;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      const { key, value } = args as { key: string; value?: string };
      if (command === "get_setting") return persisted.get(key) ?? null;
      if (key === "body_font_dark_v2" && value === "geist" && !blocked) {
        blocked = true;
        markRewriteStarted();
        await rewriteReleased;
      }
      persisted.set(key, value ?? "");
      return undefined;
    });

    const loading = loadThemedFontPreferences();
    await rewriteStarted;
    const saving = saveBodyFont("dark", "inter");
    releaseRewrite();
    const [preferences] = await Promise.all([loading, saving]);

    expect(preferences.dark.body).toBe("inter");
    expect(persisted.get("body_font_dark_v2")).toBe("inter");
    expect(persisted.get(MARKER_KEY)).toBe("1");
  });
});
