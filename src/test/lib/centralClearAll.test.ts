import { describe, expect, it } from "vitest";

import {
  centralClearFixturePreview,
  centralClearFixtureResult,
} from "@/fixtures/centralClear";
import {
  buildClearCentralRequest,
  clearCentralFailedCount,
  clearCentralSucceededCount,
  clearTargetLabel,
  countSelectedResidue,
  createDefaultClearCentralOptions,
  hasClearCentralWork,
  isClearCentralPreviewEmpty,
  matchesClearConfirmPhrase,
} from "@/lib/centralClearAll";
import type { TFunction } from "i18next";

describe("buildClearCentralRequest", () => {
  it("sends every preview key with default options and no copy agents", () => {
    const preview = centralClearFixturePreview("normal");
    const request = buildClearCentralRequest(preview, createDefaultClearCentralOptions());
    expect(request).toEqual({
      previewId: preview.previewId,
      skillIds: preview.skillIds,
      removeCopyAgentIds: [],
      projectLinkKeys: preview.projectLinks.map((item) => item.key),
      orphanLinkKeys: preview.orphanLinks.map((item) => item.key),
      untrackedEntryKeys: preview.untrackedCentralEntries.map((item) => item.key),
    });
  });

  it("sends [] for a disabled category", () => {
    const preview = centralClearFixturePreview("normal");
    const request = buildClearCentralRequest(preview, {
      ...createDefaultClearCentralOptions(),
      includeProjectLinks: false,
      includeOrphanLinks: false,
      includeUntrackedEntries: false,
    });
    expect(request.projectLinkKeys).toEqual([]);
    expect(request.orphanLinkKeys).toEqual([]);
    expect(request.untrackedEntryKeys).toEqual([]);
    expect(request.skillIds).toEqual(preview.skillIds);
  });

  it("sends the wildcard only for a truncated, enabled category", () => {
    const preview = centralClearFixturePreview("truncated");
    const on = buildClearCentralRequest(preview, createDefaultClearCentralOptions());
    expect(on.orphanLinkKeys).toEqual(["*"]);
    expect(on.projectLinkKeys).toEqual([]);
    expect(on.skillIds).toEqual(["frontend-design"]);

    const off = buildClearCentralRequest(preview, {
      ...createDefaultClearCentralOptions(),
      includeOrphanLinks: false,
    });
    expect(off.orphanLinkKeys).toEqual([]);
  });

  it("keeps only checked agents that actually have copy installs", () => {
    const preview = centralClearFixturePreview("normal");
    const request = buildClearCentralRequest(preview, {
      ...createDefaultClearCentralOptions(),
      removeCopyAgentIds: ["cursor", "claude-code", "unknown"],
    });
    expect(request.removeCopyAgentIds).toEqual(["cursor"]);
  });
});

describe("clear-all helpers", () => {
  it("treats the empty fixture as nothing to clear", () => {
    const empty = centralClearFixturePreview("empty");
    expect(isClearCentralPreviewEmpty(empty)).toBe(true);
    expect(hasClearCentralWork(empty, createDefaultClearCentralOptions())).toBe(false);
    expect(isClearCentralPreviewEmpty(centralClearFixturePreview("orphanOnly"))).toBe(false);
  });

  it("counts residue by enabled category and detects no-op selections", () => {
    const preview = centralClearFixturePreview("orphanOnly");
    const options = createDefaultClearCentralOptions();
    expect(countSelectedResidue(preview, options)).toBe(2);
    expect(hasClearCentralWork(preview, { ...options, includeOrphanLinks: false })).toBe(false);
  });

  it("matches the confirmation phrase trimmed and case-insensitively", () => {
    expect(matchesClearConfirmPhrase("  Clear Central ", "clear central")).toBe(true);
    expect(matchesClearConfirmPhrase("清空中央仓库", "清空中央仓库")).toBe(true);
    expect(matchesClearConfirmPhrase("clear", "clear central")).toBe(false);
    expect(matchesClearConfirmPhrase("", "")).toBe(false);
  });

  it("sums result outcomes", () => {
    const preview = centralClearFixturePreview("normal");
    const request = buildClearCentralRequest(preview, createDefaultClearCentralOptions());
    const partial = centralClearFixtureResult("partialFailure", request);
    expect(clearCentralFailedCount(partial)).toBe(2);
    expect(clearCentralSucceededCount(partial)).toBe(2 + 1 + 2 + 1);
  });

  it("names the target in the title", () => {
    const t = ((key: string) => (key === "central.clearAll.targetLocal" ? "本地" : key)) as TFunction;
    expect(clearTargetLabel(t, { kind: "local", label: "Local" })).toBe("本地");
    expect(clearTargetLabel(t, { kind: "ssh", label: "prod-box" })).toBe("prod-box");
    expect(clearTargetLabel(t, { kind: "wsl", label: "WSL", distribution: "Ubuntu" })).toBe(
      "Ubuntu",
    );
  });
});
