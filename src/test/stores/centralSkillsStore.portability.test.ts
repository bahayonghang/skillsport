import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  PortableBundleImportPreview,
  PortableBundleImportResult,
  PortableBundleSkillPreview,
} from "@/types";
import * as tauriBridge from "@/lib/ipc";
import { ipcFixtureError } from "@/lib/ipc/errors";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";

function skill(id: string, status: PortableBundleSkillPreview["status"]): PortableBundleSkillPreview {
  return { id, name: id, status, hasGithubSource: false, fileCount: 1, contentBytes: 10 };
}

const preview: PortableBundleImportPreview = {
  previewToken: "token-1",
  createdAt: "2026-10-28T00:00:00Z",
  appVersion: "1.0.0",
  originTargetKind: "local",
  skills: [
    skill("alpha", "new"),
    skill("beta", "identical"),
    skill("gamma", "changed"),
    skill("delta", "invalid"),
  ],
  metadata: {
    registries: { add: 0, exists: 0, update: 0 },
    tagGroups: { add: 0, exists: 0, update: 0 },
    tags: { add: 1, exists: 0, update: 0 },
    savedViews: { add: 0, exists: 0, update: 0 },
  },
  bundleSkippedSkills: [],
};

function importResult(overrides: Partial<PortableBundleImportResult> = {}): PortableBundleImportResult {
  return {
    imported: ["alpha"],
    overwritten: ["gamma"],
    renamed: [],
    skipped: [{ id: "beta", code: "identical" }],
    failed: [],
    metadata: { added: 1, updated: 0, unchanged: 0 },
    cancelled: false,
    ...overrides,
  };
}

/** Route invoke by command name; unknown commands resolve to undefined. */
function routeInvoke(routes: Record<string, (args: unknown) => unknown>) {
  vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
    const route = routes[command];
    return route ? route(args) : undefined;
  });
}

function invokedWith(command: string) {
  return vi.mocked(invoke).mock.calls.filter(([name]) => name === command);
}

