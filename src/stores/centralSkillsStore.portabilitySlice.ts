import { invoke, isTauriRuntime, listen } from "@/lib/ipc";
import { backendErrorStateValue, parseBackendError } from "@/lib/backendError";
import { buildApplyDecisions, bulkDecisions } from "@/lib/portabilityViewModel";
import type {
  PortableBundleImportResult,
  PortableBundleJob,
  PortableBundleJobKind,
  PortableBundlePhase,
  PortableBundleProgressPayload,
} from "@/types";
import {
  PORTABILITY_PROGRESS_EVENT,
  createIdlePortabilityJob,
  createIdlePortabilityState,
  createLocalJobId,
  indexUpdateStates,
  isTerminalPortabilityStatus,
  mergePortabilityProgress,
} from "./centralSkillsStore.shared";
import type { CentralSkillsState, CentralStoreContext } from "./centralSkillsStore.types";
import { usePlatformStore } from "./platformStore";
import { useSavedViewsStore } from "./savedViewsStore";
import { useTagGroupsStore } from "./tagGroupsStore";

const BUSY_CODE = "job.portability_busy";

function isActive(job: PortableBundleJob): boolean {
  return job.status === "running" || job.status === "cancelling";
}

export function createCentralPortabilitySlice({
  set,
  get,
  getGeneration,
}: CentralStoreContext): Pick<
  CentralSkillsState,
  | "subscribePortabilityProgress"
  | "cancelPortabilityJob"
  | "loadPortabilityExportSummary"
  | "exportPortableBundle"
  | "previewPortableBundle"
  | "setPortabilityDecision"
  | "setPortabilityDecisionsBulk"
  | "applyPortableBundleImport"
  | "discardPortableBundlePreview"
  | "resetPortabilityDialog"
