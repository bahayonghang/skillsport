// Portable bundle (format v2) DTOs mirrored from
// `src-tauri/src/services/portable_bundle/types.rs`.

export type PortableBundleTargetKind = "local" | "ssh" | "wsl";

export interface PortableBundleExportSummary {
  targetKind: PortableBundleTargetKind;
  skills: number;
  skillsWithGithubSource: number;
  tags: number;
  tagGroups: number;
  savedViews: number;
  registries: number;
}

export type PortableBundleSkipReason =
  | "invalid_id"
  | "manifest_missing"
  | "read_failed"
  | "budget_exceeded";

export interface PortableBundleSkippedSkill {
  id: string;
  name: string;
  reason: PortableBundleSkipReason;
}

export interface PortableBundleExportResult {
  skillsExported: number;
  skippedSkills: PortableBundleSkippedSkill[];
  fileCount: number;
  contentBytes: number;
  bundleBytes: number;
}

export type PortableBundlePhase =
  | "export"
  | "read"
  | "inspect"
  | "classify"
  | "apply"
  | "metadata";

export type PortableBundleJobStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface PortableBundleProgressPayload {
  jobId: string;
  phase: PortableBundlePhase;
  status: PortableBundleJobStatus;
  total: number;
  completed: number;
  currentItem?: string | null;
}
