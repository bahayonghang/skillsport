// IPC shapes for Central clear-all. Source of truth: Rust
// `services/central_skills/clear_all/types.rs` and the cross-layer contract in
// `.trellis/tasks/11-02-central-clear-all/design.md`.
import type {
  BatchDeleteCentralSkillResult,
  FailedCentralSkillDelete,
} from "@/types/centralDelete";

export const CENTRAL_CLEAR_PROGRESS_EVENT = "central://clear-progress";
/** Only wildcard key: every still-valid item of a category (truncated lists). */
export const CENTRAL_CLEAR_WILDCARD_KEY = "*";

export type ClearCentralOwnerKind = "agent" | "project" | "central";

export interface ClearCentralPathItem {
  key: string;
  path: string;
  ownerKind: ClearCentralOwnerKind;
  ownerId: string;
  skillName: string | null;
  dangling: boolean;
}

export interface ClearCentralAgentSummary {
  agentId: string;
  linkCount: number;
  copyCount: number;
  orphanLinkCount: number;
}

export interface ClearCentralSweepWarning {
  path: string;
  code: string;
}

export interface ClearCentralPreview {
  previewId: string;
  targetKind: "local" | "ssh" | "wsl";
  centralRoot: string;
  skillIds: string[];
  skillPreviewFailed: FailedCentralSkillDelete[];
  agentSummaries: ClearCentralAgentSummary[];
  projectLinks: ClearCentralPathItem[];
  orphanLinks: ClearCentralPathItem[];
  untrackedCentralEntries: ClearCentralPathItem[];
  projectLinkCount: number;
  orphanLinkCount: number;
  untrackedCentralEntryCount: number;
  skippedUnmanagedCount: number;
  pendingRecoveryCount: number;
  sweepWarnings: ClearCentralSweepWarning[];
  truncated: boolean;
}

export interface ClearCentralRequest {
  previewId: string;
  skillIds: string[];
  removeCopyAgentIds: string[];
  projectLinkKeys: string[];
  orphanLinkKeys: string[];
  untrackedEntryKeys: string[];
}

export interface ClearCentralPathFailure {
  key: string;
  path: string;
  errorCode: string;
}

export interface ClearCentralPathOutcome {
  removed: number;
  failed: ClearCentralPathFailure[];
}

export interface ClearCentralResult {
  skills: BatchDeleteCentralSkillResult;
  projectLinks: ClearCentralPathOutcome;
  orphanLinks: ClearCentralPathOutcome;
  untrackedCentralEntries: ClearCentralPathOutcome;
  recovery: { recovered: number; failed: number };
  skippedChanged: number;
  cancelled: boolean;
}

export type ClearCentralPhase =
  | "recovery"
  | "projectLinks"
  | "skills"
  | "untracked"
  | "orphanLinks"
  | "finalize";

export interface ClearCentralProgress {
  jobId: string;
  phase: ClearCentralPhase;
  status: "started" | "running" | "completed" | "cancelled" | "failed";
  completed: number;
  total: number;
}
