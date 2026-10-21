import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Light Glass contrast contract (DESIGN.md "Known Gaps", C2 design D-T3).
 *
 * Surfaces are translucent, so every pair is measured on the colour the
 * browser actually paints: sRGB source-over compositing, the same model
 * Chromium / WebView2 uses for `rgb(r g b / a)` fills.
 *
 *   canvas samples = canvas-from, canvas-to, and each blob (its own alpha)
 *                    over BOTH gradient ends (lavender blob over canvas-to is
 *                    the darkest light-theme point)
 *   surfaces       = card (panel) / sidebar / popover (overlay) over every
 *                    canvas sample
 *   tints          = each 12% tint over every panel, sidebar and overlay
 *                    composite
 *
 * Light themes take the minimum ratio over all composites (darkest point is
 * worst for dark ink); dark themes do the same (brightest point is worst for
 * light ink). Tints are explicit rgb() tokens, so no oklch approximation is
 * involved.
 */

const ROOT = process.cwd();
const INDEX_CSS = readFileSync(resolve(ROOT, "src/index.css"), "utf8");
const TAURI_CONF = JSON.parse(
  readFileSync(resolve(ROOT, "src-tauri/tauri.conf.json"), "utf8"),
) as { app: { windows: Array<{ backgroundColor?: string }> } };

const MIN_TEXT = 4.5;
const MIN_NON_TEXT = 3;
const THEMES = ["glass-light", "glass-dark"] as const;
type ThemeName = (typeof THEMES)[number];

type Rgb = readonly [number, number, number];
interface Rgba {
  rgb: Rgb;
  alpha: number;
}

