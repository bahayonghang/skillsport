import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const INDEX_CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

const THEME_SWITCH_RULE =
  /html\[data-theme-switching\],\s*html\[data-theme-switching\] \*,\s*html\[data-theme-switching\] \*::before,\s*html\[data-theme-switching\] \*::after\s*\{(?<body>[^}]*)\}/g;

function isAtRuleStart(css: string, index: number): boolean {
  const previous = index === 0 ? "" : css[index - 1];
  return previous === "" || !/[\w-]/.test(previous);
}

/** How many @layer blocks enclose `index`. Zero means the rule is unlayered. */
function enclosingLayerDepth(css: string, index: number): number {
  let depth = 0;
  const layerDepths: number[] = [];

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (css.startsWith("@layer", cursor) && isAtRuleStart(css, cursor)) {
      const open = css.indexOf("{", cursor);
      const semicolon = css.indexOf(";", cursor);
      if (open !== -1 && open < index && (semicolon === -1 || open < semicolon)) {
        layerDepths.push(depth + 1);
      }
    }

    if (css[cursor] === "{") {
      depth += 1;
    } else if (css[cursor] === "}") {
      depth -= 1;
      while (
        layerDepths.length > 0 &&
        layerDepths[layerDepths.length - 1]! > depth
      ) {
        layerDepths.pop();
      }
    }
  }

  return layerDepths.length;
}

describe("theme switch suppression", () => {
  it("disables transitions for html, descendants, and pseudo-elements outside @layer", () => {
    const matches = [...INDEX_CSS.matchAll(THEME_SWITCH_RULE)];
    expect(matches).toHaveLength(1);

    const match = matches[0];
    expect(match?.index).toEqual(expect.any(Number));
    expect(enclosingLayerDepth(INDEX_CSS, match?.index ?? 0)).toBe(0);

    const body = match?.groups?.body ?? "";
    expect(body).toMatch(/transition:\s*none\s*!important\s*;/);
    expect(body).not.toMatch(/animation/);
  });
});
