import { Fragment } from "react";
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  GitHubImportProgressPayload,
  GitHubRepoPreview,
  TargetSummary,
} from "@/types";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type WizardStep,
} from "@/components/marketplace/githubImportWizardUtils";
import { isRemoteLikeTarget, isSshTarget } from "@/lib/targetKind";

/**
 * Render the preview snapshot expiry in the active locale.
 *
 * Only the expiry instant is shown; the opaque token, the local snapshot, and
 * the remote workspace path never reach the UI.
 */
function formatPreviewExpiry(expiresAt: string, language: string): string {
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    return expiresAt;
  }
  return parsed.toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface GitHubRepoImportWizardHeaderProps {
  launcherLabel: string;
  step: WizardStep;
  preview: GitHubRepoPreview | null;
  showRepoToolbar: boolean;
  repoUrl: string;
  branch: string;
  isPreviewLoading: boolean;
  previewToolbarRepoHref: string | null;
  selectedSkillsCount: number;
  activeTarget: TargetSummary;
  onPreviewSubmit: (branch: string) => void;
}

const WIZARD_STEPS: WizardStep[] = ["input", "preview", "confirm", "result"];

export function GitHubRepoImportWizardHeader({
  launcherLabel,
  step,
  preview,
  showRepoToolbar,
  repoUrl,
  branch,
  isPreviewLoading,
  previewToolbarRepoHref,
  selectedSkillsCount,
  activeTarget,
  onPreviewSubmit,
}: GitHubRepoImportWizardHeaderProps) {
  const { t } = useTranslation();
  const currentIndex = WIZARD_STEPS.indexOf(step);

  return (
    <div
      className="shrink-0 border-b border-border px-6 pb-3 pt-4"
      data-testid="github-import-compact-header"
    >
      <DialogHeader className="gap-1">
        <div className="flex min-w-0 items-center justify-between gap-3 pr-10">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            <GitBranch className="size-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("marketplace.githubImportTitle")}</span>
          </DialogTitle>
          <span
            className="inline-flex h-6 shrink-0 items-center rounded-full bg-accent px-2.5 text-xs text-muted-foreground"
            data-testid="github-import-launcher-badge"
          >
            {t("marketplace.githubImportHeaderLauncher", {
              launcher: launcherLabel,
            })}
          </span>
        </div>
        <DialogDescription className="text-xs leading-5 text-muted-foreground">
          {t("marketplace.githubImportDesc")}
        </DialogDescription>
      </DialogHeader>

      <ol
        className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs text-muted-foreground"
        data-testid="github-import-flat-stepper"
      >
        {WIZARD_STEPS.map((item, index) => {
          const isActive =
            step === item || (item === "preview" && step === "confirm");
          const isComplete = currentIndex > index;

          return (
            <Fragment key={item}>
              <li
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5",
                  isActive
                    ? "border-primary-stroke bg-primary-tint text-primary-text"
                    : isComplete
                      ? "border-transparent bg-primary-tint text-primary-text"
                      : "border-transparent bg-accent text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full text-ui-micro font-semibold",
                    isActive || isComplete
                      ? "bg-primary text-primary-foreground"
                      : "bg-popover text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
                <span className="font-medium">
                  {t(`marketplace.githubImportStep.${item}`)}
                </span>
              </li>
              {index < WIZARD_STEPS.length - 1 ? (
                <li
                  aria-hidden="true"
                  className={cn(
                    "h-px min-w-4 max-w-20 flex-1",
                    isComplete ? "bg-primary-stroke" : "bg-border",
                  )}
                />
              ) : null}
            </Fragment>
          );
        })}
      </ol>

      {showRepoToolbar && preview ? (
        <GitHubRepoImportPreviewToolbar
          preview={preview}
          repoUrl={repoUrl}
          isPreviewLoading={isPreviewLoading}
          previewToolbarRepoHref={previewToolbarRepoHref}
          selectedSkillsCount={selectedSkillsCount}
          activeTarget={activeTarget}
          onPreviewSubmit={() => onPreviewSubmit(branch)}
        />
      ) : null}
    </div>
  );
}

