import { invoke, listen, type UnlistenFn } from "@/lib/ipc";
import { parseBackendError } from "@/lib/backendError";
import {
  CENTRAL_CLEAR_PROGRESS_EVENT,
  type ClearCentralProgress,
  type ClearCentralResult,
} from "@/types/centralClear";
import { createLocalJobId } from "./centralSkillsStore.shared";
import type {
  CentralClearJob,
  CentralSkillsState,
  CentralStoreContext,
} from "./centralSkillsStore.types";

const BUSY_CODE = "job.central_clear_busy";

export function isCentralClearJobActive(job: CentralClearJob | null): boolean {
  return job !== null && (job.status === "running" || job.status === "cancelling");
}

function isTerminal(job: CentralClearJob): boolean {
  return !isCentralClearJobActive(job);
}

/**
 * Merge one progress event into the current job. Events for another jobId,
 * or non-terminal events after the job settled, leave the object unchanged.
 */
export function mergeClearProgress(
  current: CentralClearJob | null,
  payload: ClearCentralProgress,
): CentralClearJob | null {
  if (!current || payload.jobId !== current.jobId) return current;
  if (isTerminal(current)) return current;
  const next: CentralClearJob = {
    ...current,
    phase: payload.phase,
    completed: payload.completed,
    total: payload.total,
  };
  if (payload.status === "cancelled") next.status = "cancelled";
  else if (payload.status === "failed") next.status = "failed";
  else if (payload.status === "completed") next.status = "completed";
  return next;
}

export function createCentralClearSlice({
  set,
  get,
}: CentralStoreContext): Pick<
  CentralSkillsState,
  "previewClearCentral" | "clearCentral" | "cancelClearCentral" | "resetClearJob"
> {
  /** Settle `jobId` unless a newer job owns the slot or a terminal event won. */
  function settle(jobId: string, status: CentralClearJob["status"]) {
    set((state) => {
      const job = state.clearJob;
      if (!job || job.jobId !== jobId || isTerminal(job)) return {};
      return { clearJob: { ...job, status } };
    });
  }

  return {
    previewClearCentral: async () => invoke("preview_clear_central_skills"),

    clearCentral: async (request) => {
      if (isCentralClearJobActive(get().clearJob)) {
        throw new Error(`${BUSY_CODE}:A Central clear job is already running.`);
      }
      const jobId = createLocalJobId();
      set({
        clearJob: { jobId, phase: null, status: "running", completed: 0, total: 0 },
      });

      let unlisten: UnlistenFn | null = null;
      try {
        // Subscribe before starting so early phase events are not missed.
        unlisten = await listen<ClearCentralProgress>(
          CENTRAL_CLEAR_PROGRESS_EVENT,
          (event) => {
            if (event.payload.jobId !== jobId) return;
            set((state) => {
              const next = mergeClearProgress(state.clearJob, event.payload);
              return next === state.clearJob ? {} : { clearJob: next };
            });
          },
        );
        const result: ClearCentralResult = await invoke("clear_central_skills", {
          jobId,
          request,
        });
        settle(jobId, result.cancelled ? "cancelled" : "completed");
        return result;
      } catch (err) {
        settle(
          jobId,
          parseBackendError(err).code === "operation.cancelled" ? "cancelled" : "failed",
        );
        throw err;
      } finally {
        unlisten?.();
      }
    },

    cancelClearCentral: async () => {
      const job = get().clearJob;
      if (!job || job.status !== "running") return;
      const { jobId } = job;
      set((state) =>
        state.clearJob?.jobId === jobId
          ? { clearJob: { ...state.clearJob, status: "cancelling" } }
          : {},
      );
      await invoke("cancel_central_clear", { jobId });
    },

    resetClearJob: () => {
      if (isCentralClearJobActive(get().clearJob)) return;
      set({ clearJob: null });
    },
  };
}
