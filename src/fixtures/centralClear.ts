import { registerIpcFixtures } from "@/lib/ipc";
import type {
  ClearCentralPathItem,
  ClearCentralPreview,
  ClearCentralRequest,
  ClearCentralResult,
} from "@/types/centralClear";

/** Browser-demo / test datasets for Central clear-all (design §3). */
export type CentralClearFixtureScenario =
  | "empty"
  | "normal"
  | "orphanOnly"
  | "truncated"
  | "partialFailure";

const CENTRAL_ROOT = "~/.skillsmanage/skills";

function pathItem(
  path: string,
  ownerKind: ClearCentralPathItem["ownerKind"],
  ownerId: string,
  extra: Partial<ClearCentralPathItem> = {},
): ClearCentralPathItem {
  return {
    key: path.toLowerCase(),
    path,
    ownerKind,
    ownerId,
    skillName: path.split("/").pop() ?? null,
    dangling: false,
    ...extra,
  };
}

function basePreview(overrides: Partial<ClearCentralPreview> = {}): ClearCentralPreview {
  return {
    previewId: "fixture-clear-preview",
    targetKind: "local",
    centralRoot: CENTRAL_ROOT,
    skillIds: [],
    skillPreviewFailed: [],
    agentSummaries: [],
    projectLinks: [],
    orphanLinks: [],
    untrackedCentralEntries: [],
    projectLinkCount: 0,
    orphanLinkCount: 0,
    untrackedCentralEntryCount: 0,
    skippedUnmanagedCount: 0,
    pendingRecoveryCount: 0,
    sweepWarnings: [],
    truncated: false,
    ...overrides,
  };
}

function normalPreview(): ClearCentralPreview {
  const projectLinks = [
    pathItem("~/code/app/.claude/skills/frontend-design", "project", "project-app"),
  ];
  const orphanLinks = [
    pathItem("~/.claude/skills/old-skill", "agent", "claude-code", { dangling: true }),
    pathItem("~/.cursor/skills/old-skill", "agent", "cursor", { dangling: true }),
    pathItem("~/.cursor/skills/legacy", "agent", "cursor"),
  ];
  const untracked = [pathItem(`${CENTRAL_ROOT}/stray-folder`, "central", "central")];
  return basePreview({
    skillIds: ["frontend-design", "code-reviewer", "pdf-tools"],
    agentSummaries: [
      { agentId: "claude-code", linkCount: 3, copyCount: 0, orphanLinkCount: 1 },
      { agentId: "cursor", linkCount: 2, copyCount: 1, orphanLinkCount: 2 },
    ],
    projectLinks,
    orphanLinks,
    untrackedCentralEntries: untracked,
    projectLinkCount: projectLinks.length,
    orphanLinkCount: orphanLinks.length,
    untrackedCentralEntryCount: untracked.length,
    skippedUnmanagedCount: 2,
    pendingRecoveryCount: 1,
    sweepWarnings: [{ path: "~/.unreadable/skills", code: "unreadable" }],
  });
}

function orphanOnlyPreview(): ClearCentralPreview {
  const orphanLinks = [
    pathItem("~/.claude/skills/lost-a", "agent", "claude-code", { dangling: true }),
    pathItem("~/.claude/skills/lost-b", "agent", "claude-code", { dangling: true }),
  ];
  return basePreview({
    agentSummaries: [
      { agentId: "claude-code", linkCount: 0, copyCount: 0, orphanLinkCount: 2 },
    ],
    orphanLinks,
    orphanLinkCount: orphanLinks.length,
  });
}

function truncatedPreview(): ClearCentralPreview {
  const orphanLinks = Array.from({ length: 2000 }, (_, index) =>
    pathItem(`~/.claude/skills/orphan-${index}`, "agent", "claude-code", { dangling: true }),
  );
  return basePreview({
    skillIds: ["frontend-design"],
    agentSummaries: [
      { agentId: "claude-code", linkCount: 1, copyCount: 0, orphanLinkCount: 2500 },
    ],
    orphanLinks,
    orphanLinkCount: 2500,
    truncated: true,
  });
}

export function centralClearFixturePreview(
  scenario: CentralClearFixtureScenario,
): ClearCentralPreview {
  switch (scenario) {
    case "empty":
      return basePreview();
    case "orphanOnly":
      return orphanOnlyPreview();
    case "truncated":
      return truncatedPreview();
    case "normal":
    case "partialFailure":
      return normalPreview();
  }
}

function emptyOutcome() {
  return { removed: 0, failed: [] };
}

export function centralClearFixtureResult(
  scenario: CentralClearFixtureScenario,
  request: ClearCentralRequest,
): ClearCentralResult {
  const succeeded = request.skillIds.map((skillId) => ({
    skill_id: skillId,
    removed_central_path: `${CENTRAL_ROOT}/${skillId}`,
    removed_agent_ids: [],
    retained_agent_ids: [],
  }));
  const keyCount = (keys: string[], fallback: number) =>
    keys.includes("*") ? fallback : keys.length;
  const preview = centralClearFixturePreview(scenario);
  const result: ClearCentralResult = {
    skills: { succeeded, failed: [] },
    projectLinks: { removed: keyCount(request.projectLinkKeys, preview.projectLinkCount), failed: [] },
    orphanLinks: { removed: keyCount(request.orphanLinkKeys, preview.orphanLinkCount), failed: [] },
    untrackedCentralEntries: {
      removed: keyCount(request.untrackedEntryKeys, preview.untrackedCentralEntryCount),
      failed: [],
    },
    recovery: { recovered: preview.pendingRecoveryCount, failed: 0 },
    skippedChanged: 0,
    cancelled: false,
  };
  if (scenario !== "partialFailure") return result;

  const [firstSkill, ...restSkills] = succeeded;
  const firstOrphan = preview.orphanLinks[0];
  return {
    ...result,
    skills: {
      succeeded: restSkills,
      failed: firstSkill
        ? [
            {
              skill_id: firstSkill.skill_id,
              phase: "fs",
              error_code: "central_skills.delete_failed",
              error: "Central skill delete failed.",
            },
          ]
        : [],
    },
    orphanLinks: firstOrphan
      ? {
          removed: Math.max(0, result.orphanLinks.removed - 1),
          failed: [
            {
              key: firstOrphan.key,
              path: firstOrphan.path,
              errorCode: "central_clear.remove_failed",
            },
          ],
        }
      : emptyOutcome(),
    skippedChanged: 1,
  };
}

let scenario: CentralClearFixtureScenario = "normal";

/** Switch the browser-demo dataset (devtools / tests). */
export function setCentralClearFixtureScenario(next: CentralClearFixtureScenario): void {
  scenario = next;
}

export function registerCentralClearFixtures(): void {
  registerIpcFixtures({
    preview_clear_central_skills: () => centralClearFixturePreview(scenario),
    clear_central_skills: ({ request }) => centralClearFixtureResult(scenario, request),
    cancel_central_clear: () => true,
  });
}
