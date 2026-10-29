// Pure helpers for the portable-bundle dialog and store. The backend applies
// the same defaults (`resolve_decisions` in `portable_bundle/apply.rs`):
// new → overwrite, identical → skip, changed/exists_unmanaged → required.

import type { TFunction } from "i18next";

import type { BadgeTone } from "@/lib/statusTone";
import type {
  PortableBundleDecision,
  PortableBundleDecisionAction,
  PortableBundleImportPreview,
  PortableBundleImportResult,
  PortableBundleSkillPreview,
  PortableBundleSkillStatus,
  TargetSummary,
} from "@/types";

export const BUNDLE_FILE_EXTENSION = "skillport";

/** Statuses the user must decide before apply. */
export const CONFLICT_STATUSES: PortableBundleSkillStatus[] = ["changed", "exists_unmanaged"];

/** `conflicts` stays stable while the user decides, unlike a "pending" filter. */
export type DecisionFilter = "all" | "conflicts" | PortableBundleSkillStatus;

export function defaultAction(
  status: PortableBundleSkillStatus,
): PortableBundleDecisionAction | null {
  if (status === "new") return "overwrite";
  if (status === "identical") return "skip";
  return null;
}

/** The decision that will be sent for `skill`, or null when one is still required. */
export function effectiveDecision(
  skill: PortableBundleSkillPreview,
  decisions: Record<string, PortableBundleDecision>,
): PortableBundleDecision | null {
  if (skill.status === "invalid") return null;
  const explicit = decisions[skill.id];
  if (explicit) return explicit;
  const action = defaultAction(skill.status);
  return action ? { skillId: skill.id, action } : null;
}

function needsDecision(
  skill: PortableBundleSkillPreview,
  decisions: Record<string, PortableBundleDecision>,
): boolean {
  return skill.status !== "invalid" && effectiveDecision(skill, decisions) === null;
}

export function bulkDecisions(
  preview: PortableBundleImportPreview,
  current: Record<string, PortableBundleDecision>,
  statuses: PortableBundleSkillStatus[],
  action: Exclude<PortableBundleDecisionAction, "rename">,
): Record<string, PortableBundleDecision> {
  const next = { ...current };
  for (const skill of preview.skills) {
    if (statuses.includes(skill.status)) {
      next[skill.id] = { skillId: skill.id, action };
    }
  }
  return next;
}

/**
 * Decisions sent to `apply_portable_bundle_import`. With `onlyIds`, every
 * other valid skill is skipped so a retry touches only the failed items.
 */
export function buildApplyDecisions(
  preview: PortableBundleImportPreview,
  decisions: Record<string, PortableBundleDecision>,
  onlyIds?: string[],
): PortableBundleDecision[] {
  const only = onlyIds ? new Set(onlyIds) : null;
  const result: PortableBundleDecision[] = [];
  for (const skill of preview.skills) {
    if (skill.status === "invalid") continue;
    if (only && !only.has(skill.id)) {
      result.push({ skillId: skill.id, action: "skip" });
      continue;
    }
    const decision = effectiveDecision(skill, decisions);
    if (decision) {
      result.push(
        decision.action === "rename"
          ? { ...decision, renameTo: decision.renameTo?.trim() ?? "" }
          : { skillId: decision.skillId, action: decision.action },
      );
    }
  }
  return result;
}

export type RenameProblem = "empty" | "invalid" | "same" | "taken" | "duplicate";