// ─── CSS parsing ─────────────────────────────────────────────────────────────

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cssBlock(selector: string, css = INDEX_CSS) {
  const match = css.match(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{(?<body>[^}]*)\\}`, "m"),
  );
  if (!match?.groups?.body) {
    throw new Error(`Missing CSS selector: ${selector}`);
  }
  return match.groups.body;
}

function declaration(block: string, name: string): string {
  const match = block.match(
    new RegExp(`(?:^|[;\\s])${escapeRegExp(name)}\\s*:\\s*([^;]+);`),
  );
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`Missing declaration ${name}`);
  return value;
}

function parseColor(value: string): Rgba {
  const normalized = value.trim().toLowerCase();
  const hex = normalized.match(/^#([0-9a-f]{6})$/);
  if (hex?.[1]) {
    const digits = hex[1];
    return {
      rgb: [0, 2, 4].map((index) =>
        Number.parseInt(digits.slice(index, index + 2), 16),
      ) as unknown as Rgb,
      alpha: 1,
    };
  }
  const rgb = normalized.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+)\s*)?\)$/,
  );
  if (rgb) {
    return {
      rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])],
      alpha: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  throw new Error(`Unsupported colour value: ${value}`);
}

function themeColor(block: string, name: string): Rgba {
  const value = declaration(block, name);
  const reference = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  return reference ? themeColor(block, reference) : parseColor(value);
}

// ─── Colour math ─────────────────────────────────────────────────────────────

function over(top: Rgba, bottom: Rgb): Rgb {
  return top.rgb.map(
    (channel, index) => top.alpha * channel + (1 - top.alpha) * bottom[index]!,
  ) as unknown as Rgb;
}

function linearize(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb) {
  const [red, green, blue] = rgb.map(linearize) as [number, number, number];
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(a: Rgb, b: Rgb) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function minContrast(foreground: Rgb, backgrounds: readonly Rgb[]) {
  return Math.min(...backgrounds.map((bg) => contrast(foreground, bg)));
}

function opaque(color: Rgba, label: string): Rgb {
  expect(color.alpha, `${label} must be opaque`).toBe(1);
  return color.rgb;
}

// ─── Theme model ─────────────────────────────────────────────────────────────

function themeModel(theme: ThemeName) {
  const block = cssBlock(`[data-theme="${theme}"]`);
  const color = (name: string) => themeColor(block, name);
  const solid = (name: string) => opaque(color(name), `${theme} ${name}`);

  const ends = [solid("--canvas-from"), solid("--canvas-to")];
  const blobs = ["--canvas-blob-1", "--canvas-blob-2", "--canvas-blob-3"].map(
    color,
  );
  const canvas: Rgb[] = [
    ...ends,
    ...blobs.flatMap((blob) => ends.map((end) => over(blob, end))),
  ];
  const compose = (name: string, beneath: readonly Rgb[]) =>
    beneath.map((rgb) => over(color(name), rgb));

  const panel = compose("--card", canvas);
  const sidebar = compose("--sidebar", canvas);
  const overlay = compose("--popover", canvas);
  const tintNames = {
    mint: "--primary-tint",
    lavender: "--secondary-accent-tint",
    amber: "--warning-tint",
    rose: "--destructive-tint",
  } as const;
  const tints = Object.fromEntries(
    Object.entries(tintNames).map(([key, name]) => [
      key,
      compose(name, [...panel, ...sidebar, ...overlay]),
    ]),
  ) as Record<keyof typeof tintNames, Rgb[]>;

  return {
    block,
    color,
    solid,
    canvas,
    surfaces: {
      canvas,
      panel,
      sidebar,
      overlay,
      "panel+hover": compose("--muted", panel),
      "sidebar+hover": compose("--sidebar-accent", sidebar),
      "overlay+hover": compose("--accent", overlay),
      "mint-tint": tints.mint,
      "lavender-tint": tints.lavender,
      "amber-tint": tints.amber,
      "rose-tint": tints.rose,
    },
    panel,
    overlay,
    inputWell: compose("--input-surface", [...panel, ...overlay]),
  };
}

const TEXT_ROLES = [
  "--foreground",
  "--card-foreground",
  "--popover-foreground",
  "--sidebar-foreground",
  "--muted-foreground",
  "--primary-text",
  "--success-foreground",
  "--secondary-accent-text",
  "--info-foreground",
  "--warning-foreground",
  "--destructive-text",
] as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("theme token surface", () => {
  it("ships exactly the two Light Glass theme blocks", () => {
    const themeSelectors = [
      ...INDEX_CSS.matchAll(/\[data-theme="([\w-]+)"\]\s*\{/g),
    ].map((match) => match[1]);
    expect(themeSelectors).toEqual(["glass-light", "glass-dark"]);
    expect(INDEX_CSS).not.toMatch(/data-accent|--ctp-/);
  });

  it("routes the dark variant to glass-dark only", () => {
    expect(INDEX_CSS).toContain(
      "@custom-variant dark (&:is([data-theme='glass-dark'] *));",
    );
  });

  it("registers the glass utilities on the Tailwind theme boundary", () => {
    const themeInline = cssBlock("@theme inline");
    for (const line of [
      "--color-primary-text: var(--primary-text);",
      "--color-primary-tint: var(--primary-tint);",
      "--color-primary-hover: var(--primary-hover);",
      "--color-primary-stroke: var(--primary-stroke);",
      "--color-secondary-accent: var(--secondary-accent);",
      "--color-secondary-accent-text: var(--secondary-accent-text);",
      "--color-secondary-accent-tint: var(--secondary-accent-tint);",
      "--color-warning-tint: var(--warning-tint);",
      "--color-destructive-tint: var(--destructive-tint);",
      "--color-glass-stroke: var(--glass-stroke);",
      "--color-glass-hairline: var(--glass-hairline);",
      "--color-input-surface: var(--input-surface);",
      "--radius-control: var(--radius-control);",
      "--radius-inner: var(--radius-inner);",
      "--radius-card: var(--radius-card);",
      "--radius-shell: var(--radius-shell);",
      "--radius-pill: var(--radius-pill);",
      "--shadow-glass: var(--shadow-glass);",
      "--shadow-glass-hover: var(--shadow-glass-hover);",
      "--shadow-overlay: var(--shadow-overlay);",
      "--text-display-stat: 1.75rem;",
    ]) {
      expect(themeInline).toContain(line);
    }
  });

  it("keeps the DESIGN.md radius ladder concentric", () => {
    const root = cssBlock(":root");
    const px = (name: string) => Number.parseFloat(declaration(root, name));
    expect(px("--radius-control")).toBe(12);
    expect(px("--radius-inner")).toBe(14);
    expect(px("--radius-card")).toBe(18);
    expect(px("--radius-shell")).toBe(20);
    expect(px("--radius-pill")).toBe(9999);
  });

  it("limits backdrop-filter to the .glass-overlay and .glass-sticky blocks", () => {
    const owners = [...INDEX_CSS.matchAll(/([^{}]+)\{[^}]*backdrop-filter[^}]*\}/g)]
      .map((match) => match[1]!.trim());
    expect(owners).toEqual([".glass-overlay", ".glass-sticky"]);
    expect(INDEX_CSS).not.toMatch(/(?<!backdrop-)filter:\s*blur/);
  });

  it.each(THEMES)("%s keeps the canvas, background and fills opaque", (theme) => {
    const model = themeModel(theme);
    for (const name of [
      "--canvas-from",
      "--canvas-to",
      "--background",
      "--primary",
      "--ring",
    ]) {
      model.solid(name);
    }
  });
});

describe("theme contrast (composited)", () => {
  it.each(THEMES)("%s text roles reach AA on every composited surface", (theme) => {
    const model = themeModel(theme);
    const failures: string[] = [];
    for (const role of TEXT_ROLES) {
      const fg = model.solid(role);
      for (const [surface, backgrounds] of Object.entries(model.surfaces)) {
        const ratio = minContrast(fg, backgrounds);
        if (ratio < MIN_TEXT) {
          failures.push(`${theme} ${role} on ${surface}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it.each(THEMES)("%s placeholders stay readable inside input wells", (theme) => {
    const model = themeModel(theme);
    expect(
      minContrast(model.solid("--muted-foreground"), model.inputWell),
    ).toBeGreaterThanOrEqual(MIN_TEXT);
  });

  it.each(THEMES)("%s fills carry readable foregrounds", (theme) => {
    const model = themeModel(theme);
    const pairs: Array<[string, string]> = [
      ["--primary-foreground", "--primary"],
      ["--primary-foreground", "--primary-hover"],
      ["--sidebar-primary-foreground", "--sidebar-primary"],
      ["--destructive-foreground", "--destructive"],
    ];
    for (const [fg, bg] of pairs) {
      expect(
        contrast(model.solid(fg), model.solid(bg)),
        `${theme} ${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(MIN_TEXT);
    }
    // Startup splash and no-gradient fallback sit on the opaque background.
    for (const role of ["--foreground", "--muted-foreground"]) {
      expect(
        contrast(model.solid(role), model.solid("--background")),
        `${theme} ${role} on background`,
      ).toBeGreaterThanOrEqual(MIN_TEXT);
    }
  });

  it.each(THEMES)("%s focus ring, input stroke and charts reach 3:1", (theme) => {
    const model = themeModel(theme);
    const ring = model.solid("--ring");
    expect(minContrast(ring, model.panel)).toBeGreaterThanOrEqual(MIN_NON_TEXT);
    expect(minContrast(ring, model.overlay)).toBeGreaterThanOrEqual(MIN_NON_TEXT);

    const input = model.color("--input");
    for (const well of model.inputWell) {
      expect(contrast(over(input, well), well)).toBeGreaterThanOrEqual(
        MIN_NON_TEXT,
      );
    }

    for (const chart of ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"]) {
      expect(
        minContrast(model.solid(chart), model.panel),
        `${theme} ${chart} on panel`,
      ).toBeGreaterThanOrEqual(MIN_NON_TEXT);
    }
  });
});

describe("tag palette contrast (composited)", () => {
  // src/lib/tagColor.ts low-saturation hues: text on its own 12% tint laid
  // over every panel / sidebar / overlay composite; the hue itself (repo dots)
  // is a non-text graphic on panels.
  const TAG_HUES = ["sky", "slate", "plum"] as const;

  it.each(THEMES)("%s tag text reaches AA on its tint", (theme) => {
    const model = themeModel(theme);
    const failures: string[] = [];
    const bases = [
      ...model.surfaces.panel,
      ...model.surfaces.sidebar,
      ...model.surfaces.overlay,
    ];
    for (const hue of TAG_HUES) {
      const text = model.solid(`--tag-${hue}-text`);
      const tint = model.color(`--tag-${hue}-tint`);
      const tinted = bases.map((rgb) => over(tint, rgb));
      const ratio = minContrast(text, tinted);
      if (ratio < MIN_TEXT) {
        failures.push(`${theme} --tag-${hue}-text on tint: ${ratio.toFixed(2)}:1`);
      }
      const dot = minContrast(text, model.panel);
      if (dot < MIN_NON_TEXT) {
        failures.push(`${theme} --tag-${hue}-text dot on panel: ${dot.toFixed(2)}:1`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("registers the tag utilities on the Tailwind theme boundary", () => {
    const themeInline = cssBlock("@theme inline");
    for (const hue of TAG_HUES) {
      expect(themeInline).toContain(`--color-tag-${hue}-text: var(--tag-${hue}-text);`);
      expect(themeInline).toContain(`--color-tag-${hue}-tint: var(--tag-${hue}-tint);`);
    }
  });
});

describe("startup splash literals", () => {
  function startupBlocks() {
    const darkMedia = INDEX_CSS.indexOf("@media (prefers-color-scheme: dark)");
    expect(darkMedia).toBeGreaterThan(-1);
    const light = INDEX_CSS.slice(0, darkMedia);
    const dark = INDEX_CSS.slice(darkMedia);
    return {
      "glass-light": {
        shell: cssBlock(".startup-shell", light),
        card: cssBlock(".startup-card", light),
      },
      "glass-dark": {
        shell: cssBlock(".startup-shell", dark),
        card: cssBlock(".startup-card", dark),
      },
    } as const;
  }

  function colorsIn(value: string): Rgba[] {
    return [...value.matchAll(/#[0-9a-fA-F]{6}|rgba?\([^)]*\)/g)].map((match) =>
      parseColor(match[0]),
    );
  }

  it.each(THEMES)("%s splash literals equal the theme tokens", (theme) => {
    const { block } = themeModel(theme);
    const token = (name: string) => themeColor(block, name);
    const { shell, card } = startupBlocks()[theme];

    expect(parseColor(declaration(shell, "background-color"))).toEqual(
      token("--background"),
    );
    expect(parseColor(declaration(shell, "color"))).toEqual(token("--foreground"));
    expect(colorsIn(declaration(shell, "background-image"))).toEqual([
      token("--canvas-blob-1"),
      token("--canvas-blob-2"),
      token("--canvas-blob-3"),
      token("--canvas-from"),
      token("--canvas-to"),
    ]);
    expect(parseColor(declaration(card, "background"))).toEqual(token("--card"));
    const border = declaration(card, theme === "glass-light" ? "border" : "border-color");
    expect(colorsIn(border)).toEqual([token("--glass-stroke")]);
  });

  it("uses the same blob geometry for the splash and .glass-canvas", () => {
    const geometry = (value: string) =>
      [...value.matchAll(/radial-gradient\(([^,]+),/g)].map((match) => match[1]!.trim());
    const canvas = geometry(declaration(cssBlock(".glass-canvas"), "background-image"));
    expect(canvas).toHaveLength(3);
    expect(geometry(declaration(startupBlocks()["glass-light"].shell, "background-image")))
      .toEqual(canvas);
  });

  it("paints the native window with the glass background before the webview", () => {
    const light = themeColor(cssBlock('[data-theme="glass-light"]'), "--background");
    const windowColor = TAURI_CONF.app.windows[0]?.backgroundColor ?? "";
    expect(parseColor(windowColor)).toEqual(light);
  });
});
