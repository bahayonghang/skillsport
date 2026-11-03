import { registerIpcFixtures } from "@/lib/ipc";
import type { PortableBundleImportPreview, PortableBundleSkillPreview } from "@/types";

/** 浏览器演示态的便携包数据：文件选择器在浏览器中不可用，预览可由 store 动作直接触发。 */
function demoSkill(
  id: string,
  status: PortableBundleSkillPreview["status"],
  extra: Partial<PortableBundleSkillPreview> = {},
): PortableBundleSkillPreview {
  return { id, name: id, status, hasGithubSource: false, fileCount: 3, contentBytes: 4096, ...extra };
}

const DEMO_PREVIEW: Omit<PortableBundleImportPreview, "previewToken"> = {
  createdAt: "2026-10-28T09:30:00Z",
  appVersion: "1.1.0",
  originTargetKind: "ssh",
  skills: [
    demoSkill("frontend-design", "identical", { hasGithubSource: true }),
    demoSkill("code-reviewer", "changed"),
    demoSkill("release-notes", "exists_unmanaged"),
    demoSkill("pdf-tools", "new", { hasGithubSource: true }),
    demoSkill("sql-helper", "new"),
    demoSkill("broken-skill", "invalid", { invalidReason: "payload_mismatch" }),
  ],
  metadata: {
    registries: { add: 1, exists: 2, update: 0 },
    tagGroups: { add: 1, exists: 0, update: 1 },
    tags: { add: 3, exists: 4, update: 0 },
    savedViews: { add: 2, exists: 0, update: 0 },
  },
  bundleSkippedSkills: [],
};

let previewCounter = 0;

function isNew(skillId: string): boolean {
  return DEMO_PREVIEW.skills.some((skill) => skill.id === skillId && skill.status === "new");
}

export function registerPortableBundleFixtures(): void {
  registerIpcFixtures({
    get_portable_bundle_export_summary: () => ({
      targetKind: "local",
      skills: 12,
      skillsWithGithubSource: 7,
      tags: 6,
      tagGroups: 2,
      savedViews: 3,
      registries: 4,
    }),
    export_portable_bundle: () => ({
      skillsExported: 12,
      skippedSkills: [],
      fileCount: 41,
      contentBytes: 182_000,
      bundleBytes: 64_000,
    }),
    preview_portable_bundle_import: () => {
      previewCounter += 1;
      return { ...DEMO_PREVIEW, previewToken: `fixture-preview-${previewCounter}` };
    },
    apply_portable_bundle_import: ({ decisions }) => ({
      imported: decisions
        .filter((decision) => decision.action === "overwrite" && isNew(decision.skillId))
        .map((decision) => decision.skillId),
      overwritten: decisions
        .filter((decision) => decision.action === "overwrite" && !isNew(decision.skillId))
        .map((decision) => decision.skillId),
      renamed: decisions
        .filter((decision) => decision.action === "rename")
        .map((decision) => ({ from: decision.skillId, to: decision.renameTo ?? decision.skillId })),
      skipped: decisions
        .filter((decision) => decision.action === "skip")
        .map((decision) => ({
          id: decision.skillId,
          code: decision.skillId === "frontend-design" ? "identical" : "user_skipped",
        })),
      failed: [],
      metadata: { added: 7, updated: 1, unchanged: 6 },
      cancelled: false,
    }),
    discard_portable_bundle_preview: () => undefined,
    cancel_portable_bundle_job: () => undefined,
  });
}
