import { useId, useRef, type ReactNode } from "react";
import { AlertTriangle, Info, Loader2, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  clearTargetLabel,
  countSelectedResidue,
  type ClearCentralAgentRef,
} from "@/lib/centralClearAll";
import type { CentralClearAllWorkflow } from "@/pages/centralClearAllWorkflow";
import type { TargetSummary } from "@/types/credentials";
import type { ClearCentralPreview } from "@/types/centralClear";
import { ClearAgentTable } from "./ClearAgentTable";
import { ClearPathDetails } from "./ClearPathDetails";
import { ClearPreviewSummary } from "./ClearPreviewSummary";
import { ClearProgressPanel } from "./ClearProgressPanel";
import { ClearResultPanel } from "./ClearResultPanel";

function confirmLabel(
  t: TFunction,
  preview: ClearCentralPreview,
  residue: number,
): string {
  if (preview.skillIds.length > 0) {
    return t("central.clearAll.confirmSkills", { count: preview.skillIds.length });
  }
  if (residue > 0) return t("central.clearAll.confirmResidue", { count: residue });
  return t("central.clearAll.confirmRecoveryOnly");
}

function Notice({
  tone,
  children,
  testId,
}: {
  tone: "info" | "warning";
  children: ReactNode;
  testId?: string;
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <p
      className="flex items-start gap-2 text-xs text-muted-foreground"
      data-testid={testId}
    >
      <Icon
        className={
          tone === "warning"
            ? "mt-0.5 size-3.5 shrink-0 text-warning-foreground"
            : "mt-0.5 size-3.5 shrink-0"
        }
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}

/** Sweep warnings rendered at most; the rest are summarized as a count. */
const SWEEP_WARNING_LIMIT = 200;

/** Informational notices; also shown for an otherwise empty preview. */
function PreviewNotices({ t, preview }: { t: TFunction; preview: ClearCentralPreview }) {
  return (
    <div className="space-y-1">
      {preview.skippedUnmanagedCount > 0 ? (
        <Notice tone="info" testId="central-clear-all-skipped-unmanaged">
          {t("central.clearAll.skippedUnmanaged", {
            count: preview.skippedUnmanagedCount,
          })}
        </Notice>
      ) : null}
      {preview.pendingRecoveryCount > 0 ? (
        <Notice tone="info" testId="central-clear-all-pending-recovery">
          {t("central.clearAll.pendingRecovery", {
            count: preview.pendingRecoveryCount,
          })}
        </Notice>
      ) : null}
      {preview.skillPreviewFailed.length > 0 ? (
        <Notice tone="warning">
          {t("central.clearAll.skillPreviewFailed", {
            count: preview.skillPreviewFailed.length,
          })}
        </Notice>
      ) : null}
      {preview.sweepWarnings.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            <AlertTriangle
              className="mr-1 inline size-3.5 align-text-bottom text-warning-foreground"
              aria-hidden
            />
            {t("central.clearAll.sweepWarnings", { count: preview.sweepWarnings.length })}
          </summary>
          <ul className="scrollbar-subtle mt-1 max-h-24 overflow-auto font-mono text-ui-meta">
            {preview.sweepWarnings.slice(0, SWEEP_WARNING_LIMIT).map((warning, index) => (
              <li key={`${index}:${warning.path}`} className="truncate" title={warning.path}>
                {warning.path}
              </li>
            ))}
            {preview.sweepWarnings.length > SWEEP_WARNING_LIMIT ? (
              <li>
                {t("central.clearAll.listMore", {
                  count: preview.sweepWarnings.length - SWEEP_WARNING_LIMIT,
                })}
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function PreviewBody({
  t,
  workflow,
  preview,
  agents,
  warningId,
}: {
  t: TFunction;
  workflow: CentralClearAllWorkflow;
  preview: ClearCentralPreview;
  agents: readonly ClearCentralAgentRef[];
  warningId: string;
}) {
  const { options } = workflow;
  if (workflow.isEmpty) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground" data-testid="central-clear-all-empty">
          {t("central.clearAll.nothingToClear")}
        </p>
        <PreviewNotices t={t} preview={preview} />
      </div>
    );
  }
  const danglingCount = preview.orphanLinks.filter((item) => item.dangling).length;
  return (
    <div className="space-y-3">
      <ClearPreviewSummary t={t} preview={preview} />
      <ClearAgentTable
        t={t}
        summaries={preview.agentSummaries}
        agents={agents}
        removeCopyAgentIds={options.removeCopyAgentIds}
        disabled={false}
        onToggleCopy={workflow.toggleCopyAgent}
      />
      <div className="space-y-2">
        <ClearPathDetails
          t={t}
          testId="central-clear-all-project-links"
          label={t("central.clearAll.toggleProjectLinks", {
            count: preview.projectLinkCount,
          })}
          checked={options.includeProjectLinks}
          disabled={false}
          onCheckedChange={(value) => workflow.setCategory("includeProjectLinks", value)}
          items={preview.projectLinks}
          total={preview.projectLinkCount}
        />
        <ClearPathDetails
          t={t}
          testId="central-clear-all-orphan-links"
          label={t("central.clearAll.toggleOrphanLinks", {
            count: preview.orphanLinkCount,
            dangling: danglingCount,
          })}
          checked={options.includeOrphanLinks}
          disabled={false}
          onCheckedChange={(value) => workflow.setCategory("includeOrphanLinks", value)}
          items={preview.orphanLinks}
          total={preview.orphanLinkCount}
        />
        <ClearPathDetails
          t={t}
          testId="central-clear-all-untracked"
          label={t("central.clearAll.toggleUntracked", {
            count: preview.untrackedCentralEntryCount,
          })}
          checked={options.includeUntrackedEntries}
          disabled={false}
          onCheckedChange={(value) => workflow.setCategory("includeUntrackedEntries", value)}
          items={preview.untrackedCentralEntries}
          total={preview.untrackedCentralEntryCount}
        />
      </div>
      <PreviewNotices t={t} preview={preview} />
      <label className="block space-y-1.5 text-sm">
        <span>
          {t("central.clearAll.confirmPrompt", {
            phrase: t("central.clearAll.confirmPhrase"),
          })}
        </span>
        <Input
          value={workflow.phrase}
          onChange={(event) => workflow.setPhrase(event.target.value)}
          aria-label={t("central.clearAll.confirmInputLabel")}
          aria-describedby={warningId}
          autoComplete="off"
          spellCheck={false}
          data-testid="central-clear-all-phrase"
        />
      </label>
    </div>
  );
}

export function ClearCentralSkillsDialog({
  t,
  workflow,
  agents,
  target,
}: {
  t: TFunction;
  workflow: CentralClearAllWorkflow;
  agents: readonly ClearCentralAgentRef[];
  target: TargetSummary;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const warningId = useId();
  const { stage, preview } = workflow;
  const running = stage === "running";
  const cancelling = workflow.job?.status === "cancelling";
  const residue = preview ? countSelectedResidue(preview, workflow.options) : 0;

  return (
    <Dialog
      open={workflow.open}
      onOpenChange={workflow.handleOpenChange}
      disablePointerDismissal={running}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={!running}
        initialFocus={cancelRef}
        className="flex max-h-[min(90vh,44rem)] w-full min-w-0 flex-col overflow-hidden sm:max-w-2xl"
        data-testid="central-clear-all-dialog"
      >
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle>
            {t("central.clearAll.title", { target: clearTargetLabel(t, target) })}
          </DialogTitle>
          <DialogDescription
            id={warningId}
            className="flex items-start gap-2 rounded-inner bg-destructive-tint p-3 text-foreground"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive-text" aria-hidden />
            <span>
              {t("central.clearAll.warning")} {t("central.clearAll.backupHint")}{" "}
              <button
                type="button"
                className="font-medium text-primary-text underline underline-offset-2 disabled:opacity-50"
                onClick={workflow.openBackup}
                disabled={running}
                data-testid="central-clear-all-backup"
              >
                {t("central.clearAll.backupLink")}
              </button>
            </span>
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="min-w-0 flex-1 space-y-3 overflow-x-hidden">
          {stage === "loadingPreview" ? (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              data-testid="central-clear-all-loading"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("central.clearAll.loadingPreview")}
            </p>
          ) : null}
          {stage === "previewError" && workflow.previewError ? (
            <p role="alert" className="text-sm text-destructive-text">
              {workflow.previewError}
            </p>
          ) : null}
          {stage === "preview" && preview ? (
            <PreviewBody
              t={t}
              workflow={workflow}
              preview={preview}
              agents={agents}
              warningId={warningId}
            />
          ) : null}
          {running ? <ClearProgressPanel t={t} job={workflow.job} /> : null}
          {stage === "result" && workflow.result ? (
            <ClearResultPanel t={t} result={workflow.result} />
          ) : null}
          {workflow.applyError && stage === "preview" ? (
            <p role="alert" className="text-sm text-destructive-text">
              {workflow.applyError}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {running ? (
            <Button
              ref={cancelRef}
              variant="outline"
              onClick={workflow.cancelRun}
              disabled={cancelling}
              data-testid="central-clear-all-cancel-run"
            >
              {cancelling ? t("central.clearAll.cancelling") : t("central.clearAll.cancelRunning")}
            </Button>
          ) : (
            <Button
              ref={cancelRef}
              variant="glass"
              onClick={() => workflow.handleOpenChange(false)}
              data-testid="central-clear-all-cancel"
            >
              {stage === "result" ? t("central.clearAll.close") : t("central.clearAll.cancel")}
            </Button>
          )}
          {stage === "previewError" || stage === "result" ? (
            <Button
              variant="default"
              onClick={() => void workflow.rePreview()}
              data-testid="central-clear-all-repreview"
            >
              {stage === "result"
                ? t("central.clearAll.rePreview")
                : t("central.clearAll.retryPreview")}
            </Button>
          ) : null}
          {stage === "preview" || stage === "loadingPreview" || running ? (
            <Button
              variant="destructive"
              disabled={!workflow.canConfirm}
              onClick={() => void workflow.confirm()}
              data-testid="central-clear-all-confirm"
            >
              {running ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              {preview
                ? confirmLabel(t, preview, residue)
                : t("central.clearAll.confirmSkills", { count: 0 })}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
