/**
 * Central clear-all dialog state machine:
 * closed -> loadingPreview -> (previewError | preview) -> running -> result.
 *
 * The store owns IPC and the job/progress subscription; this hook owns the
 * dialog stage, user options, the confirmation phrase, and the single
 * post-apply refresh. Contract: `.trellis/tasks/11-02-central-clear-all/design.md`.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";

import { formatBackendError, parseBackendError } from "@/lib/backendError";
import {
  buildClearCentralRequest,
  clearCentralFailedCount,
  clearCentralSucceededCount,
  createDefaultClearCentralOptions,
  hasClearCentralWork,
  isClearCentralPreviewEmpty,
  matchesClearConfirmPhrase,
  type ClearCentralOptions,
} from "@/lib/centralClearAll";
import { isCentralClearJobActive } from "@/stores/centralSkillsStore.clearSlice";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { usePlatformStore } from "@/stores/platformStore";
import type { ClearCentralPreview, ClearCentralResult } from "@/types/centralClear";

export type ClearAllStage =
  | "closed"
  | "loadingPreview"
  | "previewError"
  | "preview"
  | "running"
  | "result";

/** Codes that guarantee the backend did not touch anything. */
const NO_WORK_CODES = new Set(["job.central_clear_busy", "central_skills.mutation_lock_failed"]);

export interface UseCentralClearAllWorkflowArgs {
  t: TFunction;
  /** Clear page selection and repository filter after an apply. */
  onAfterClear: () => void;
  /** Open the existing Portability dialog (backup link). */
  onOpenBackup: () => void;
}