> {
  /** Claim the single job slot; the id is written before any invoke. */
  function startJob(kind: PortableBundleJobKind, phase: PortableBundlePhase): string {
    if (isActive(get().portabilityJob)) {
      throw new Error(`${BUSY_CODE}:A portability job is already running.`);
    }
    const jobId = createLocalJobId();
    set({
      portabilityJob: {
        ...createIdlePortabilityJob(),
        jobId,
        kind,
        phase,
        status: "running",
      },
    });
    return jobId;
  }

  /** Settle `jobId` unless a newer job or a terminal event already owns the slot. */
  function settleJob(jobId: string, patch: Partial<PortableBundleJob>) {
    set((state) => {
      const job = state.portabilityJob;
      if (job.jobId !== jobId) return {};
      if (isTerminalPortabilityStatus(job.status) && patch.status !== "failed") return {};
      return { portabilityJob: { ...job, ...patch } };
    });
  }

  function failJob(jobId: string, err: unknown) {
    settleJob(jobId, {
      status: parseBackendError(err).code === "operation.cancelled" ? "cancelled" : "failed",
      error: backendErrorStateValue(err),
    });
  }

  /** Import committed: reload everything a bundle can touch. */
  async function refreshAfterImport(jobId: string) {
    const generation = getGeneration();
    try {
      const [skills, repositories, tags, updateStates] = await Promise.all([
        invoke("get_central_skills"),
        invoke("get_skill_repositories"),
        invoke("get_skill_tags"),
        invoke("get_central_skill_update_states"),
        useTagGroupsStore.getState().loadTagGroups(),
        useSavedViewsStore.getState().loadSavedViews(),
      ]);
      if (generation !== getGeneration() || get().portabilityJob.jobId !== jobId) return;
      set({
        skills: skills ?? [],
        repositories: repositories ?? [],
        tags: tags ?? [],
        updateStatuses: indexUpdateStates(updateStates ?? []),
        requiresCentralReload: false,
      });
    } catch {
      // The import is already committed; only the in-memory view is stale.
      if (generation === getGeneration()) set({ requiresCentralReload: true });
    }
    void usePlatformStore.getState().refreshCounts().catch(() => {});
    void usePlatformStore.getState().refreshDashboardSummary();
  }

  return {
    subscribePortabilityProgress: async () => {
      if (!isTauriRuntime()) {
        return () => {};
      }
      return listen<PortableBundleProgressPayload>(PORTABILITY_PROGRESS_EVENT, (event) => {
        set((state) => ({
          portabilityJob: mergePortabilityProgress(state.portabilityJob, event.payload),
        }));
      });
    },

    cancelPortabilityJob: async () => {
      const { jobId, status } = get().portabilityJob;
      if (!jobId || status !== "running") {
        return;
      }
      set((state) =>
        state.portabilityJob.jobId === jobId
          ? { portabilityJob: { ...state.portabilityJob, status: "cancelling" } }
          : {},
      );
      await invoke("cancel_portable_bundle_job", { jobId });
    },

    loadPortabilityExportSummary: async () => {
      const generation = getGeneration();
      const summary = await invoke("get_portable_bundle_export_summary");
      if (generation !== getGeneration()) return null;
      set((state) => ({ portability: { ...state.portability, exportSummary: summary } }));
      return summary;
    },

    exportPortableBundle: async (path) => {
      const jobId = startJob("export", "export");
      set((state) => ({ portability: { ...state.portability, lastExport: null } }));
      try {
        const result = await invoke("export_portable_bundle", { jobId, path });
        if (get().portabilityJob.jobId === jobId) {
          set((state) => ({ portability: { ...state.portability, lastExport: result } }));
        }
        settleJob(jobId, { status: "completed" });
        return result;
      } catch (err) {
        failJob(jobId, err);
        throw err;
      }
    },

    previewPortableBundle: async (path) => {
      const jobId = startJob("preview", "read");
      const previous = get().portability.preview?.previewToken;
      if (previous) {
        void invoke("discard_portable_bundle_preview", { previewToken: previous }).catch(
          () => {},
        );
      }
      set((state) => ({
        portability: {
          ...state.portability,
          preview: null,
          previewPath: path,
          decisions: {},
          lastResult: null,
        },
      }));
      try {
        const preview = await invoke("preview_portable_bundle_import", { jobId, path });
        if (get().portabilityJob.jobId === jobId) {
          set((state) => ({ portability: { ...state.portability, preview } }));
        }
        settleJob(jobId, { status: "completed" });
        return preview;
      } catch (err) {
        failJob(jobId, err);
        throw err;
      }
    },

    setPortabilityDecision: (decision) => {
      set((state) => ({
        portability: {
          ...state.portability,
          decisions: { ...state.portability.decisions, [decision.skillId]: decision },
        },
      }));
    },

    setPortabilityDecisionsBulk: (statuses, action) => {
      set((state) => {
        const { preview, decisions } = state.portability;
        if (!preview) return {};
        return {
          portability: {
            ...state.portability,
            decisions: bulkDecisions(preview, decisions, statuses, action),
          },
        };
      });
    },

    applyPortableBundleImport: async (onlyIds) => {
      const preview = get().portability.preview;
      if (!preview) {
        throw new Error("portable_bundle.preview_expired:Choose the bundle again.");
      }
      const decisions = buildApplyDecisions(preview, get().portability.decisions, onlyIds);
      const jobId = startJob("apply", "apply");
      let result: PortableBundleImportResult;
      try {
        result = await invoke("apply_portable_bundle_import", {
          jobId,
          previewToken: preview.previewToken,
          decisions,
        });
      } catch (err) {
        failJob(jobId, err);
        throw err;
      }
      if (get().portabilityJob.jobId === jobId) {
        set((state) => ({ portability: { ...state.portability, lastResult: result } }));
      }
      settleJob(jobId, {
        status: result.cancelled ? "cancelled" : result.failed.length > 0 ? "failed" : "completed",
      });
      await refreshAfterImport(jobId);
      return result;
    },

    discardPortableBundlePreview: async () => {
      const token = get().portability.preview?.previewToken;
      set((state) => ({
        portability: {
          ...state.portability,
          preview: null,
          previewPath: null,
          decisions: {},
          lastResult: null,
        },
      }));
      if (token) {
        await invoke("discard_portable_bundle_preview", { previewToken: token });
      }
    },

    resetPortabilityDialog: () => {
      const job = get().portabilityJob;
      if (isActive(job)) return;
      const token = get().portability.preview?.previewToken;
      if (token) {
        void invoke("discard_portable_bundle_preview", { previewToken: token }).catch(() => {});
      }
      set({ portability: createIdlePortabilityState() });
    },
  };
}
