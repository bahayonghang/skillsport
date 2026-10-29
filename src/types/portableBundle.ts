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

export type PortableBundleSkillStatus =
  | "new"
  | "identical"
  | "changed"
  | "exists_unmanaged"
  | "invalid";

export interface PortableBundleSkillPreview {
  id: string;
  name: string;
  description?: string | null;
  status: PortableBundleSkillStatus;
  /** Stable reason code for `invalid` entries. */
  invalidReason?: string | null;
  hasGithubSource: boolean;
  fileCount: number;
  contentBytes: number;
}

export interface PortableBundleMetadataCounts {
  add: number;
  exists: number;
  update: number;
}

export interface PortableBundleMetadataPreview {
  registries: PortableBundleMetadataCounts;
  tagGroups: PortableBundleMetadataCounts;
  tags: PortableBundleMetadataCounts;
  savedViews: PortableBundleMetadataCounts;
}

export interface PortableBundleImportPreview {
  /** Opaque handle for apply/discard; bound to the active target. */
  previewToken: string;
  createdAt: string;
  appVersion: string;
  originTargetKind: string;
  skills: PortableBundleSkillPreview[];
  metadata: PortableBundleMetadataPreview;
  bundleSkippedSkills: PortableBundleSkippedSkill[];
}

export type PortableBundleDecisionAction = "skip" | "overwrite" | "rename";

export interface PortableBundleDecision {
  skillId: string;
  action: PortableBundleDecisionAction;
  /** Required for `rename`. */
  renameTo?: string | null;
}

export interface PortableBundleRenamedSkill {
  from: string;
  to: string;
}

export interface PortableBundleSkillIssue {
  id: string;
  /** Stable reason or error code, e.g. `identical`, `write_failed`. */
  code: string;
}

export interface PortableBundleMetadataResult {
  added: number;
  updated: number;
  unchanged: number;
}

export interface PortableBundleImportResult {
  imported: string[];
  overwritten: string[];
  renamed: PortableBundleRenamedSkill[];
  skipped: PortableBundleSkillIssue[];
  failed: PortableBundleSkillIssue[];
  metadata: PortableBundleMetadataResult;
  cancelled: boolean;
}

/** Frontend view of the single portable-bundle job slot. */
export type PortableBundleJobKind = "export" | "preview" | "apply";

export interface PortableBundleJob {
  jobId: string | null;
  kind: PortableBundleJobKind | null;
  phase: PortableBundlePhase | null;
  status: "idle" | "running" | "cancelling" | PortableBundleJobStatus;
  total: number;
  completed: number;
  currentItem?: string | null;
  /** Coded error string (`code:message`), formatted by the UI. */
  error?: string;
}
