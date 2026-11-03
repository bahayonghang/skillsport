import { describe, expect, it } from "vitest";

import {
  buildApplyDecisions,
  bulkDecisions,
  countDecisions,
  defaultBundleFileName,
  filterSkills,
  formatBytes,
  retryableSkillIds,
  validateRename,
} from "@/lib/portabilityViewModel";
import type {
  PortableBundleDecision,
  PortableBundleImportPreview,
  PortableBundleSkillPreview,
} from "@/types";

function skill(id: string, status: PortableBundleSkillPreview["status"], name = id): PortableBundleSkillPreview {
  return { id, name, status, hasGithubSource: false, fileCount: 1, contentBytes: 1 };
}

const preview: PortableBundleImportPreview = {
  previewToken: "t",
  createdAt: "2026-10-28T00:00:00Z",
  appVersion: "1.0.0",
  originTargetKind: "local",
  skills: [
    skill("alpha", "new", "Alpha Tool"),
    skill("beta", "identical"),
    skill("gamma", "changed"),
    skill("delta", "exists_unmanaged"),
    skill("omega", "invalid"),
  ],
  metadata: {
    registries: { add: 0, exists: 0, update: 0 },
    tagGroups: { add: 0, exists: 0, update: 0 },
    tags: { add: 0, exists: 0, update: 0 },
    savedViews: { add: 0, exists: 0, update: 0 },
  },
  bundleSkippedSkills: [],
};

describe("portabilityViewModel", () => {
  it("counts statuses, pending conflicts and writes using backend defaults", () => {
    const counts = countDecisions(preview, {});
    expect(counts.byStatus).toEqual({ new: 1, identical: 1, changed: 1, exists_unmanaged: 1, invalid: 1 });
    expect(counts.needsDecision).toBe(2);
    expect(counts.willWrite).toBe(1);

    const resolved = bulkDecisions(preview, {}, ["changed", "exists_unmanaged"], "overwrite");
    expect(countDecisions(preview, resolved)).toMatchObject({ needsDecision: 0, willWrite: 3 });
    expect(countDecisions(preview, bulkDecisions(preview, {}, ["changed", "exists_unmanaged"], "skip")))
      .toMatchObject({ needsDecision: 0, willWrite: 1 });
  });

  it("builds apply decisions without invalid entries and skips others on retry", () => {
    const decisions: Record<string, PortableBundleDecision> = {
      gamma: { skillId: "gamma", action: "overwrite" },
      delta: { skillId: "delta", action: "rename", renameTo: "  delta-2 " },
    };
    expect(buildApplyDecisions(preview, decisions)).toEqual([
      { skillId: "alpha", action: "overwrite" },
      { skillId: "beta", action: "skip" },
      { skillId: "gamma", action: "overwrite" },
      { skillId: "delta", action: "rename", renameTo: "delta-2" },
    ]);
    expect(buildApplyDecisions(preview, decisions, ["delta"])).toEqual([
      { skillId: "alpha", action: "skip" },
      { skillId: "beta", action: "skip" },
      { skillId: "gamma", action: "skip" },
      { skillId: "delta", action: "rename", renameTo: "delta-2" },
    ]);
  });

  it("validates rename targets like the backend", () => {
    const existing = new Set(["frontend-design"]);
    const check = (to: string, decisions: Record<string, PortableBundleDecision> = {}) =>
      validateRename("gamma", to, preview, decisions, existing);
    expect(check("  ")).toBe("empty");
    expect(check("bad/name")).toBe("invalid");
    expect(check("trailing.")).toBe("invalid");
    expect(check("gamma")).toBe("same");
    expect(check("Frontend-Design")).toBe("taken");
    expect(check("ALPHA")).toBe("taken");
    expect(
      check("shared", { delta: { skillId: "delta", action: "rename", renameTo: "shared" } }),
    ).toBe("duplicate");
    expect(check("gamma-imported")).toBeNull();
  });

  it("filters by status, conflicts and query", () => {
    expect(filterSkills(preview.skills, "conflicts", "").map((s) => s.id)).toEqual(["gamma", "delta"]);
    expect(filterSkills(preview.skills, "invalid", "").map((s) => s.id)).toEqual(["omega"]);
    expect(filterSkills(preview.skills, "all", "alpha tool").map((s) => s.id)).toEqual(["alpha"]);
  });

  it("maps retry ids back through renames and includes cancelled items", () => {
    const decisions = { delta: { skillId: "delta", action: "rename" as const, renameTo: "delta-2" } };
    const ids = retryableSkillIds(
      {
        imported: [],
        overwritten: [],
        renamed: [],
        skipped: [
          { id: "beta", code: "identical" },
          { id: "alpha", code: "cancelled" },
        ],
        failed: [{ id: "delta-2", code: "write_failed" }],
        metadata: { added: 0, updated: 0, unchanged: 0 },
        cancelled: true,
      },
      decisions,
    );
    expect(ids).toEqual(["delta", "alpha"]);
    expect(retryableSkillIds(null, {})).toEqual([]);
  });

  it("formats file names and sizes", () => {
    expect(defaultBundleFileName("My Server #2", new Date(2026, 0, 5))).toBe(
      "skillport-my-server-2-2026-01-05.skillport",
    );
    expect(defaultBundleFileName("本机", new Date(2026, 9, 28))).toBe("skillport-central-2026-10-28.skillport");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });
});
