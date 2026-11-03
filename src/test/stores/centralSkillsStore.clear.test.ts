import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const eventBus = vi.hoisted(() => {
  type Handler = (event: { payload: unknown }) => void;
  const handlers = new Map<string, Set<Handler>>();
  const unlistenCalls = { count: 0 };
  return {
    handlers,
    unlistenCalls,
    listen: vi.fn(async (name: string, handler: Handler) => {
      const set = handlers.get(name) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(name, set);
      return () => {
        unlistenCalls.count += 1;
        set.delete(handler);
      };
    }),
    emit(name: string, payload: unknown) {
      for (const handler of handlers.get(name) ?? []) handler({ payload });
    },
    reset() {
      handlers.clear();
      unlistenCalls.count = 0;
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: eventBus.listen }));

import { centralClearFixturePreview, centralClearFixtureResult } from "@/fixtures/centralClear";
import { buildClearCentralRequest, createDefaultClearCentralOptions } from "@/lib/centralClearAll";
import { ipcFixtureError } from "@/lib/ipc/errors";
import { mergeClearProgress } from "@/stores/centralSkillsStore.clearSlice";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { CENTRAL_CLEAR_PROGRESS_EVENT, type ClearCentralResult } from "@/types/centralClear";
import { ipcInvokeCalls, mockIpcCommands } from "../support/ipcMock";

const preview = centralClearFixturePreview("normal");
const request = buildClearCentralRequest(preview, createDefaultClearCentralOptions());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function listenerCount() {
  return eventBus.handlers.get(CENTRAL_CLEAR_PROGRESS_EVENT)?.size ?? 0;
}

describe("centralSkillsStore clear slice", () => {
  beforeEach(() => {
    eventBus.reset();
    useCentralSkillsStore.getState().resetForTargetChange();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("previews through the typed command", async () => {
    mockIpcCommands({ preview_clear_central_skills: preview });
    await expect(useCentralSkillsStore.getState().previewClearCentral()).resolves.toEqual(preview);
    expect(ipcInvokeCalls("preview_clear_central_skills")).toHaveLength(1);
  });

  it("passes its jobId, merges only matching events, and unsubscribes on success", async () => {
    const pending = deferred<ClearCentralResult>();
    mockIpcCommands({ clear_central_skills: () => pending.promise });

    const run = useCentralSkillsStore.getState().clearCentral(request);
    await vi.waitFor(() => expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(1));
    const { jobId } = ipcInvokeCalls("clear_central_skills")[0].args as { jobId: string };
    expect(jobId).toBe(useCentralSkillsStore.getState().clearJob?.jobId);
    expect(ipcInvokeCalls("clear_central_skills")[0].args).toEqual({ jobId, request });
    expect(listenerCount()).toBe(1);

    eventBus.emit(CENTRAL_CLEAR_PROGRESS_EVENT, {
      jobId: "someone-else",
      phase: "orphanLinks",
      status: "running",
      completed: 99,
      total: 100,
    });
    expect(useCentralSkillsStore.getState().clearJob).toMatchObject({
      phase: null,
      completed: 0,
    });

    eventBus.emit(CENTRAL_CLEAR_PROGRESS_EVENT, {
      jobId,
      phase: "skills",
      status: "running",
      completed: 3,
      total: 10,
    });
    expect(useCentralSkillsStore.getState().clearJob).toMatchObject({
      jobId,
      phase: "skills",
      status: "running",
      completed: 3,
      total: 10,
    });

    pending.resolve(centralClearFixtureResult("normal", request));
    await run;
    expect(useCentralSkillsStore.getState().clearJob?.status).toBe("completed");
    expect(listenerCount()).toBe(0);
    expect(eventBus.unlistenCalls.count).toBe(1);
  });

  it("marks failure and still unsubscribes when apply rejects", async () => {
    mockIpcCommands({
      clear_central_skills: () => {
        throw ipcFixtureError("central.clear_failed", "boom");
      },
    });
    await expect(useCentralSkillsStore.getState().clearCentral(request)).rejects.toMatchObject({
      code: "central.clear_failed",
    });
    expect(useCentralSkillsStore.getState().clearJob?.status).toBe("failed");
    expect(listenerCount()).toBe(0);
  });

  it("rejects a duplicate start with the busy code and keeps the active job", async () => {
    const pending = deferred<ClearCentralResult>();
    mockIpcCommands({ clear_central_skills: () => pending.promise });
    const first = useCentralSkillsStore.getState().clearCentral(request);
    await vi.waitFor(() => expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(1));
    const active = useCentralSkillsStore.getState().clearJob;

    await expect(useCentralSkillsStore.getState().clearCentral(request)).rejects.toThrow(
      "job.central_clear_busy",
    );
    expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(1);
    expect(useCentralSkillsStore.getState().clearJob).toBe(active);

    pending.resolve(centralClearFixtureResult("normal", request));
    await first;
  });

  it("cancels the current job by id and settles as cancelled", async () => {
    const pending = deferred<ClearCentralResult>();
    mockIpcCommands({
      clear_central_skills: () => pending.promise,
      cancel_central_clear: true,
    });
    const run = useCentralSkillsStore.getState().clearCentral(request);
    await vi.waitFor(() => expect(ipcInvokeCalls("clear_central_skills")).toHaveLength(1));
    const jobId = useCentralSkillsStore.getState().clearJob?.jobId;

    await useCentralSkillsStore.getState().cancelClearCentral();
    expect(ipcInvokeCalls("cancel_central_clear")[0].args).toEqual({ jobId });
    expect(useCentralSkillsStore.getState().clearJob?.status).toBe("cancelling");

    pending.resolve({ ...centralClearFixtureResult("normal", request), cancelled: true });
    await run;
    expect(useCentralSkillsStore.getState().clearJob?.status).toBe("cancelled");
  });

  it("cancel without a job is a no-op", async () => {
    mockIpcCommands({ cancel_central_clear: true });
    await useCentralSkillsStore.getState().cancelClearCentral();
    expect(ipcInvokeCalls("cancel_central_clear")).toHaveLength(0);
  });

  it("ignores progress after a terminal state", () => {
    const done = {
      jobId: "a",
      phase: "finalize" as const,
      status: "completed" as const,
      completed: 5,
      total: 5,
    };
    const merged = mergeClearProgress(done, {
      jobId: "a",
      phase: "skills",
      status: "running",
      completed: 1,
      total: 5,
    });
    expect(merged).toBe(done);
  });
});