export function useCentralClearAllWorkflow({
  t,
  onAfterClear,
  onOpenBackup,
}: UseCentralClearAllWorkflowArgs) {
  const previewClearCentral = useCentralSkillsStore((s) => s.previewClearCentral);
  const clearCentral = useCentralSkillsStore((s) => s.clearCentral);
  const cancelClearCentral = useCentralSkillsStore((s) => s.cancelClearCentral);
  const resetClearJob = useCentralSkillsStore((s) => s.resetClearJob);
  const loadCentralSkills = useCentralSkillsStore((s) => s.loadCentralSkills);
  const clearJob = useCentralSkillsStore((s) => s.clearJob) ?? null;
  const refreshCounts = usePlatformStore((s) => s.refreshCounts);

  const [stage, setStage] = useState<ClearAllStage>("closed");
  const [preview, setPreview] = useState<ClearCentralPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [options, setOptions] = useState<ClearCentralOptions>(
    createDefaultClearCentralOptions,
  );
  const [phrase, setPhrase] = useState("");
  const [result, setResult] = useState<ClearCentralResult | null>(null);
  // Bumped on every preview start and close, so a late preview is discarded.
  const sessionRef = useRef(0);

  const loadPreview = useCallback(async () => {
    const session = ++sessionRef.current;
    setStage("loadingPreview");
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setResult(null);
    setPhrase("");
    setOptions(createDefaultClearCentralOptions());
    try {
      const next = await previewClearCentral();
      if (session !== sessionRef.current) return;
      setPreview(next);
      setStage("preview");
    } catch (err) {
      if (session !== sessionRef.current) return;
      const message = t("central.clearAll.previewError", {
        error: formatBackendError(err, t),
      });
      setPreviewError(message);
      toast.error(message);
      setStage("previewError");
    }
  }, [previewClearCentral, t]);

  const openDialog = useCallback(() => {
    void loadPreview();
  }, [loadPreview]);

  const close = useCallback(() => {
    sessionRef.current += 1;
    setStage("closed");
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setResult(null);
    setPhrase("");
    setOptions(createDefaultClearCentralOptions());
    resetClearJob();
  }, [resetClearJob]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      // Running can only be cancelled, never dismissed (overlay / ESC / X).
      if (open || stage === "running") return;
      close();
    },
    [close, stage],
  );

  const phraseMatches = matchesClearConfirmPhrase(
    phrase,
    t("central.clearAll.confirmPhrase"),
  );
  const isEmpty = preview ? isClearCentralPreviewEmpty(preview) : true;
  const hasWork = preview ? hasClearCentralWork(preview, options) : false;
  const canConfirm = stage === "preview" && !!preview && !isEmpty && hasWork && phraseMatches;

  const refreshOnce = useCallback(async () => {
    try {
      await Promise.all([
        loadCentralSkills({ throwOnError: true }),
        refreshCounts(),
      ]);
    } catch (err) {
      toast.error(
        t("central.clearAll.refreshError", { error: formatBackendError(err, t) }),
      );
    }
  }, [loadCentralSkills, refreshCounts, t]);

  const confirm = useCallback(async () => {
    if (!preview || !canConfirm) return;
    const session = sessionRef.current;
    const request = buildClearCentralRequest(preview, options);
    setApplyError(null);
    setStage("running");

    let outcome: ClearCentralResult;
    try {
      outcome = await clearCentral(request);
    } catch (err) {
      const message = t("central.clearAll.applyError", {
        error: formatBackendError(err, t),
      });
      toast.error(message);
      const code = parseBackendError(err).code;
      const mayHaveCommitted = !code || !NO_WORK_CODES.has(code);
      if (mayHaveCommitted) {
        await refreshOnce();
        onAfterClear();
      }
      if (session !== sessionRef.current) return;
      setApplyError(message);
      // The preview counts may be stale; require a fresh confirmation.
      if (mayHaveCommitted) setPhrase("");
      setStage("preview");
      return;
    }

    await refreshOnce();
    onAfterClear();
    if (session !== sessionRef.current) return;

    const succeeded = clearCentralSucceededCount(outcome);
    const failed = clearCentralFailedCount(outcome);
    if (!outcome.cancelled && failed === 0) {
      toast.success(t("central.clearAll.successToast", { count: succeeded }));
      close();
      return;
    }
    if (outcome.cancelled) {
      toast.info(t("central.clearAll.cancelledToast", { count: succeeded }));
    } else {
      toast.error(t("central.clearAll.partialToast", { succeeded, failed }));
    }
    setResult(outcome);
    setStage("result");
  }, [preview, canConfirm, options, clearCentral, t, close, onAfterClear, refreshOnce]);

  const cancelRun = useCallback(() => {
    void cancelClearCentral().catch((err: unknown) => {
      toast.error(formatBackendError(err, t));
    });
  }, [cancelClearCentral, t]);

  const toggleCopyAgent = useCallback((agentId: string, checked: boolean) => {
    setOptions((current) => {
      const ids = new Set(current.removeCopyAgentIds);
      if (checked) ids.add(agentId);
      else ids.delete(agentId);
      return { ...current, removeCopyAgentIds: [...ids] };
    });
  }, []);

  const setCategory = useCallback(
    (
      key: "includeProjectLinks" | "includeOrphanLinks" | "includeUntrackedEntries",
      value: boolean,
    ) => {
      setOptions((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const openBackup = useCallback(() => {
    if (stage === "running") return;
    close();
    onOpenBackup();
  }, [close, onOpenBackup, stage]);

  return useMemo(
    () => ({
      open: stage !== "closed",
      stage,
      preview,
      previewError,
      applyError,
      options,
      phrase,
      phraseMatches,
      isEmpty,
      canConfirm,
      result,
      job: clearJob,
      busy: stage === "running" || isCentralClearJobActive(clearJob),
      openDialog,
      handleOpenChange,
      setPhrase,
      toggleCopyAgent,
      setCategory,
      confirm,
      cancelRun,
      rePreview: loadPreview,
      openBackup,
    }),
    [
      stage,
      preview,
      previewError,
      applyError,
      options,
      phrase,
      phraseMatches,
      isEmpty,
      canConfirm,
      result,
      clearJob,
      openDialog,
      handleOpenChange,
      toggleCopyAgent,
      setCategory,
      confirm,
      cancelRun,
      loadPreview,
      openBackup,
    ],
  );
}

export type CentralClearAllWorkflow = ReturnType<typeof useCentralClearAllWorkflow>;
