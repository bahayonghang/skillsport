/// <reference types="node" />

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Light Glass surface contract (DESIGN.md "Elevation & Depth" / "Shapes",
 * C4 design D-P1 / D-P6 / D-P7, spec `.trellis/spec/frontend/glass-surfaces.md`).
 *
 * - Real blur only lives in `src/index.css` inside `.glass-overlay` and
 *   `.glass-sticky`; production TS/TSX never writes `backdrop-*` utilities.
 * - No arbitrary `rounded-[...]`, no raw `bg-white/` / `bg-black/` washes.
 * - No legacy hand-written card recipe (`rounded-xl|2xl|3xl` together with
 *   `ring-1 ring-border` or `border border-border` in one class string).
 * - Menus / drawers go through `ui/menu` / `ui/sheet` / `ui/dialog`, not
 *   `@base-ui/react/menu|dialog` directly.
 *
 * The C4 migration allow-lists (PENDING_*) and their ceilings were retired in
 * C9 once every list reached zero: no production file may offend any rule.
 */

const ROOT = process.cwd();
const SRC = resolve(ROOT, "src");
const TEST_ROOT = resolve(SRC, "test");
const UI_ROOT = "src/components/ui/";

function walk(dir: string): string[] {
  const entries: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (ext === ".ts" || ext === ".tsx") entries.push(full);
      }
    }
  }
  return entries.sort();
}

const PRODUCTION_FILES = walk(SRC)
  .filter((file) => !resolve(file).startsWith(TEST_ROOT))
  .map((file) => ({
    path: relative(ROOT, file).replace(/\\/g, "/"),
    content: readFileSync(file, "utf8"),
  }));

const INDEX_CSS = readFileSync(resolve(SRC, "index.css"), "utf8");

// ─── Rules ───────────────────────────────────────────────────────────────────

const BACKDROP_UTILITY = /(?<![\w-])backdrop-[\w[]/;
const ARBITRARY_ROUNDED = /(?<![\w-])rounded(?:-[a-z]+)?-\[/;
const RAW_WHITE_BLACK = /(?<![\w-])bg-(?:white|black)\//;
const DIRECT_BASE_UI = /from\s+["']@base-ui\/react\/(?:menu|dialog)["']/;
const STRING_LITERAL = /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
const LARGE_ROUNDED = new Set(["rounded-xl", "rounded-2xl", "rounded-3xl"]);

/** Old card recipe: one class string with a large radius + border/ring-border. */
function hasLegacyCardRecipe(content: string): boolean {
  for (const match of content.matchAll(STRING_LITERAL)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    const tokens = new Set(value.split(/\s+/).filter(Boolean));
    if (![...tokens].some((token) => LARGE_ROUNDED.has(token))) continue;
    const ringRecipe = tokens.has("ring-1") && tokens.has("ring-border");
    const borderRecipe = tokens.has("border") && tokens.has("border-border");
    if (ringRecipe || borderRecipe) return true;
  }
  return false;
}

interface Rule {
  name: string;
  offends: (file: { path: string; content: string }) => boolean;
}

const RULES: Rule[] = [
  {
    name: "backdrop-* utility",
    offends: ({ content }) => BACKDROP_UTILITY.test(content),
  },
  {
    name: "arbitrary rounded-[...]",
    offends: ({ content }) => ARBITRARY_ROUNDED.test(content),
  },
  {
    name: "raw bg-white/ or bg-black/",
    offends: ({ content }) => RAW_WHITE_BLACK.test(content),
  },
  {
    name: "legacy card recipe",
    offends: ({ content }) => hasLegacyCardRecipe(content),
  },
  {
    name: "direct @base-ui/react/menu|dialog import",
    offends: ({ path, content }) =>
      !path.startsWith(UI_ROOT) && DIRECT_BASE_UI.test(content),
  },
];

// ─── CSS helpers ─────────────────────────────────────────────────────────────

/** Top-level-ish rule blocks: `selector { body }` without nested braces. */
function cssRuleBlocks(css: string) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of withoutComments.matchAll(re)) {
    blocks.push({ selector: match[1].trim(), body: match[2] });
  }
  return blocks;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("glass surface contract", () => {
  it("scans production TS/TSX files", () => {
    expect(PRODUCTION_FILES.length).toBeGreaterThan(100);
  });

  for (const rule of RULES) {
    it(`has no ${rule.name} offenders in production code`, () => {
      const offenders = PRODUCTION_FILES.filter((file) => rule.offends(file)).map(
        (file) => file.path,
      );
      expect(
        offenders,
        `${rule.name} offenders (migrate them to primitives / tokens):\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }

  it("keeps real blur inside .glass-overlay / .glass-sticky only", () => {
    const offenders = cssRuleBlocks(INDEX_CSS)
      .filter(({ body }) => /backdrop-filter\s*:/.test(body))
      .map(({ selector }) => selector)
      .filter((selector) => selector !== ".glass-overlay" && selector !== ".glass-sticky");
    expect(offenders).toEqual([]);
    const blurBlocks = cssRuleBlocks(INDEX_CSS)
      .filter(({ body }) => /backdrop-filter\s*:/.test(body))
      .map(({ selector }) => selector);
    expect(blurBlocks.sort()).toEqual([".glass-overlay", ".glass-sticky"]);
  });

  it("does not generate canvas blobs with filter: blur", () => {
    const canvas = cssRuleBlocks(INDEX_CSS).find(
      ({ selector }) => selector === ".glass-canvas",
    );
    expect(canvas).toBeDefined();
    expect(canvas!.body).not.toMatch(/(?<!backdrop-)filter\s*:/);
  });
});
