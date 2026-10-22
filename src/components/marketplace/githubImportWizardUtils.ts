import type {
  AgentWithStatus,
  BatchInstallResult,
  DuplicateResolution,
  GitHubRepoImportResult,
  GitHubRepoPreview,
  GitHubRepoRef,
  GitHubSkillImportSelection,
  SkillWithLinks,
} from "@/types";
import type { TFunction } from "i18next";

import type {
  GitHubImportAiSummaryEntry,
  SkillMarkdownEntry,
} from "@/stores/marketplaceStore";
import { formatBackendError, parseBackendError } from "@/lib/backendError";

export type WizardStep = "input" | "preview" | "confirm" | "result";

export type SelectionState = {
  selected: boolean;
  resolution: DuplicateResolution;
  renamedSkillId: string;
};

export type DetailTab = "overview" | "files" | "ai";

export interface GitHubRepoImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoUrl: string;
  onRepoUrlChange: (value: string) => void;
  branch: string;
  onBranchChange: (value: string) => void;
  preview: GitHubRepoPreview | null;
  previewError: string | null;
  isPreviewLoading: boolean;
  isImporting: boolean;
  importResult: GitHubRepoImportResult | null;
  onPreview: (
    branch: string,
  ) => Promise<GitHubRepoPreview | null> | GitHubRepoPreview | null;
  onImport: (
    selections: GitHubSkillImportSelection[],
  ) => Promise<GitHubRepoImportResult | void> | GitHubRepoImportResult | void;
  onReset: () => void;
  launcherLabel: string;
  availableAgents?: AgentWithStatus[];
  installableSkills?: SkillWithLinks[];
  onInstallImportedSkill?: (
    skillId: string,
    agentIds: string[],
    method: "symlink" | "copy",
    projectPath?: string | null,
  ) => Promise<BatchInstallResult>;
  onAfterImportSuccess?: (
    result: GitHubRepoImportResult,
  ) => Promise<void> | void;
  onOpenCentral?: () => void;
}

export const EMPTY_SKILL_MARKDOWN: Record<string, SkillMarkdownEntry> = {};
export const EMPTY_AI_SUMMARIES: Record<string, GitHubImportAiSummaryEntry> =
  {};

export async function noopFetchGitHubSkillMarkdown(
  _repo: GitHubRepoRef,
  _sourcePath: string,
): Promise<void> {}

export async function noopGenerateGitHubImportAiSummary(
  _sourcePath: string,
  _skillName: string,
  _content: string,
  _lang: string,
  _refresh?: boolean,
): Promise<void> {}

export function buildInitialSelections(
  preview: GitHubRepoPreview | null,
): Record<string, SelectionState> {
  if (!preview) return {};
  return Object.fromEntries(
    preview.skills.map((skill) => [
      skill.sourcePath,
      {
        selected: true,
        resolution: skill.conflict ? "skip" : "overwrite",
        renamedSkillId: skill.skillId,
      },
    ]),
  );
}

export function normalizeMessage(message: unknown) {
  return String(message).replace(/^Error:\s*/, "");
}

/**
 * Translate a backend GitHub-import failure.
 *
 * Reviewed GitHub import failures arrive as a stable
 * `github_import.<code>:<summary>` envelope and are localized; every other
 * message keeps its historical text. The `Error:` prefix is stripped before
 * parsing so a stringified `Error` still resolves its code.
 */
export function formatGitHubImportError(error: unknown, t: TFunction) {
  return formatBackendError(
    typeof error === "string" ? normalizeMessage(error) : error,
    t,
  );
}

export type GitHubPreviewErrorAction = "use_default_branch" | "retry" | null;

export interface GitHubPreviewErrorDescription {
  code: string | null;
  title: string;
  body: string;
  action: GitHubPreviewErrorAction;
}

/** `owner/repo` for display only; the backend never echoes repository data. */
function repoLabelFromUrl(repoUrl: string): string | null {
  const match = /github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i.exec(repoUrl.trim());
  if (!match) return null;
  return `${match[1]}/${match[2].replace(/\.git$/i, "")}`;
}

/**
 * Describe a failed preview for the input-step error panel: a short title, a
 * localized body and the one next step that can resolve it. The branch name is
 * interpolated from local UI state; backend codes stay free of user input.
 */
export function describeGitHubPreviewError(
  error: unknown,
  t: TFunction,
  context: { branch: string; repoUrl: string },
): GitHubPreviewErrorDescription {
  const normalized = typeof error === "string" ? normalizeMessage(error) : error;
  const code = parseBackendError(normalized).code ?? null;
  const body = formatGitHubImportError(error, t);
  const branch = context.branch.trim();

  switch (code) {
    case "github_import.branch_not_found": {
      const repo = repoLabelFromUrl(context.repoUrl);
      return {
        code,
        title: t("marketplace.githubPreviewError.title.branchNotFound"),
        body:
          branch && repo
            ? t("marketplace.githubPreviewError.branchNotFoundBody", {
                branch,
                repo,
              })
            : body,
        action: branch ? "use_default_branch" : null,
      };
    }
    case "github_import.request_rejected":
      return {
        code,
        title: t("marketplace.githubPreviewError.title.requestRejected"),
        body,
        action: null,
      };
    case "github_import.transport_failed":
      return {
        code,
        title: t("marketplace.githubPreviewError.title.transportFailed"),
        body,
        action: "retry",
      };
    default:
      return {
        code,
        title: t("marketplace.githubPreviewError.title.generic"),
        body,
        action: null,
      };
  }
}

/**
 * True when the failure means the confirmed preview snapshot is gone, expired,
 * mismatched, or tampered with, so the user must preview the repository again.
 */
export function isPreviewSnapshotFailure(error: unknown) {
  return (
    parseBackendError(
      typeof error === "string" ? normalizeMessage(error) : error,
    ).code?.startsWith(
      "github_import.preview",
    ) === true
  );
}

/**
 * Localize a rejected import/install for a toast.
 *
 * Preview snapshot and branch-selection envelopes are translated; every other
 * message keeps its exact historical text so unrelated failures cannot be
 * reshaped by the coded-error parser.
 */
export function formatGitHubImportToast(error: unknown, t: TFunction) {
  const message = String(error);
  const code = parseBackendError(
    typeof error === "string" ? normalizeMessage(error) : error,
  ).code;
  const shouldLocalize =
    code?.startsWith("github_import.preview") === true ||
    code === "github_import.branch_invalid" ||
    code === "github_import.branch_conflict";
  return shouldLocalize
    ? formatGitHubImportError(error, t)
    : message;
}

export function looksLikeGitHubAuthGuidance(error: unknown) {
  return new Set([
    "github_import.rate_limited",
    "github_import.access_denied",
    "github_import.configured_token_failed",
  ]).has(parseBackendError(error).code ?? "");
}

export function looksLikeConfiguredGitHubTokenFailure(error: unknown) {
  return (
    parseBackendError(error).code === "github_import.configured_token_failed"
  );
}

export function looksLikeMissingSshPassword(error: unknown) {
  return (
    parseBackendError(error).code === "credential.ssh_password_unavailable"
  );
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}