const RENAME_FORBIDDEN = /[/\\:*?"<>|]/;

/** Mirrors `is_portable_skill_id` plus the in-bundle and existing-id checks. */
export function validateRename(
  skillId: string,
  renameTo: string,
  preview: PortableBundleImportPreview,
  decisions: Record<string, PortableBundleDecision>,
  existingIds: ReadonlySet<string>,
): RenameProblem | null {
  const target = renameTo.trim();
  if (!target) return "empty";
  if (
    target.length > 200 ||
    target === "." ||
    target === ".." ||
    target.endsWith(".") ||
    RENAME_FORBIDDEN.test(target) ||
    /[\u0000-\u001f\u007f]/.test(target)
  ) {
    return "invalid";
  }
  if (target === skillId) return "same";
  const key = target.toLowerCase();
  if (
    existingIds.has(key) ||
    preview.skills.some((skill) => skill.id.toLowerCase() === key)
  ) {
    return "taken";
  }
  const clash = Object.values(decisions).some(
    (decision) =>
      decision.skillId !== skillId &&
      decision.action === "rename" &&
      decision.renameTo?.trim().toLowerCase() === key,
  );
  return clash ? "duplicate" : null;
}

export interface DecisionCounts {
  total: number;
  byStatus: Record<PortableBundleSkillStatus, number>;
  needsDecision: number;
  willWrite: number;
}

export function countDecisions(
  preview: PortableBundleImportPreview,
  decisions: Record<string, PortableBundleDecision>,
): DecisionCounts {
  const byStatus: Record<PortableBundleSkillStatus, number> = {
    new: 0,
    identical: 0,
    changed: 0,
    exists_unmanaged: 0,
    invalid: 0,
  };
  let pending = 0;
  let willWrite = 0;
  for (const skill of preview.skills) {
    byStatus[skill.status] += 1;
    const decision = effectiveDecision(skill, decisions);
    if (needsDecision(skill, decisions)) pending += 1;
    if (decision && decision.action !== "skip") willWrite += 1;
  }
  return { total: preview.skills.length, byStatus, needsDecision: pending, willWrite };
}

export function filterSkills(
  skills: PortableBundleSkillPreview[],
  filter: DecisionFilter,
  query: string,
): PortableBundleSkillPreview[] {
  const needle = query.trim().toLowerCase();
  return skills.filter((skill) => {
    if (filter === "conflicts" && !CONFLICT_STATUSES.includes(skill.status)) return false;
    if (filter !== "all" && filter !== "conflicts" && skill.status !== filter) {
      return false;
    }
    if (!needle) return true;
    return (
      skill.id.toLowerCase().includes(needle) || skill.name.toLowerCase().includes(needle)
    );
  });
}

/**
 * Bundle skill ids worth retrying: failed writes plus items a cancel left
 * unwritten. Issues carry the final id, so renames map back to the source.
 */
export function retryableSkillIds(
  result: PortableBundleImportResult | null,
  decisions: Record<string, PortableBundleDecision>,
): string[] {
  if (!result) return [];
  const sourceOf = new Map<string, string>();
  for (const decision of Object.values(decisions)) {
    if (decision.action === "rename" && decision.renameTo) {
      sourceOf.set(decision.renameTo.trim(), decision.skillId);
    }
  }
  const issues = [
    ...result.failed,
    ...result.skipped.filter((issue) => issue.code === "cancelled"),
  ];
  return [...new Set(issues.map((issue) => sourceOf.get(issue.id) ?? issue.id))];
}

/** `skillport-<target>-<yyyy-mm-dd>.skillport`, safe for any file system. */
export function defaultBundleFileName(targetLabel: string, now = new Date()): string {
  const slug =
    targetLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "central";
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `skillport-${slug}-${date}.${BUNDLE_FILE_EXTENSION}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export const STATUS_TONE: Record<PortableBundleSkillStatus, BadgeTone> = {
  new: "success",
  identical: "neutral",
  changed: "warning",
  exists_unmanaged: "warning",
  invalid: "destructive",
};

function targetKindLabel(kind: string, t: TFunction) {
  if (kind === "wsl") return t("targets.kind.wsl");
  if (kind === "ssh") return t("targets.kind.ssh");
  return kind;
}

export function targetDisplayLabel(target: Pick<TargetSummary, "kind" | "label">, t: TFunction) {
  if (target.kind === "local") return t("targets.local");
  return t("central.portabilityTargetBadge", {
    kind: targetKindLabel(target.kind, t),
    label: target.label,
  });
}
