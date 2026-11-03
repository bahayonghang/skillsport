import { useMemo, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { parseBackendError } from "@/lib/backendError";
import {
  CONFLICT_STATUSES,
  countDecisions,
  retryableSkillIds,
  validateRename,
  type RenameProblem,
} from "@/lib/portabilityViewModel";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { ImportDecisionList } from "./ImportDecisionList";
import { ImportFilePicker } from "./ImportFilePicker";
import { ImportPreviewSummary } from "./ImportPreviewSummary";
import { ImportResultView } from "./ImportResultView";
import { ErrorNotice } from "./portabilityParts";

/** Apply errors that invalidate the preview: the user must pick the file again. */
const PREVIEW_GONE_CODES = new Set([
  "portable_bundle.preview_expired",
  "portable_bundle.preview_stale",
  "portable_bundle.target_changed",
]);

export function ImportPanel({ busy, activeTargetKind }: { busy: boolean; activeTargetKind: string }) {
  const { t } = useTranslation();
  const preview = useCentralSkillsStore((state) => state.portability.preview);
  const previewPath = useCentralSkillsStore((state) => state.portability.previewPath);
  const decisions = useCentralSkillsStore((state) => state.portability.decisions);
  const lastResult = useCentralSkillsStore((state) => state.portability.lastResult);
  const job = useCentralSkillsStore((state) => state.portabilityJob);
  const skills = useCentralSkillsStore((state) => state.skills);
  const previewPortableBundle = useCentralSkillsStore((state) => state.previewPortableBundle);
  const setDecision = useCentralSkillsStore((state) => state.setPortabilityDecision);
  const setDecisionsBulk = useCentralSkillsStore((state) => state.setPortabilityDecisionsBulk);
  const applyImport = useCentralSkillsStore((state) => state.applyPortableBundleImport);
  const discardPreview = useCentralSkillsStore((state) => state.discardPortableBundlePreview);
  const [error, setError] = useState<unknown>(null);

  const existingIds = useMemo(
    () => new Set(skills.map((skill) => skill.id.toLowerCase())),
    [skills],
  );
  const counts = useMemo(
    () => (preview ? countDecisions(preview, decisions) : null),
    [preview, decisions],
  );
  const renameProblems = useMemo(() => {
    const problems: Record<string, RenameProblem> = {};
    if (!preview) return problems;
    for (const decision of Object.values(decisions)) {
      if (decision.action !== "rename") continue;
      const problem = validateRename(
        decision.skillId,
        decision.renameTo ?? "",
        preview,
        decisions,
        existingIds,
      );
      if (problem) problems[decision.skillId] = problem;
    }
    return problems;
  }, [preview, decisions, existingIds]);
  const retryIds = useMemo(() => retryableSkillIds(lastResult, decisions), [lastResult, decisions]);

  async function handlePick(path: string) {
    setError(null);
    try {
      await previewPortableBundle(path);
    } catch (err) {
      setError(err);
    }
  }

  async function handleApply(onlyIds?: string[]) {
    setError(null);
    try {
      await applyImport(onlyIds);
    } catch (err) {
      setError(err);
      if (PREVIEW_GONE_CODES.has(parseBackendError(err).code ?? "")) {
        void discardPreview().catch(() => {});
      }
    }
  }

  const previewing = busy && job.kind === "preview";
  const applying = busy && job.kind === "apply";

  if (lastResult && !applying) {
    return (
      <div className="space-y-3">
        {error ? <ErrorNotice error={error} /> : null}
        <ImportResultView
          result={lastResult}
          retryCount={retryIds.length}
          disabled={busy}
          onRetryFailed={() => void handleApply(retryIds)}
          onImportAnother={() => {
            setError(null);
            void discardPreview().catch(() => {});
          }}
        />
      </div>
    );
  }

  if (!preview || !counts) {
    return (
      <div className="space-y-3" data-testid="central-portability-import-panel">
        {error ? <ErrorNotice error={error} /> : null}
        {previewing ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("central.bundle.import.reading")}
          </div>
        ) : (
          <ImportFilePicker disabled={busy} onPick={(path) => void handlePick(path)} />
        )}
      </div>
    );
  }

  const hasRenameProblem = Object.keys(renameProblems).length > 0;
  const canApply = !busy && counts.needsDecision === 0 && !hasRenameProblem && counts.willWrite > 0;

  return (
    <div className="space-y-4" data-testid="central-portability-import-panel">
      {error ? <ErrorNotice error={error} /> : null}
      <ImportPreviewSummary
        preview={preview}
        path={previewPath}
        counts={counts}
        activeTargetKind={activeTargetKind}
      />
      <ImportDecisionList
        skills={preview.skills}
        decisions={decisions}
        counts={counts}
        renameProblems={renameProblems}
        disabled={busy}
        onDecide={setDecision}
        onBulk={(action) => setDecisionsBulk(CONFLICT_STATUSES, action)}
      />
      {counts.byStatus.changed + counts.byStatus.exists_unmanaged > 0 ? (
        <p className="text-xs text-muted-foreground">{t("central.bundle.import.backupNote")}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground" data-testid="central-portability-apply-hint">
          {counts.needsDecision > 0
            ? t("central.bundle.import.pending", { count: counts.needsDecision })
            : hasRenameProblem
              ? t("central.bundle.import.fixRenames")
              : t("central.bundle.import.willWrite", { count: counts.willWrite })}
        </span>
        <Button variant="outline" disabled={busy} onClick={() => void discardPreview().catch(() => {})}>
          {t("central.bundle.import.chooseAnother")}
        </Button>
        <Button
          data-testid="central-portability-apply"
          disabled={!canApply}
          onClick={() => void handleApply()}
        >
          {applying ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {t("central.bundle.import.apply", { count: counts.willWrite })}
        </Button>
      </div>
    </div>
  );
}