interface GitHubRepoImportPreviewToolbarProps {
  preview: GitHubRepoPreview;
  repoUrl: string;
  isPreviewLoading: boolean;
  previewToolbarRepoHref: string | null;
  selectedSkillsCount: number;
  activeTarget: TargetSummary;
  onPreviewSubmit: () => void;
}

function GitHubRepoImportPreviewToolbar({
  preview,
  repoUrl,
  isPreviewLoading,
  previewToolbarRepoHref,
  selectedSkillsCount,
  activeTarget,
  onPreviewSubmit,
}: GitHubRepoImportPreviewToolbarProps) {
  const { t, i18n } = useTranslation();

  return (
    <div
      className="mt-2 rounded-inner bg-accent px-4 py-2.5"
      data-testid="github-import-repo-toolbar"
    >
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary-text">
              {t("marketplace.githubImportToolbarLabel")}
            </span>
            <span className="truncate text-sm font-semibold">
              {preview.repo.owner}/{preview.repo.repo}
            </span>
            {preview.repo.branch ? (
              <span className="rounded-full bg-popover px-2 py-0.5 font-mono text-ui-meta text-muted-foreground">
                {preview.repo.branch}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-meta text-muted-foreground">
            <span>
              {t("marketplace.githubImportFoundSkills", {
                count: preview.skills.length,
              })}
            </span>
            <span>
              {t("marketplace.githubImportToolbarSelected", {
                count: selectedSkillsCount,
              })}
            </span>
            <span className="truncate font-mono text-muted-foreground">
              {preview.repo.normalizedUrl}
            </span>
          </div>
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-meta text-muted-foreground"
            data-testid="github-import-snapshot-provenance"
          >
            <span className="font-mono">
              {t("marketplace.githubImportSnapshotCommit", {
                sha: preview.resolvedCommitSha.slice(0, 7),
              })}
            </span>
            <span>
              {t("marketplace.githubImportSnapshotExpires", {
                time: formatPreviewExpiry(preview.expiresAt, i18n.language),
              })}
            </span>
          </div>
          {isRemoteLikeTarget(activeTarget) ? (
            <div
              className="text-xs text-primary-text"
              data-testid="github-import-remote-workspace-hint"
            >
              {t("marketplace.githubImportRemoteWorkspaceHint")}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
          <a
            href={previewToolbarRepoHref ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "glass", size: "sm" })}
          >
            <ExternalLink className="size-3.5" />
            <span>{t("marketplace.previewOpenSource")}</span>
          </a>
          <Button
            variant="glass"
            className="h-7"
            onClick={onPreviewSubmit}
            disabled={isPreviewLoading || !repoUrl.trim()}
          >
            {isPreviewLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span>{t("marketplace.githubImportRepreview")}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

interface GitHubRepoImportWizardFooterProps {
  step: WizardStep;
  showSharedShellBody: boolean;
  canReview: boolean;
  canConfirm: boolean;
  isImporting: boolean;
  importProgress: GitHubImportProgressPayload | null;
  importProgressPercent: number;
  importEtaSeconds: number | null;
  showSshPasswordRepair: boolean;
  activeTarget: TargetSummary;
  sshPasswordRepairValue: string;
  sshPasswordRepairMessage: {
    type: "success" | "error";
    text: string;
  } | null;
  isSavingSshPassword: boolean;
  onSshPasswordRepairValueChange: (value: string) => void;
  onClearSshPasswordRepairError: () => void;
  onSaveSshPasswordForImport: () => void;
  onStartAnotherImport: () => void;
  onClose: () => void;
  onRetryToInput: () => void;
  onReviewImport: () => void;
  onBackToPreview: () => void;
  onImportConfirm: () => void;
}

export function GitHubRepoImportWizardFooter({
  step,
  showSharedShellBody,
  canReview,
  canConfirm,
  isImporting,
  importProgress,
  importProgressPercent,
  importEtaSeconds,
  showSshPasswordRepair,
  activeTarget,
  sshPasswordRepairValue,
  sshPasswordRepairMessage,
  isSavingSshPassword,
  onSshPasswordRepairValueChange,
  onClearSshPasswordRepairError,
  onSaveSshPasswordForImport,
  onStartAnotherImport,
  onClose,
  onRetryToInput,
  onReviewImport,
  onBackToPreview,
  onImportConfirm,
}: GitHubRepoImportWizardFooterProps) {
  const { t } = useTranslation();
  const footerMode =
    step === "result" ? "result" : step === "confirm" ? "confirm" : "preview";

  if (!showSharedShellBody) return null;

  return (
    <div
      className="shrink-0 border-t border-border px-6 py-4"
      data-testid="github-import-shell-footer"
      data-footer-mode={footerMode}
    >
      {step === "confirm" ? (
        <GitHubRepoImportProgressPanel
          importProgress={importProgress}
          importProgressPercent={importProgressPercent}
          importEtaSeconds={importEtaSeconds}
        />
      ) : null}
      {step === "confirm" ? (
        <GitHubRepoImportSshPasswordRepairPanel
          showSshPasswordRepair={showSshPasswordRepair}
          activeTarget={activeTarget}
          sshPasswordRepairValue={sshPasswordRepairValue}
          sshPasswordRepairMessage={sshPasswordRepairMessage}
          isSavingSshPassword={isSavingSshPassword}
          onSshPasswordRepairValueChange={onSshPasswordRepairValueChange}
          onClearSshPasswordRepairError={onClearSshPasswordRepairError}
          onSaveSshPasswordForImport={onSaveSshPasswordForImport}
        />
      ) : null}
      {step === "result" ? (
        <div className="flex justify-end gap-2">
          <Button variant="glass" onClick={onStartAnotherImport}>
            <RefreshCw className="size-4" />
            <span>{t("marketplace.githubImportResultActionRestart")}</span>
          </Button>
          <Button onClick={onClose}>
            <span>{t("common.close")}</span>
          </Button>
        </div>
      ) : step !== "confirm" ? (
        <div className="flex justify-end gap-2">
          <Button variant="glass" onClick={onRetryToInput}>
            <RefreshCw className="size-4" />
            <span>{t("common.retry")}</span>
          </Button>
          <Button onClick={onReviewImport} disabled={!canReview}>
            <span>{t("marketplace.reviewImportSelection")}</span>
          </Button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <Button variant="glass" onClick={onBackToPreview}>
            <span>{t("marketplace.githubImportBackToPreview")}</span>
          </Button>
          <Button
            onClick={onImportConfirm}
            disabled={!canConfirm || isImporting}
          >
            {isImporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            <span>{t("common.import")}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

interface GitHubRepoImportProgressPanelProps {
  importProgress: GitHubImportProgressPayload | null;
  importProgressPercent: number;
  importEtaSeconds: number | null;
}

function GitHubRepoImportProgressPanel({
  importProgress,
  importProgressPercent,
  importEtaSeconds,
}: GitHubRepoImportProgressPanelProps) {
  const { t } = useTranslation();
  if (!importProgress) return null;

  const progressLabel =
    importProgress.phase === "preparing"
      ? t("marketplace.githubImportProgressPhasePreparing")
      : importProgress.phase === "finalizing"
        ? t("marketplace.githubImportProgressPhaseFinalizing")
        : t("marketplace.githubImportProgressPhaseWriting");

  return (
    <div
      className="mb-3 rounded-inner bg-primary-tint px-4 py-3"
      data-testid="github-import-progress-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          {t("marketplace.githubImportProgressTitle")}
        </div>
        <div className="text-xs text-muted-foreground">{progressLabel}</div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent">
        {importProgressPercent > 0 ? (
          <div
            className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out"
            style={{ transform: `scaleX(${importProgressPercent / 100})` }}
          />
        ) : (
          <div className="h-full w-1/3 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {importProgress.totalFiles > 0 ? (
          <span>
            {t("marketplace.githubImportProgressFiles", {
              completed: importProgress.completedFiles,
              total: importProgress.totalFiles,
            })}
          </span>
        ) : null}
        <span>
          {t("marketplace.githubImportProgressPercent", {
            percent: Math.round(importProgressPercent),
          })}
        </span>
        {importEtaSeconds ? (
          <span>
            {t("marketplace.githubImportProgressEta", {
              seconds: importEtaSeconds,
            })}
          </span>
        ) : null}
      </div>

      {importProgress.currentSkill || importProgress.currentPath ? (
        <div className="mt-2 text-xs text-muted-foreground">
          {importProgress.currentSkill ? (
            <div>
              {t("marketplace.githubImportProgressSkill", {
                skill: importProgress.currentSkill,
              })}
            </div>
          ) : null}
          {importProgress.currentPath ? (
            <div>
              {t("marketplace.githubImportProgressCurrentFile", {
                path: importProgress.currentPath,
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface GitHubRepoImportSshPasswordRepairPanelProps {
  showSshPasswordRepair: boolean;
  activeTarget: TargetSummary;
  sshPasswordRepairValue: string;
  sshPasswordRepairMessage: {
    type: "success" | "error";
    text: string;
  } | null;
  isSavingSshPassword: boolean;
  onSshPasswordRepairValueChange: (value: string) => void;
  onClearSshPasswordRepairError: () => void;
  onSaveSshPasswordForImport: () => void;
}

function GitHubRepoImportSshPasswordRepairPanel({
  showSshPasswordRepair,
  activeTarget,
  sshPasswordRepairValue,
  sshPasswordRepairMessage,
  isSavingSshPassword,
  onSshPasswordRepairValueChange,
  onClearSshPasswordRepairError,
  onSaveSshPasswordForImport,
}: GitHubRepoImportSshPasswordRepairPanelProps) {
  const { t } = useTranslation();
  if (!showSshPasswordRepair || !isSshTarget(activeTarget)) return null;

  return (
    <div
      className="mb-3 rounded-inner bg-warning-tint px-4 py-3"
      data-testid="github-import-ssh-password-repair"
    >
      <div className="flex flex-wrap items-start gap-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="text-sm font-semibold">
              {t("marketplace.githubImportSshPasswordTitle")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("marketplace.githubImportSshPasswordDesc", {
                label: activeTarget.label,
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              value={sshPasswordRepairValue}
              onChange={(event) => {
                onSshPasswordRepairValueChange(event.target.value);
                if (sshPasswordRepairMessage?.type === "error") {
                  onClearSshPasswordRepairError();
                }
              }}
              placeholder={t("marketplace.githubImportSshPasswordPlaceholder")}
              aria-label={t("marketplace.githubImportSshPasswordLabel", {
                label: activeTarget.label,
              })}
              className="h-8 text-xs"
            />
            <Button
              type="button"
              variant="glass"
              size="sm"
              disabled={isSavingSshPassword || !sshPasswordRepairValue.trim()}
              onClick={onSaveSshPasswordForImport}
            >
              {isSavingSshPassword ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              <span>{t("marketplace.githubImportSshPasswordSave")}</span>
            </Button>
          </div>
          {sshPasswordRepairMessage ? (
            <div
              className={cn(
                "text-xs",
                sshPasswordRepairMessage.type === "success"
                  ? "text-primary-text"
                  : "text-destructive-text",
              )}
              role="status"
            >
              {sshPasswordRepairMessage.text}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
