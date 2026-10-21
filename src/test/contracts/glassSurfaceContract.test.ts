/// <reference types="node" />

import { existsSync, readdirSync, readFileSync } from "node:fs";
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
 * Files that already offended when the contract landed (C4) are listed in the
 * PENDING_* sets below. The lists may only SHRINK: a file outside its list
 * must not offend, and every listed file must still exist and still offend
 * (remove it from the list as soon as it is migrated). C9 asserts all lists
 * are empty.
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
  pending: readonly string[];
}

// Files outside src/components/ui that still carry backdrop-* utilities.
// Migrate to `.glass-sticky` / `.glass-overlay` (C5–C8), then drop the entry.
const PENDING_BACKDROP_UTILITY: readonly string[] = [
  "src/components/central/BulkActionBar.tsx",
  "src/components/central/CentralGroupedSkillList.tsx",
  "src/components/central/CentralSidebar.tsx",
  "src/components/central/FacetSection.tsx",
  "src/components/platform/PlatformGroupedSkillList.tsx",
  "src/components/platform/PlatformTransferRail.tsx",
];

// Files with arbitrary rounded-[...] values. Use the radius ladder
// (rounded-control / inner / card / shell / pill) instead.
const PENDING_ARBITRARY_ROUNDED: readonly string[] = [
  "src/components/central/CentralSidebar.tsx",
];

// Files with raw bg-white/<n> or bg-black/<n> washes. Use surface tokens.
const PENDING_RAW_WHITE_BLACK: readonly string[] = [
];

// Files with the legacy card recipe. Use <Card> or `glass-panel rounded-card`.
const PENDING_HANDWRITTEN_SURFACE: readonly string[] = [
  "src/components/central/BatchDeleteCentralSkillsDialog.tsx",
  "src/components/central/BatchUninstallCentralSkillsDialog.tsx",
  "src/components/central/CentralRepositorySyncDialog.tsx",
  "src/components/central/CentralRepositorySyncPanels.tsx",
  "src/components/central/CentralSkillEmptyStates.tsx",
  "src/components/central/CentralUpdateConfirmDialog.tsx",
  "src/components/central/DeleteCentralSkillDialog.tsx",
  "src/components/central/RemoteMissingSkillsDialog.tsx",
  "src/components/central/UpdateCenterDialog.tsx",
  "src/components/central/repositorySyncPanelControls.tsx",
  "src/components/central/updateCenter/OrphansTabPanel.tsx",
  "src/components/central/updateCenter/PlatformDuplicatesTabPanel.tsx",
  "src/components/platform/BatchDeletePlatformSkillsDialog.tsx",
  "src/components/settings/AboutSettingsSection.tsx",
  "src/components/settings/LocalRemoteSyncDialog.tsx",
  "src/components/settings/RemoteTargetsSettingsSection.tsx",
  "src/components/skill/SkillDetailModalShell.tsx",
];

// Files importing @base-ui/react/menu|dialog outside src/components/ui.
// Use ui/menu, ui/sheet or ui/dialog.
const PENDING_DIRECT_BASE_UI: readonly string[] = [
  "src/components/central/CategorizeDrawer.tsx",
  "src/components/central/CentralPlatformManageDrawer.tsx",
  "src/components/central/CentralSkillsShellMenus.tsx",
  "src/components/central/SkillImportLauncher.tsx",
  "src/components/central/TaskCenterDrawer.tsx",
  "src/components/platform/PlatformSkillToolbarMenus.tsx",
  "src/components/skill/SkillDetailModalShell.tsx",
  "src/components/skillsCli/SkillsCliBatchBar.tsx",
  "src/components/skillsCli/SkillsCliDetailDrawer.tsx",
  "src/components/skillsCli/SkillsCliUpdateDrawer.tsx",
];

// Initial sizes when the contract landed (C4, 2026-10-21). Never raise these;
// lower them as entries are migrated. C9 sets every ceiling to 0.
// C5 (app shell): SidebarSection migrated → legacy card 20→19, base-ui 12→11.
// C6 (signature surfaces): ActivityHeatmap, RuntimeLogsPanel, OperationLogsView,
// CompactCardMoreMenu migrated → rounded 2→1, legacy card 19→17, base-ui 11→10.
const PENDING_CEILING: Record<string, number> = {
  "backdrop-* utility": 6,
  "arbitrary rounded-[...]": 1,
  "raw bg-white/ or bg-black/": 0,
  "legacy card recipe": 17,
  "direct @base-ui/react/menu|dialog import": 10,
};

const RULES: Rule[] = [
  {
    name: "backdrop-* utility",
    offends: ({ content }) => BACKDROP_UTILITY.test(content),
    pending: PENDING_BACKDROP_UTILITY,
  },
  {
    name: "arbitrary rounded-[...]",
    offends: ({ content }) => ARBITRARY_ROUNDED.test(content),
    pending: PENDING_ARBITRARY_ROUNDED,
  },
  {
    name: "raw bg-white/ or bg-black/",
    offends: ({ content }) => RAW_WHITE_BLACK.test(content),
    pending: PENDING_RAW_WHITE_BLACK,
  },
  {
    name: "legacy card recipe",
    offends: ({ content }) => hasLegacyCardRecipe(content),
    pending: PENDING_HANDWRITTEN_SURFACE,
  },
  {
    name: "direct @base-ui/react/menu|dialog import",
    offends: ({ path, content }) =>
      !path.startsWith(UI_ROOT) && DIRECT_BASE_UI.test(content),
    pending: PENDING_DIRECT_BASE_UI,
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
    describe(rule.name, () => {
      it("no file outside the pending list offends", () => {
        const pending = new Set<string>(rule.pending);
        const offenders = PRODUCTION_FILES.filter(
          (file) => !pending.has(file.path) && rule.offends(file),
        ).map((file) => file.path);
        expect(
          offenders,
          `New ${rule.name} offenders (migrate them, do not grow the list):\n${offenders.join("\n")}`,
        ).toEqual([]);
      });

      it("pending list only shrinks: every entry exists and still offends", () => {
        const stale = rule.pending.filter((path) => {
          if (!existsSync(resolve(ROOT, path))) return true;
          const file = PRODUCTION_FILES.find((entry) => entry.path === path);
          return !file || !rule.offends(file);
        });
        expect(
          stale,
          `Remove migrated / deleted entries from the ${rule.name} pending list:\n${stale.join("\n")}`,
        ).toEqual([]);
      });

      it("pending list never grows past its landing size", () => {
        expect(PENDING_CEILING[rule.name]).toBeDefined();
        expect(rule.pending.length).toBeLessThanOrEqual(
          PENDING_CEILING[rule.name]!,
        );
        expect(new Set(rule.pending).size).toBe(rule.pending.length);
      });

      it("never lists primitives under src/components/ui", () => {
        expect(rule.pending.filter((path) => path.startsWith(UI_ROOT))).toEqual(
          [],
        );
      });
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
