// Pure helpers for the Central clear-all flow (no React, no IPC).
// Contract: `.trellis/tasks/11-02-central-clear-all/design.md` §3.
import type { TFunction } from "i18next";

import type { TargetSummary } from "@/types/credentials";
import {
  CENTRAL_CLEAR_WILDCARD_KEY,
  type ClearCentralPathItem,
  type ClearCentralPreview,
  type ClearCentralRequest,
  type ClearCentralResult,
} from "@/types/centralClear";

/** Minimal agent shape the clear-all UI needs for display names. */
export interface ClearCentralAgentRef {
  id: string;
  display_name: string;
}

export interface ClearCentralOptions {
  /** Agents whose DB-registered copy installs are removed too (default none). */
  removeCopyAgentIds: string[];
  includeProjectLinks: boolean;
  includeOrphanLinks: boolean;
  includeUntrackedEntries: boolean;
}

export function createDefaultClearCentralOptions(): ClearCentralOptions {
  return {
    removeCopyAgentIds: [],
    includeProjectLinks: true,
    includeOrphanLinks: true,
    includeUntrackedEntries: true,
  };
}

/**
 * Keys for one path category: off -> `[]`; on and the returned list is
 * shorter than the exact count (truncated) -> `["*"]`; otherwise every key.
 */
function categoryKeys(
  enabled: boolean,
  truncated: boolean,
  items: readonly ClearCentralPathItem[],
  count: number,
): string[] {
  if (!enabled || count === 0) return [];
  if (truncated && items.length < count) return [CENTRAL_CLEAR_WILDCARD_KEY];
  return items.map((item) => item.key);
}

export function buildClearCentralRequest(
  preview: ClearCentralPreview,
  options: ClearCentralOptions,
): ClearCentralRequest {
  const copyAgents = new Set(
    preview.agentSummaries
      .filter((summary) => summary.copyCount > 0)
      .map((summary) => summary.agentId),
  );
  return {
    previewId: preview.previewId,
    skillIds: [...preview.skillIds],
    removeCopyAgentIds: options.removeCopyAgentIds.filter((id) => copyAgents.has(id)),
    projectLinkKeys: categoryKeys(
      options.includeProjectLinks,
      preview.truncated,
      preview.projectLinks,
      preview.projectLinkCount,
    ),
    orphanLinkKeys: categoryKeys(
      options.includeOrphanLinks,
      preview.truncated,
      preview.orphanLinks,
      preview.orphanLinkCount,
    ),
    untrackedEntryKeys: categoryKeys(
      options.includeUntrackedEntries,
      preview.truncated,
      preview.untrackedCentralEntries,
      preview.untrackedCentralEntryCount,
    ),
  };
}

/** Nothing to clear at all (S14): confirm stays disabled. */
export function isClearCentralPreviewEmpty(preview: ClearCentralPreview): boolean {
  return (
    preview.skillIds.length === 0 &&
    preview.projectLinkCount === 0 &&
    preview.orphanLinkCount === 0 &&
    preview.untrackedCentralEntryCount === 0 &&
    preview.pendingRecoveryCount === 0
  );
}

/** Residue items (non-skill) the current options would request. */
export function countSelectedResidue(
  preview: ClearCentralPreview,
  options: ClearCentralOptions,
): number {
  return (
    (options.includeProjectLinks ? preview.projectLinkCount : 0) +
    (options.includeOrphanLinks ? preview.orphanLinkCount : 0) +
    (options.includeUntrackedEntries ? preview.untrackedCentralEntryCount : 0)
  );
}

/** True when apply would do something (deletions or pending recovery). */
export function hasClearCentralWork(
  preview: ClearCentralPreview,
  options: ClearCentralOptions,
): boolean {
  return (
    preview.skillIds.length > 0 ||
    preview.pendingRecoveryCount > 0 ||
    countSelectedResidue(preview, options) > 0
  );
}

/** Confirmation phrase check: trimmed, case-insensitive. */
export function matchesClearConfirmPhrase(input: string, phrase: string): boolean {
  const expected = phrase.trim().toLocaleLowerCase();
  return expected.length > 0 && input.trim().toLocaleLowerCase() === expected;
}

export function clearCentralSucceededCount(result: ClearCentralResult): number {
  return (
    result.skills.succeeded.length +
    result.projectLinks.removed +
    result.orphanLinks.removed +
    result.untrackedCentralEntries.removed
  );
}

export function clearCentralFailedCount(result: ClearCentralResult): number {
  return (
    result.skills.failed.length +
    result.projectLinks.failed.length +
    result.orphanLinks.failed.length +
    result.untrackedCentralEntries.failed.length
  );
}

/** Title suffix that names the target, so the wrong target is never cleared. */
export function clearTargetLabel(
  t: TFunction,
  target: Pick<TargetSummary, "kind" | "label" | "distribution">,
): string {
  if (target.kind === "local") return t("central.clearAll.targetLocal");
  if (target.kind === "wsl") return target.distribution || target.label;
  return target.label;
}
