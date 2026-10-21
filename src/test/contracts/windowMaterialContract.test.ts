import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Window material contract (C3, DESIGN.md "Window Material (Mica)").
 *
 * - Without `html[data-window-material="mica"]` the canvas is fully opaque:
 *   the window is transparent at the native layer, so an opaque page is the
 *   only thing that prevents see-through on Windows 10 / failed requests.
 * - Under Mica the canvas gradient keeps alpha >= 0.80 (DESIGN.md Known Gaps)
 *   and every text role still clears 4.5:1 on representative Mica bases.
 */

const ROOT = process.cwd();
const INDEX_CSS = readFileSync(resolve(ROOT, "src/index.css"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const CSS_WITHOUT_COMMENTS = INDEX_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const TAURI_CONF = JSON.parse(
  readFileSync(resolve(ROOT, "src-tauri/tauri.conf.json"), "utf8"),
) as {
  app: { windows: Array<{ transparent?: boolean; backgroundColor?: string }> };
};

const MICA = 'html[data-window-material="mica"]';
const MIN_MICA_CANVAS_ALPHA = 0.8;
const MIN_TEXT = 4.5;

/** DESIGN.md Known Gaps: representative Mica base colours. */
const MICA_BASES = {
  "glass-light": ["#f3f3f3", "#e9edf3", "#f1ece6"],
  "glass-dark": ["#202020", "#1b2230", "#262019"],
} as const;

type Rgb = readonly [number, number, number];
interface Rgba {
  rgb: Rgb;
  alpha: number;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every `{ ... }` body whose selector list is exactly `selector`. */
function blocksFor(selector: string): string[] {
  const pattern = new RegExp(
    `(?:^|[}\\n])\\s*${escapeRegExp(selector)}\\s*\\{(?<body>[^}]*)\\}`,
    "g",
  );
  return [...INDEX_CSS.matchAll(pattern)].map((match) => match.groups!.body!);
}

function onlyBlock(selector: string): string {
  const blocks = blocksFor(selector);
  expect(blocks, selector).toHaveLength(1);
  return blocks[0]!;
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

function over(top: Rgba, bottom: Rgb): Rgb {
  return top.rgb.map(
    (channel, index) => top.alpha * channel + (1 - top.alpha) * bottom[index]!,
  ) as unknown as Rgb;
}

function luminance(rgb: Rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(a: Rgb, b: Rgb) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function radialGeometry(value: string) {
  return [...value.matchAll(/radial-gradient\(([^,]+),/g)].map((match) =>
    match[1]!.trim(),
  );
}

/** First `.glass-canvas {` block is the default (layered) canvas rule. */
function defaultCanvasBlock(): string {
  const match = INDEX_CSS.match(/\n\s*\.glass-canvas\s*\{(?<body>[^}]*)\}/);
  if (!match?.groups?.body) throw new Error("Missing .glass-canvas");
  return match.groups.body;
}

describe("window material contract", () => {
  it("keeps the default canvas and body fully opaque in both themes", () => {
    const canvas = defaultCanvasBlock();
    expect(declaration(canvas, "background-color")).toBe("var(--background)");
    const image = declaration(canvas, "background-image");
    expect(image).toMatch(
      /linear-gradient\(\s*135deg,\s*var\(--canvas-from\) 0%,\s*var\(--canvas-to\) 100%\s*\)/,
    );
    expect(image).not.toMatch(/color-mix|transparent\s*\)\s*$/);
    expect(INDEX_CSS).toMatch(/\n\s*body\s*\{[^}]*@apply bg-background/);

    for (const theme of ["glass-light", "glass-dark"] as const) {
      const block = onlyBlock(`[data-theme="${theme}"]`);
      for (const name of ["--background", "--canvas-from", "--canvas-to"]) {
        expect(themeColor(block, name).alpha, `${theme} ${name}`).toBe(1);
      }
    }
  });

  it("only the mica marker relaxes opacity; none / missing has no override", () => {
    const selectors = [
      ...CSS_WITHOUT_COMMENTS.matchAll(/[^{}]*data-window-material[^{}]*\{/g),
    ].map((match) => match[0]);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).not.toMatch(/data-window-material\s*=\s*"none"/);
      expect(selector).not.toMatch(/data-window-material\]/);
      for (const marker of selector.matchAll(/data-window-material="(\w+)"/g)) {
        expect(marker[1]).toBe("mica");
      }
    }
  });

  it("makes the page transparent and the canvas >= 80% opaque under Mica", () => {
    const page = onlyBlock(`${MICA},\n${MICA} body`);
    expect(declaration(page, "background")).toBe("transparent");

    const canvas = onlyBlock(`${MICA} .glass-canvas`);
    expect(declaration(canvas, "background-color")).toBe("transparent");
    const image = declaration(canvas, "background-image");
    const mixes = [
      ...image.matchAll(
        /color-mix\(in srgb,\s*var\((--canvas-(?:from|to))\)\s+([\d.]+)%,\s*transparent\)/g,
      ),
    ];
    expect(mixes.map((match) => match[1])).toEqual([
      "--canvas-from",
      "--canvas-to",
    ]);
    for (const match of mixes) {
      expect(Number(match[2]) / 100).toBeGreaterThanOrEqual(
        MIN_MICA_CANVAS_ALPHA,
      );
    }
    expect(radialGeometry(image)).toEqual(
      radialGeometry(declaration(defaultCanvasBlock(), "background-image")),
    );
  });

  it("keeps text >= 4.5:1 on panels over the Mica canvas", () => {
    for (const theme of ["glass-light", "glass-dark"] as const) {
      const block = onlyBlock(`[data-theme="${theme}"]`);
      const color = (name: string) => themeColor(block, name);
      const samples = MICA_BASES[theme].flatMap((hex) => {
        const base = parseColor(hex).rgb;
        return ["--canvas-from", "--canvas-to"].flatMap((end) => {
          const canvas = over(
            { rgb: color(end).rgb, alpha: MIN_MICA_CANVAS_ALPHA },
            base,
          );
          const withBlobs = [
            "--canvas-blob-1",
            "--canvas-blob-2",
            "--canvas-blob-3",
          ].map((blob) => over(color(blob), canvas));
          return [canvas, ...withBlobs];
        });
      });
      const surfaces = samples.flatMap((sample) =>
        ["--card", "--sidebar", "--popover"].map((surface) =>
          over(color(surface), sample),
        ),
      );
      for (const text of ["--foreground", "--muted-foreground"]) {
        const ink = color(text).rgb;
        const ratio = Math.min(
          ...surfaces.map((surface) => contrast(ink, surface)),
        );
        expect(ratio, `${theme} ${text}`).toBeGreaterThanOrEqual(MIN_TEXT);
      }
    }
  });

  it("creates a transparent native window that keeps the glass fallback colour", () => {
    const window = TAURI_CONF.app.windows[0];
    expect(window?.transparent).toBe(true);
    expect(window?.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
