import { useState } from "react";
import {
  AlertCircle,
  Check,
  GitBranch,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  describeGitHubPreviewError,
  isPreviewSnapshotFailure,
  looksLikeConfiguredGitHubTokenFailure,
  looksLikeGitHubAuthGuidance,
} from "@/components/marketplace/githubImportWizardUtils";
import { cn } from "@/lib/utils";

interface GitHubRepoImportUrlInputBlockProps {
  repoUrl: string;
  branch: string;
  previewError: string | null;
  isPreviewLoading: boolean;
  browserMode: boolean;
  onRepoUrlChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onPreviewSubmit: (branch: string) => void;
}

/**
 * `default` submits no branch so the backend previews the repository's own
 * default branch (for example `master`); the other modes pin an explicit one.
 */
type GitHubBranchMode = "default" | "main" | "dev" | "custom";

const BRANCH_MODES: GitHubBranchMode[] = ["default", "main", "dev", "custom"];

function getInitialBranchMode(branch: string): GitHubBranchMode {
  if (!branch.trim()) return "default";
  if (branch === "main" || branch === "dev") return branch;
  return "custom";
}

export function GitHubRepoImportUrlInputBlock({
  repoUrl,
  branch,
  previewError,
  isPreviewLoading,
  browserMode,
  onRepoUrlChange,
  onBranchChange,
  onPreviewSubmit,
}: GitHubRepoImportUrlInputBlockProps) {
  const { t } = useTranslation();
  const [branchMode, setBranchMode] = useState<GitHubBranchMode>(() =>
    getInitialBranchMode(branch),
  );
  const [customBranch, setCustomBranch] = useState(() =>
    getInitialBranchMode(branch) === "custom" ? branch : "",
  );
  const effectiveBranch = branchForMode(branchMode, customBranch);
  const previewDisabled =
    isPreviewLoading ||
    !repoUrl.trim() ||
    (branchMode === "custom" && !customBranch.trim());

  function branchForMode(mode: GitHubBranchMode, custom: string) {
    if (mode === "default") return "";
    return mode === "custom" ? custom : mode;
  }

  function handleBranchModeChange(nextMode: GitHubBranchMode) {
    setBranchMode(nextMode);
    onBranchChange(branchForMode(nextMode, customBranch));
  }

  function handleCustomBranchChange(value: string) {
    setCustomBranch(value);
    onBranchChange(value);
  }

  function submitPreview(nextBranch: string) {
    if (branch !== nextBranch) {
      onBranchChange(nextBranch);
    }
    onPreviewSubmit(nextBranch);
  }

  function handleUseDefaultBranch() {
    setBranchMode("default");
    submitPreview("");
  }

  const errorDescription = previewError
    ? describeGitHubPreviewError(previewError, t, {
        branch: effectiveBranch,
        repoUrl,
      })
    : null;

  return (
    <div
      className="rounded-xl border border-border/70 bg-muted/10 p-4"
      data-testid="github-import-url-card"
    >
      <label
        className="mb-1.5 block text-sm font-medium"
        htmlFor="github-repo-url"
      >
        {t("marketplace.githubRepoUrl")}
      </label>
      <Input
        id="github-repo-url"
        value={repoUrl}
        onChange={(event) => onRepoUrlChange(event.target.value)}
        placeholder="https://github.com/owner/repo"
        spellCheck={false}
        autoComplete="off"
        className="h-9 font-mono"
      />

      <div
        id="github-repo-branch-label"
        className="mb-1.5 mt-4 block text-sm font-medium"
      >
        {t("marketplace.githubBranchLabel")}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex h-9 min-w-0 items-stretch gap-0.5 self-start rounded-lg border border-input bg-background p-0.5"
          role="radiogroup"
          aria-labelledby="github-repo-branch-label"
          aria-describedby="github-repo-branch-hint"
        >
          {BRANCH_MODES.map((mode) => {
            const selected = branchMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleBranchModeChange(mode)}
                className={cn(
                  "focus-ring flex min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-[scale,background-color,color] active:scale-[0.96]",
                  selected
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-muted/65 hover:text-foreground",
                )}
              >
                {selected ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
                <span className={cn("truncate", mode !== "default" && mode !== "custom" && "font-mono")}>
                  {t(`marketplace.githubBranchOption.${mode}`)}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          size="lg"
          className="w-full px-4 sm:w-auto"
          onClick={() => submitPreview(effectiveBranch)}
          disabled={previewDisabled}
        >
          {isPreviewLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          <span>{t("marketplace.previewImport")}</span>
        </Button>
      </div>
      {branchMode === "custom" ? (
        <div className="mt-2 max-w-md">
          <label className="sr-only" htmlFor="github-repo-custom-branch">
            {t("marketplace.githubCustomBranchLabel")}
          </label>
          <div className="relative">
            <GitBranch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="github-repo-custom-branch"
              value={customBranch}
              onChange={(event) => handleCustomBranchChange(event.target.value)}
              placeholder={t("marketplace.githubCustomBranchPlaceholder")}
              aria-describedby="github-repo-branch-hint"
              spellCheck={false}
              autoComplete="off"
              className="h-9 pl-9 font-mono"
              autoFocus
            />
          </div>
        </div>
      ) : null}
      <p
        id="github-repo-branch-hint"
        className="mt-1.5 text-xs text-muted-foreground"
      >
        {branchMode === "custom"
          ? t("marketplace.githubCustomBranchHint")
          : branchMode === "default"
            ? t("marketplace.githubBranchDefaultHint")
            : t("marketplace.githubBranchExplicitHint")}
      </p>

      {browserMode ? (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="space-y-1">
              <span className="block">
                {t("marketplace.githubImportDesktopOnlyHint")}
              </span>
              <span className="block text-xs">
                {t("marketplace.githubImportDesktopOnlyState")}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      {previewError && errorDescription ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-destructive-text"
          data-testid="github-import-preview-error"
          data-error-code={errorDescription.code ?? undefined}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">{errorDescription.title}</p>
                <p className="text-sm">{errorDescription.body}</p>
                {isPreviewSnapshotFailure(previewError) ? (
                  <p
                    className="text-xs"
                    data-testid="github-import-repreview-hint"
                  >
                    {t("marketplace.githubImportRepreviewHint")}
                  </p>
                ) : null}
                {looksLikeGitHubAuthGuidance(previewError) ? (
                  <p className="text-xs">
                    {looksLikeConfiguredGitHubTokenFailure(previewError)
                      ? t("marketplace.githubPatConfiguredFailureHint")
                      : t("marketplace.githubPatSettingsHint")}
                  </p>
                ) : null}
              </div>
            </div>
            {errorDescription.action === "use_default_branch" ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 self-start"
                onClick={handleUseDefaultBranch}
                disabled={isPreviewLoading}
              >
                <GitBranch className="size-3.5" />
                <span>{t("marketplace.githubPreviewError.useDefaultBranch")}</span>
              </Button>
            ) : errorDescription.action === "retry" ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 self-start"
                onClick={() => submitPreview(effectiveBranch)}
                disabled={previewDisabled}
              >
                <RefreshCw className="size-3.5" />
                <span>{t("marketplace.githubPreviewError.retry")}</span>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