describe("centralSkillsStore portability slice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(tauriBridge, "isTauriRuntime").mockReturnValue(true);
    useCentralSkillsStore.getState().resetForTargetChange();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges progress for the active job and ignores late running events", async () => {
    let handler: ((event: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(async (_event, callback) => {
      handler = callback as (event: { payload: unknown }) => void;
      return () => {};
    });
    useCentralSkillsStore.setState((state) => ({
      portabilityJob: { ...state.portabilityJob, jobId: "job-1", kind: "apply", status: "running" },
    }));

    await useCentralSkillsStore.getState().subscribePortabilityProgress();
    expect(vi.mocked(listen).mock.calls[0]?.[0]).toBe("central://portable-bundle-progress");

    handler?.({ payload: { jobId: "job-1", phase: "apply", status: "running", total: 4, completed: 1, currentItem: "alpha" } });
    let job = useCentralSkillsStore.getState().portabilityJob;
    expect(job).toMatchObject({ phase: "apply", status: "running", completed: 1, currentItem: "alpha" });

    handler?.({ payload: { jobId: "other", phase: "apply", status: "failed", total: 9, completed: 9 } });
    expect(useCentralSkillsStore.getState().portabilityJob.completed).toBe(1);

    handler?.({ payload: { jobId: "job-1", phase: "metadata", status: "completed", total: 4, completed: 4 } });
    handler?.({ payload: { jobId: "job-1", phase: "apply", status: "running", total: 4, completed: 2 } });
    job = useCentralSkillsStore.getState().portabilityJob;
    expect(job.status).toBe("completed");
    expect(job.completed).toBe(4);
  });

  it("keeps cancelling while running events arrive and calls the bundle cancel command", async () => {
    useCentralSkillsStore.setState((state) => ({
      portabilityJob: { ...state.portabilityJob, jobId: "job-2", kind: "export", status: "running" },
    }));
    routeInvoke({});

    await useCentralSkillsStore.getState().cancelPortabilityJob();

    expect(invoke).toHaveBeenCalledWith("cancel_portable_bundle_job", { jobId: "job-2" });
    expect(useCentralSkillsStore.getState().portabilityJob.status).toBe("cancelling");
  });

  it("exports a bundle and records the result", async () => {
    const exported = { skillsExported: 3, skippedSkills: [], fileCount: 7, contentBytes: 100, bundleBytes: 80 };
    routeInvoke({ export_portable_bundle: () => exported });

    await expect(
      useCentralSkillsStore.getState().exportPortableBundle("C:/out.skillport"),
    ).resolves.toEqual(exported);

    const [[, args]] = invokedWith("export_portable_bundle");
    expect(args).toMatchObject({ path: "C:/out.skillport", jobId: expect.any(String) });
    const state = useCentralSkillsStore.getState();
    expect(state.portability.lastExport).toEqual(exported);
    expect(state.portabilityJob).toMatchObject({ kind: "export", status: "completed" });
  });

  it("maps export errors to failed or cancelled with a coded error", async () => {
    routeInvoke({
      export_portable_bundle: () => {
        throw ipcFixtureError("portable_bundle.io", "The bundle file could not be read or written.");
      },
    });
    await expect(useCentralSkillsStore.getState().exportPortableBundle("C:/a.skillport")).rejects.toBeTruthy();
    expect(useCentralSkillsStore.getState().portabilityJob).toMatchObject({
      status: "failed",
      error: "portable_bundle.io:The bundle file could not be read or written.",
    });

    routeInvoke({
      export_portable_bundle: () => {
        throw ipcFixtureError("operation.cancelled", "Cancelled.");
      },
    });
    await expect(useCentralSkillsStore.getState().exportPortableBundle("C:/b.skillport")).rejects.toBeTruthy();
    expect(useCentralSkillsStore.getState().portabilityJob.status).toBe("cancelled");
  });

  it("rejects a second job while one is running", async () => {
    useCentralSkillsStore.setState((state) => ({
      portabilityJob: { ...state.portabilityJob, jobId: "busy", kind: "apply", status: "running" },
    }));

    await expect(
      useCentralSkillsStore.getState().previewPortableBundle("C:/x.skillport"),
    ).rejects.toThrow("job.portability_busy");
    expect(invoke).not.toHaveBeenCalled();
    expect(useCentralSkillsStore.getState().portabilityJob.jobId).toBe("busy");
  });

  it("previews a bundle, discarding the previous token and decisions", async () => {
    useCentralSkillsStore.setState((state) => ({
      portability: {
        ...state.portability,
        preview: { ...preview, previewToken: "old-token" },
        decisions: { gamma: { skillId: "gamma", action: "skip" } },
      },
    }));
    routeInvoke({ preview_portable_bundle_import: () => preview });

    await useCentralSkillsStore.getState().previewPortableBundle("C:/in.skillport");

    expect(invoke).toHaveBeenCalledWith("discard_portable_bundle_preview", { previewToken: "old-token" });
    const state = useCentralSkillsStore.getState();
    expect(state.portability.preview).toEqual(preview);
    expect(state.portability.previewPath).toBe("C:/in.skillport");
    expect(state.portability.decisions).toEqual({});
    expect(state.portabilityJob).toMatchObject({ kind: "preview", status: "completed" });
  });

  it("applies with default and explicit decisions, then refreshes Central data", async () => {
    useCentralSkillsStore.setState((state) => ({ portability: { ...state.portability, preview } }));
    useCentralSkillsStore.getState().setPortabilityDecisionsBulk(["changed", "exists_unmanaged"], "overwrite");
    routeInvoke({
      apply_portable_bundle_import: () => importResult(),
      get_central_skills: () => [],
      get_skill_repositories: () => [],
      get_skill_tags: () => [{ id: "t1", name: "imported" }],
      get_central_skill_update_states: () => [],
      list_tag_groups: () => [],
      list_saved_views: () => [],
    });

    const result = await useCentralSkillsStore.getState().applyPortableBundleImport();

    expect(result.imported).toEqual(["alpha"]);
    const [[, args]] = invokedWith("apply_portable_bundle_import");
    expect(args).toMatchObject({
      previewToken: "token-1",
      decisions: [
        { skillId: "alpha", action: "overwrite" },
        { skillId: "beta", action: "skip" },
        { skillId: "gamma", action: "overwrite" },
      ],
    });
    for (const command of ["get_central_skills", "get_skill_tags", "list_tag_groups", "list_saved_views"]) {
      expect(invokedWith(command)).toHaveLength(1);
    }
    const state = useCentralSkillsStore.getState();
    expect(state.tags).toEqual([{ id: "t1", name: "imported" }]);
    expect(state.portability.lastResult).toEqual(result);
    expect(state.portabilityJob.status).toBe("completed");
  });

  it("retries only the given ids and marks partial failures as failed", async () => {
    useCentralSkillsStore.setState((state) => ({
      portability: {
        ...state.portability,
        preview,
        decisions: { gamma: { skillId: "gamma", action: "rename", renameTo: " gamma-2 " } },
      },
    }));
    routeInvoke({
      apply_portable_bundle_import: () =>
        importResult({ imported: [], overwritten: [], failed: [{ id: "gamma-2", code: "write_failed" }] }),
    });

    await useCentralSkillsStore.getState().applyPortableBundleImport(["gamma"]);

    const [[, args]] = invokedWith("apply_portable_bundle_import");
    expect((args as { decisions: unknown }).decisions).toEqual([
      { skillId: "alpha", action: "skip" },
      { skillId: "beta", action: "skip" },
      { skillId: "gamma", action: "rename", renameTo: "gamma-2" },
    ]);
    expect(useCentralSkillsStore.getState().portabilityJob.status).toBe("failed");
  });

  it("keeps the committed result when the post-import refresh fails", async () => {
    useCentralSkillsStore.setState((state) => ({ portability: { ...state.portability, preview } }));
    routeInvoke({
      apply_portable_bundle_import: () => importResult(),
      get_central_skills: () => {
        throw ipcFixtureError("storage.unavailable", "DB error");
      },
    });

    await expect(useCentralSkillsStore.getState().applyPortableBundleImport(
      ["alpha", "beta"],
    )).resolves.toBeTruthy();

    const state = useCentralSkillsStore.getState();
    expect(state.requiresCentralReload).toBe(true);
    expect(state.portabilityJob.status).toBe("completed");
    expect(state.portability.lastResult).not.toBeNull();
  });

  it("does not reset dialog data while a job is running", () => {
    useCentralSkillsStore.setState((state) => ({
      portabilityJob: { ...state.portabilityJob, jobId: "run", kind: "apply", status: "running" },
      portability: { ...state.portability, preview },
    }));
    routeInvoke({});

    useCentralSkillsStore.getState().resetPortabilityDialog();
    expect(useCentralSkillsStore.getState().portability.preview).toEqual(preview);

    useCentralSkillsStore.setState((state) => ({
      portabilityJob: { ...state.portabilityJob, status: "completed" },
    }));
    useCentralSkillsStore.getState().resetPortabilityDialog();
    expect(useCentralSkillsStore.getState().portability.preview).toBeNull();
    expect(invoke).toHaveBeenCalledWith("discard_portable_bundle_preview", { previewToken: "token-1" });
  });
});
