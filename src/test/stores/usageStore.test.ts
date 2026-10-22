import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { mockTauriListen } = vi.hoisted(() => ({
  mockTauriListen: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockTauriListen,
}));

import { UNUSED_REQUEST_THRESHOLD_DAYS, useUsageStore } from "@/stores/usageStore";
import { useTargetStore } from "@/stores/targetStore";
import { ipcFixtureError } from "@/lib/ipc/errors";
import { useUsageBootstrap } from "@/pages/skillUsageBindings";
import type { UsagePageSnapshot, SkillUsageDetail, SkillUsageSummary, UsageRefreshResult } from "@/types/usage";
import {
  ipcInvokeCalls,
  ipcInvokedCommands,
  mockIpcCommand,
  mockIpcCommands,
} from "@/test/support/ipcMock";

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from "sonner";

const toastInfoMock = vi.mocked(toast.info);
const toastErrorMock = vi.mocked(toast.error);
const initialActions = {
  refresh: useUsageStore.getState().refresh,
  subscribeTargetChanged: useUsageStore.getState().subscribeTargetChanged,
  subscribeScanCompleted: useUsageStore.getState().subscribeScanCompleted,
};

function overviewFixture() {
  return {
    kpis: {
      totalCalls: 4,
      uniqueSkills: 2,
      uniqueProjects: 1,
      uniqueSources: 1,
      uniqueSessions: 2,
    },
    topSkills: [],
    heatmap: [],
    lastScanMs: 1700000000000,
  };
}

function refreshPayload(overrides: Partial<UsageRefreshResult> = {}) {
  return {
    summary: {
      cached: false,
      callsWritten: 4,
      providersAvailable: 1,
      scannedAtMs: 1700000000000,
    },
    overview: overviewFixture(),
    recent: [],
    providers: [],
    scope: {
      targetId: "local",
      label: "Local",
      isRemote: false,
      remoteReachable: false,
    },
    usedCachedData: false,
    scanning: false,
    refreshError: null,
    ...overrides,
  };
}

function pageFixture(overrides: Partial<UsagePageSnapshot> = {}): UsagePageSnapshot {
  return {
    overview: overviewFixture(), recent: [],
    providers: [
      { providerId: "claude-code", displayName: "Claude Code", available: true, callCount: 4, scannedAtMs: 1700000000000 },
      { providerId: "codex", displayName: "Codex CLI", available: true, callCount: 4, scannedAtMs: 1700000000000 },
    ],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function skillRows(count: number): SkillUsageSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    skill: `skill-${index}`, count: count - index, projects: 1, sessions: 1,
    lastUsedMs: 1700000000000, matchStatus: "unmatched", resolvedSkillId: null,
    staticTokenEstimate: null, staticByteCount: null,
  }));
}

async function scanCompletionListener() {
  let handler!: (event: { payload: string }) => void;
  mockTauriListen.mockImplementation(async (event: string, callback: unknown) => {
    if (event === "usage://scan-completed") handler = callback as typeof handler;
    return () => undefined;
  });
  await useUsageStore.getState().subscribeScanCompleted();
  return handler;
}

beforeEach(() => {
  toastInfoMock.mockReset();
  toastErrorMock.mockReset();
  mockTauriListen.mockReset();
  mockTauriListen.mockResolvedValue(() => undefined);
  useUsageStore.setState({
    overview: null,
    recent: [],
    providers: [],
    detail: null,
    unused: null,
    unusedLoading: false,
    unusedError: null,
    pendingUnlinkKeys: {},
    scope: null,
    selectedSkill: null,
    loading: false,
    refreshing: false,
    detailLoading: false,
    error: null,
    refreshError: null,
    usedCachedData: false,
    selectedSource: null,
    lastRefreshMs: null,
    backgroundScanning: false,
    ...initialActions,
  });
  useTargetStore.setState({
    targets: [{ id: "local", kind: "local", label: "Local", isActive: true }],
    activeTarget: {
      id: "local",
      kind: "local",
      label: "Local",
      isActive: true,
    },
  });
});

describe("usage page snapshot correctness", () => {
  it.each([false, true])("clears a detail opened from the retained source while the next source is loading: resolved=%s", async (resolved) => {
    const nextPage = deferred<UsagePageSnapshot>();
    const oldDetail = deferred<SkillUsageDetail>();
    const detail: SkillUsageDetail = {
      skill: "old-source-skill", count: 4, sessions: 2,
      firstUsedMs: 1700000000000, lastUsedMs: 1700000000000,
      byProject: [], weekly: [], matchStatus: "unmatched",
      resolvedSkillId: null, staticTokenEstimate: null, staticByteCount: null,
    };
    useUsageStore.setState({ selectedSource: "Claude Code", overview: overviewFixture() });
    mockIpcCommands({
      usage_get_page: () => nextPage.promise,
      usage_get_skill_detail: () => oldDetail.promise,
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    const selection = useUsageStore.getState().selectSource("Codex CLI");
    const readingDetail = useUsageStore.getState().loadDetail(detail.skill);
    if (resolved) {
      oldDetail.resolve(detail);
      await readingDetail;
      expect(useUsageStore.getState().detail).toEqual(detail);
    }
    nextPage.resolve(pageFixture());
    await selection;
    expect(useUsageStore.getState().selectedSource).toBe("Codex CLI");
    expect(useUsageStore.getState().selectedSkill).toBeNull();
    expect(useUsageStore.getState().detail).toBeNull();
    expect(useUsageStore.getState().detailLoading).toBe(false);
    if (!resolved) {
      oldDetail.resolve(detail);
      await readingDetail;
      expect(useUsageStore.getState().detail).toBeNull();
      expect(useUsageStore.getState().detailLoading).toBe(false);
    }
  });

  it.each([51, 144, 1000])("keeps all %i ranking rows across entry, TTL, force, source and background paths", async (count) => {
    const topSkills = skillRows(count);
    const page = pageFixture({ overview: {
      ...overviewFixture(), topSkills,
      kpis: { ...overviewFixture().kpis, uniqueSkills: count },
    } });
    mockIpcCommands({
      usage_refresh: refreshPayload(page), usage_get_page: page,
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    for (const force of [false, false, true]) {
      await useUsageStore.getState().refresh(force);
      expect(useUsageStore.getState().overview?.topSkills).toEqual(topSkills);
    }
    await useUsageStore.getState().selectSource("Claude Code");
    expect(useUsageStore.getState().overview?.topSkills).toEqual(topSkills);
    const completed = await scanCompletionListener();
    completed({ payload: "local" });
    await waitFor(() => expect(ipcInvokeCalls("usage_get_page")).toHaveLength(2));
    expect(useUsageStore.getState().overview?.topSkills).toEqual(topSkills);
  });

  it("publishes provider health and freshness atomically with a silent background page", async () => {
    useUsageStore.setState({
      overview: overviewFixture(), providers: pageFixture().providers,
      lastRefreshMs: 1700000000000, backgroundScanning: true,
      unused: { central: [], platforms: [] }, unusedError: null,
      scope: { targetId: "local", label: "Local", isRemote: false, remoteReachable: false },
    });
    const page = pageFixture({
      overview: { ...overviewFixture(), lastScanMs: 1700000005000, kpis: { ...overviewFixture().kpis, totalCalls: 42 } },
      providers: [{ ...pageFixture().providers[0], callCount: 42, scannedAtMs: 1700000005000 }],
    });
    mockIpcCommands({
      usage_get_page: page,
      usage_get_unused_skills: () => Promise.reject(ipcFixtureError("storage.unavailable", "silent failure")),
    });
    const snapshots: Array<[number | undefined, number | undefined, number | null, boolean, boolean, boolean]> = [];
    const unsubscribe = useUsageStore.subscribe((state) => snapshots.push([
      state.overview?.kpis.totalCalls, state.providers[0]?.callCount,
      state.lastRefreshMs, state.loading, state.refreshing, state.unusedLoading,
    ]));
    const completed = await scanCompletionListener();
    completed({ payload: "local" });
    await waitFor(() => expect(useUsageStore.getState().lastRefreshMs).toBe(1700000005000));
    await waitFor(() => expect(ipcInvokeCalls("usage_get_unused_skills")).toHaveLength(1));
    unsubscribe();
    expect(snapshots.filter(([calls]) => calls === 42).every((snapshot) =>
      snapshot[1] === 42 && snapshot[2] === 1700000005000 && snapshot.slice(3).every((flag) => flag === false),
    )).toBe(true);
    expect(useUsageStore.getState().unusedError).toBeNull();
    expect(useUsageStore.getState().scope?.remoteReachable).toBe(false);
    expect(toastInfoMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("coherently refetches the new source when it changes during a filtered refresh", async () => {
    const pending = deferred<ReturnType<typeof refreshPayload>>();
    useUsageStore.setState({ selectedSource: "Claude Code", overview: overviewFixture() });
    let reads = 0;
    mockIpcCommands({
      usage_refresh: () => pending.promise,
      usage_get_page: () => pageFixture({ overview: {
        ...overviewFixture(), kpis: { ...overviewFixture().kpis, totalCalls: ++reads + 1 },
      } }),
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    const refresh = useUsageStore.getState().refresh(true);
    await useUsageStore.getState().selectSource("Codex CLI");
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(2);
    pending.resolve(refreshPayload({
      overview: { ...overviewFixture(), kpis: { ...overviewFixture().kpis, totalCalls: 81 } },
      providers: pageFixture().providers,
    }));
    await refresh;
    expect(useUsageStore.getState().selectedSource).toBe("Codex CLI");
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(3);
    expect(ipcInvokeCalls("usage_get_page").map((call) => call.args)).toEqual([
      { source: "Codex CLI" }, { source: "Codex CLI" },
    ]);
  });

  it("never relabels an empty filtered refresh payload as an all-platform page", async () => {
    useUsageStore.setState({ selectedSource: "Claude Code", overview: overviewFixture() });
    const allPage = deferred<UsagePageSnapshot>();
    mockIpcCommands({
      usage_refresh: refreshPayload({
        overview: { ...overviewFixture(), kpis: { ...overviewFixture().kpis, totalCalls: 0 } },
        providers: [{ ...pageFixture().providers[1], callCount: 144 }],
      }),
      usage_get_page: () => allPage.promise,
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    const refresh = useUsageStore.getState().refresh(true);
    await waitFor(() => expect(ipcInvokeCalls("usage_get_page")).toHaveLength(1));
    expect(useUsageStore.getState().selectedSource).toBe("Claude Code");
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(4);
    allPage.resolve(pageFixture({ overview: { ...overviewFixture(), kpis: { ...overviewFixture().kpis, totalCalls: 144 } } }));
    await refresh;
    expect(useUsageStore.getState().selectedSource).toBeNull();
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(144);
    expect(ipcInvokeCalls("usage_get_page")[0].args).toEqual({ source: null });
  });

  it("retains a pending source intent when scan-completed overtakes its older read", async () => {
    const old = deferred<UsagePageSnapshot>();
    let reads = 0;
    mockIpcCommands({
      usage_get_page: () => ++reads === 1 ? old.promise : pageFixture({ overview: {
        ...overviewFixture(), kpis: { ...overviewFixture().kpis, totalCalls: 8 },
      } }),
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    const completed = await scanCompletionListener();
    const selection = useUsageStore.getState().selectSource("Codex CLI");
    completed({ payload: "local" });
    await waitFor(() => expect(useUsageStore.getState().selectedSource).toBe("Codex CLI"));
    old.resolve(pageFixture({ overview: { ...overviewFixture(), kpis: { ...overviewFixture().kpis, totalCalls: 99 } } }));
    await selection;
    expect(useUsageStore.getState().loading).toBe(false);
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(8);
    expect(ipcInvokeCalls("usage_get_page")[1].args).toEqual({ source: "Codex CLI" });
  });

  it("preserves refresh-confirmed remote reachability and discards a scope read for an old target", async () => {
    const remote = { targetId: "ssh-a", label: "Remote", isRemote: true, remoteReachable: false };
    useTargetStore.setState({ activeTarget: { id: "ssh-a", kind: "ssh", label: "Remote", isActive: true } });
    useUsageStore.setState({ scope: remote });
    mockIpcCommand("usage_get_scope_info", { ...remote, remoteReachable: true });
    expect((await useUsageStore.getState().loadScope())?.remoteReachable).toBe(false);
    const stale = deferred<typeof remote>();
    mockIpcCommand("usage_get_scope_info", () => stale.promise);
    const reading = useUsageStore.getState().loadScope();
    useTargetStore.setState({ activeTarget: { id: "local", kind: "local", label: "Local", isActive: true } });
    useUsageStore.setState({ scope: null });
    stale.resolve(remote);
    expect(await reading).toBeNull();
    expect(useUsageStore.getState().scope).toBeNull();
  });

  it("settles a pending source loading state when its replacement silent read fails", async () => {
    const old = deferred<UsagePageSnapshot>();
    let reads = 0;
    useUsageStore.setState({ overview: overviewFixture() });
    mockIpcCommand("usage_get_page", () => ++reads === 1
      ? old.promise
      : Promise.reject(ipcFixtureError("storage.unavailable", "silent failure")));
    const completed = await scanCompletionListener();
    const selection = useUsageStore.getState().selectSource("Codex CLI");
    completed({ payload: "local" });
    await waitFor(() => expect(useUsageStore.getState().loading).toBe(false));
    old.resolve(pageFixture());
    await selection;
    expect(useUsageStore.getState().selectedSource).toBeNull();
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(4);
    expect(useUsageStore.getState().error).toBeNull();
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it("refetches instead of overwriting a newer background page with a delayed refresh payload", async () => {
    const pending = deferred<ReturnType<typeof refreshPayload>>();
    const fresh = pageFixture({ overview: { ...overviewFixture(), kpis: { ...overviewFixture().kpis, totalCalls: 42 } } });
    useUsageStore.setState({ overview: overviewFixture() });
    mockIpcCommands({
      usage_refresh: () => pending.promise, usage_get_page: fresh,
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    const completed = await scanCompletionListener();
    const refresh = useUsageStore.getState().refresh(true);
    completed({ payload: "local" });
    await waitFor(() => expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(42));
    const published: number[] = [];
    const unsubscribe = useUsageStore.subscribe((state) => published.push(state.overview?.kpis.totalCalls ?? 0));
    pending.resolve(refreshPayload());
    await refresh;
    unsubscribe();
    expect(published.every((value) => value === 42)).toBe(true);
    expect(ipcInvokeCalls("usage_get_page")).toHaveLength(2);
  });

  it("discards a stale detail rejection when the active target changes before its event arrives", async () => {
    const pending = deferred<SkillUsageDetail>();
    mockIpcCommand("usage_get_skill_detail", () => pending.promise);
    const reading = useUsageStore.getState().loadDetail("old-target-skill");
    useTargetStore.setState({ activeTarget: { id: "ssh-a", kind: "ssh", label: "Remote", isActive: true } });
    useUsageStore.setState({ error: null, selectedSkill: null, detail: null, detailLoading: false });
    pending.reject(ipcFixtureError("storage.unavailable", "old target failed"));
    await reading;
    expect(useUsageStore.getState().error).toBeNull();
    expect(useUsageStore.getState().detailLoading).toBe(false);
  });

  it("does not refresh unused or toast after a filtered refresh read becomes stale across targets", async () => {
    const page = deferred<UsagePageSnapshot>();
    useUsageStore.setState({ overview: overviewFixture(), selectedSource: "Claude Code" });
    mockIpcCommands({
      usage_refresh: refreshPayload({ usedCachedData: true, refreshError: "cached failure" }),
      usage_get_page: () => page.promise,
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    const refresh = useUsageStore.getState().refresh(true);
    await waitFor(() => expect(ipcInvokeCalls("usage_get_page")).toHaveLength(1));
    useTargetStore.setState({ activeTarget: { id: "ssh-a", kind: "ssh", label: "Remote", isActive: true } });
    page.resolve(pageFixture());
    await refresh;
    expect(ipcInvokeCalls("usage_get_unused_skills")).toHaveLength(0);
    expect(toastInfoMock).not.toHaveBeenCalled();
  });
});

describe("usageStore", () => {
  it("unlinks selected agents sequentially, tracks pending state, then refetches once", async () => {
    const uninstall = deferred<void>();
    mockIpcCommands({
      uninstall_skill_from_agent: () => uninstall.promise,
      usage_get_unused_skills: { central: [], platforms: [] },
    });

    const unlink = useUsageStore.getState().unlinkUnusedSkillFromAgents([
      { skillId: "loose-skill", agentId: "codex", rowId: "codex::/loose" },
      { skillId: "loose-skill", agentId: "claude-code" },
    ]);

    // 第一项执行期间：pending key 存在，invoke 参数携带 rowId
    expect(
      useUsageStore.getState().pendingUnlinkKeys["codex::/loose"],
    ).toBe(true);
    expect(ipcInvokeCalls("uninstall_skill_from_agent")[0].args).toEqual({
      skillId: "loose-skill",
      agentId: "codex",
      rowId: "codex::/loose",
    });

    uninstall.resolve();
    const results = await unlink;

    expect(ipcInvokeCalls("uninstall_skill_from_agent").map((c) => c.args)).toEqual([
      { skillId: "loose-skill", agentId: "codex", rowId: "codex::/loose" },
      // Central 条目不传 rowId
      { skillId: "loose-skill", agentId: "claude-code" },
    ]);
    // 整批结束后恰好一次报告重取
    expect(ipcInvokeCalls("usage_get_unused_skills")).toHaveLength(1);
    expect(ipcInvokeCalls("usage_get_unused_skills")[0].args).toEqual({
      source: null,
      thresholdDays: UNUSED_REQUEST_THRESHOLD_DAYS,
    });
    expect(useUsageStore.getState().unused).toEqual({
      central: [],
      platforms: [],
    });
    expect(useUsageStore.getState().pendingUnlinkKeys).toEqual({});
    expect(results).toEqual([
      {
        skillId: "loose-skill",
        agentId: "codex",
        rowId: "codex::/loose",
        ok: true,
        error: null,
      },
      {
        skillId: "loose-skill",
        agentId: "claude-code",
        rowId: null,
        ok: true,
        error: null,
      },
    ]);
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it("collects per-target failures, still refreshes once, and shows the partial toast", async () => {
    mockIpcCommands({
      uninstall_skill_from_agent: ({ agentId }: { agentId: string }) =>
        agentId === "blocked"
          ? Promise.reject(
              ipcFixtureError(
                "installation.pending_central_recovery",
                "unsafe C:/private/path should not be rendered",
              ),
            )
          : Promise.resolve(undefined),
      usage_get_unused_skills: { central: [], platforms: [] },
    });

    const results = await useUsageStore
      .getState()
      .unlinkUnusedSkillFromAgents([
        { skillId: "blocked-skill", agentId: "blocked", rowId: "obs-1" },
        { skillId: "ok-skill", agentId: "fine", rowId: "obs-2" },
      ]);

    expect(ipcInvokedCommands()).toEqual([
      "uninstall_skill_from_agent",
      "uninstall_skill_from_agent",
      "usage_get_unused_skills",
    ]);
    expect(useUsageStore.getState().pendingUnlinkKeys).toEqual({});
    // 逐项失败不弹逐项 toast；整批结束后只有一次部分失败 toast
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    const message = String(toastErrorMock.mock.calls[0][0]);
    expect(message).toMatch(/Removed 1 of 1|1 个失败/);
    expect(message).not.toContain("C:/private/path");
    // 失败原因以逐项结果返回给弹窗呈现
    expect(results).toEqual([
      {
        skillId: "blocked-skill",
        agentId: "blocked",
        rowId: "obs-1",
        ok: false,
        error: expect.stringMatching(/待恢复|pending Central recovery/i),
      },
      {
        skillId: "ok-skill",
        agentId: "fine",
        rowId: "obs-2",
        ok: true,
        error: null,
      },
    ]);
  });

  it("clears pending keys via finally when an agent rejects mid-batch", async () => {
    const first = deferred<void>();
    mockIpcCommand("uninstall_skill_from_agent", ({ agentId }: { agentId: string }) =>
      agentId === "first" ? first.promise : Promise.resolve(undefined),
    );
    mockIpcCommand("usage_get_unused_skills", { central: [], platforms: [] });

    const unlink = useUsageStore
      .getState()
      .unlinkUnusedSkillFromAgents([
        { skillId: "s", agentId: "first", rowId: "r1" },
        { skillId: "s", agentId: "second", rowId: "r2" },
      ]);

    expect(useUsageStore.getState().pendingUnlinkKeys).toEqual({ r1: true });
    first.reject(new Error("boom"));
    await unlink;

    expect(useUsageStore.getState().pendingUnlinkKeys).toEqual({});
    expect(ipcInvokeCalls("usage_get_unused_skills")).toHaveLength(1);
  });

  it("refresh uses the single usage_refresh payload and stores all returned panels", async () => {
    mockIpcCommands({
      usage_refresh: refreshPayload(),
      usage_get_unused_skills: { central: [], platforms: [] },
    });

    const result = await useUsageStore.getState().refresh(true);

    expect(result?.summary.callsWritten).toBe(4);
    expect(ipcInvokeCalls("usage_refresh")[0].args).toEqual({ force: true, source: null });

    const state = useUsageStore.getState();
    expect(state.overview?.kpis.totalCalls).toBe(4);
    expect(state.refreshing).toBe(false);
    expect(state.lastRefreshMs).toBe(1700000000000);

    // 成功扫描后自动刷新未使用清单，且只请求最严阈值（视图本地重分类 30/60/90）
    await waitFor(() =>
      expect(ipcInvokeCalls("usage_get_unused_skills")).toHaveLength(1),
    );
    expect(ipcInvokeCalls("usage_get_unused_skills")[0].args).toEqual({
      source: null,
      thresholdDays: UNUSED_REQUEST_THRESHOLD_DAYS,
    });
    expect(useUsageStore.getState().unused).toEqual({
      central: [],
      platforms: [],
    });
  });

  it("deduplicates concurrent refresh calls for the same active target", async () => {
    type RefreshPayload = ReturnType<typeof refreshPayload>;
    let resolveRefresh: (value: RefreshPayload) => void = () => {
      throw new Error("refresh resolver missing");
    };
    mockIpcCommand(
      "usage_refresh",
      () =>
        new Promise<RefreshPayload>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = useUsageStore.getState().refresh(false);
    const second = useUsageStore.getState().refresh(true);

    expect(ipcInvokeCalls("usage_refresh")).toHaveLength(1);
    expect(second).not.toBeNull();

    resolveRefresh(refreshPayload());

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult?.summary.callsWritten).toBe(4);
    expect(secondResult?.summary.callsWritten).toBe(4);
  });

  it("keeps cached payload on remote refresh failure and shows cached-data toast", async () => {
    mockIpcCommand(
      "usage_refresh",
      refreshPayload({
        summary: {
          cached: true,
          callsWritten: 0,
          providersAvailable: 0,
          scannedAtMs: 1700000000000,
        },
        scope: {
          targetId: "ssh-prod",
          label: "alice@prod",
          isRemote: true,
          remoteReachable: false,
        },
        usedCachedData: true,
        refreshError: "ssh timeout",
      }),
    );
    useTargetStore.setState({
      targets: [
        { id: "ssh-prod", kind: "ssh", label: "alice@prod", isActive: true },
      ],
      activeTarget: {
        id: "ssh-prod",
        kind: "ssh",
        label: "alice@prod",
        isActive: true,
      },
    });

    const result = await useUsageStore.getState().refresh(true);

    expect(result?.usedCachedData).toBe(true);
    expect(result?.refreshError).toContain("ssh timeout");
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(4);
    expect(useUsageStore.getState().scope?.remoteReachable).toBe(false);
    expect(useUsageStore.getState().error).toBeNull();
    expect(useUsageStore.getState().usedCachedData).toBe(true);
    expect(useUsageStore.getState().refreshError).toContain("ssh timeout");
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
  });

  it("refresh writes error on backend failure and stops refreshing", async () => {
    mockIpcCommand("usage_refresh", () =>
      Promise.reject(ipcFixtureError("storage.unavailable", "io error")),
    );
    const summary = await useUsageStore.getState().refresh(false);
    expect(summary).toBeNull();
    const state = useUsageStore.getState();
    expect(state.error).toContain("io error");
    expect(state.refreshing).toBe(false);
  });

  it("selectSource reloads a coherent page with the selected source", async () => {
    mockIpcCommands({
      usage_get_page: pageFixture({ overview: {
        ...overviewFixture(),
        kpis: {
          ...overviewFixture().kpis,
          totalCalls: 2,
          uniqueSessions: 2,
        },
      } }),
      usage_get_unused_skills: { central: [], platforms: [] },
    });

    await useUsageStore.getState().selectSource("Claude Code");

    expect(useUsageStore.getState().selectedSource).toBe("Claude Code");
    expect(ipcInvokedCommands()).toEqual([
      "usage_get_page",
      "usage_get_unused_skills",
    ]);
    expect(ipcInvokeCalls("usage_get_page")[0].args).toEqual({
      source: "Claude Code",
    });
    // source 切换同样作用于未使用报告
    expect(ipcInvokeCalls("usage_get_unused_skills")[0].args).toEqual({
      source: "Claude Code",
      thresholdDays: UNUSED_REQUEST_THRESHOLD_DAYS,
    });
  });

  it("refresh preserves selected source when the provider still has calls", async () => {
    useUsageStore.setState({ selectedSource: "Claude Code" });
    mockIpcCommands({
      usage_refresh: refreshPayload({
        providers: [
          {
            providerId: "claude-code",
            displayName: "Claude Code",
            available: true,
            callCount: 4,
            scannedAtMs: 1700000000000,
          },
        ],
      }),
      usage_get_unused_skills: { central: [], platforms: [] },
    });

    await useUsageStore.getState().refresh(true);
    await waitFor(() => expect(ipcInvokeCalls()).toHaveLength(2));

    expect(useUsageStore.getState().selectedSource).toBe("Claude Code");
    expect(ipcInvokeCalls("usage_refresh")[0].args).toEqual({
      force: true,
      source: "Claude Code",
    });
    expect(ipcInvokeCalls("usage_get_page")).toHaveLength(0);
    // 未使用报告沿用同一 source 口径
    expect(ipcInvokeCalls("usage_get_unused_skills")[0].args).toEqual({
      source: "Claude Code",
      thresholdDays: UNUSED_REQUEST_THRESHOLD_DAYS,
    });
  });

  it("refresh falls back to all platforms when selected provider has no calls", async () => {
    useUsageStore.setState({ selectedSource: "Claude Code" });
    mockIpcCommands({
      usage_refresh: refreshPayload({
        summary: {
          cached: false,
          callsWritten: 0,
          providersAvailable: 0,
          scannedAtMs: 1700000000000,
        },
        providers: [
          {
            providerId: "claude-code",
            displayName: "Claude Code",
            available: true,
            callCount: 0,
            scannedAtMs: 1700000000000,
          },
        ],
      }),
      usage_get_unused_skills: { central: [], platforms: [] },
      usage_get_page: pageFixture(),
    });

    await useUsageStore.getState().refresh(true);

    expect(useUsageStore.getState().selectedSource).toBeNull();
    expect(ipcInvokeCalls("usage_refresh")).toHaveLength(1);
  });

  it("bootstrap refreshes when active target differs from cached usage scope inside TTL", async () => {
    const refresh = vi.fn(async () => null);
    const subscribeTargetChanged = vi.fn(async () => () => undefined);
    const subscribeScanCompleted = vi.fn(async () => () => undefined);
    useUsageStore.setState({
      overview: overviewFixture(),
      recent: [],
      providers: [],
      scope: {
        targetId: "local",
        label: "Local",
        isRemote: false,
        remoteReachable: false,
      },
      lastRefreshMs: Date.now(),
      refresh,
      subscribeTargetChanged,
      subscribeScanCompleted,
    });
    useTargetStore.setState({
      targets: [
        { id: "local", kind: "local", label: "Local", isActive: false },
        { id: "ssh-prod", kind: "ssh", label: "prod", isActive: true },
      ],
      activeTarget: {
        id: "ssh-prod",
        kind: "ssh",
        label: "prod",
        isActive: true,
      },
    });

    renderHook(() => useUsageBootstrap());

    await waitFor(() => expect(refresh).toHaveBeenCalledWith(false));
    expect(subscribeTargetChanged).toHaveBeenCalledTimes(1);
    expect(subscribeScanCompleted).toHaveBeenCalledTimes(1);
  });

  it("bootstrap cleans up late listener registration after unmount", async () => {
    let resolveUnlisten: (value: () => void) => void = () => {
      throw new Error("listener resolver missing");
    };
    const unlisten = vi.fn();
    const subscribeTargetChanged = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveUnlisten = resolve;
        }),
    );
    useUsageStore.setState({
      overview: overviewFixture(),
      recent: [],
      providers: [],
      scope: {
        targetId: "local",
        label: "Local",
        isRemote: false,
        remoteReachable: false,
      },
      lastRefreshMs: Date.now(),
      refresh: vi.fn(async () => null),
      subscribeTargetChanged,
    });

    const { unmount } = renderHook(() => useUsageBootstrap());
    unmount();
    resolveUnlisten(unlisten);

    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("prevents a slow source request from overwriting the latest selection", async () => {
    const claudePage = deferred<UsagePageSnapshot>();
    const codexPage = deferred<UsagePageSnapshot>();
    mockIpcCommand(
      "usage_get_page",
      ({ source }: { source: string | null }) =>
        source === "Claude Code"
          ? claudePage.promise
          : codexPage.promise,
    );

    const first = useUsageStore.getState().selectSource("Claude Code");
    const second = useUsageStore.getState().selectSource("Codex CLI");
    codexPage.resolve(pageFixture({ overview: {
      ...overviewFixture(),
      kpis: { ...overviewFixture().kpis, totalCalls: 2 },
    } }));
    await second;
    expect(useUsageStore.getState().selectedSource).toBe("Codex CLI");
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(2);

    claudePage.resolve(pageFixture({ overview: {
      ...overviewFixture(),
      kpis: { ...overviewFixture().kpis, totalCalls: 99 },
    } }));
    await first;
    expect(useUsageStore.getState().selectedSource).toBe("Codex CLI");
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(2);
  });

  it("keeps filtered data visible during refresh and commits the returned filtered page atomically", async () => {
    useUsageStore.setState({
      selectedSource: "Claude Code",
      overview: overviewFixture(),
      recent: [],
    });
    const filteredRefresh = deferred<ReturnType<typeof refreshPayload>>();
    mockIpcCommands({
      usage_refresh: () => filteredRefresh.promise,
      usage_get_unused_skills: { central: [], platforms: [] },
    });

    const refresh = useUsageStore.getState().refresh(true);
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(4);

    filteredRefresh.resolve(refreshPayload({ overview: {
      ...overviewFixture(),
      kpis: { ...overviewFixture().kpis, totalCalls: 3 },
    }, providers: [{
      providerId: "claude-code", displayName: "Claude Code", available: true,
      callCount: 3, scannedAtMs: 1700000000000,
    }] }));
    await refresh;
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(3);
    expect(useUsageStore.getState().selectedSource).toBe("Claude Code");
    expect(ipcInvokeCalls("usage_get_page")).toHaveLength(0);
  });

  it("passes the selected source to detail and ignores stale detail results", async () => {
    const detailRequest = deferred<{
      skill: string;
      count: number;
      sessions: number;
      firstUsedMs: number;
      lastUsedMs: number;
      byProject: never[];
      weekly: never[];
      matchStatus: "unmatched";
      resolvedSkillId: null;
      staticTokenEstimate: null;
      staticByteCount: null;
    }>();
    useUsageStore.setState({ selectedSource: "Claude Code" });
    mockIpcCommand("usage_get_skill_detail", () => detailRequest.promise);

    const loading = useUsageStore.getState().loadDetail("review");
    expect(ipcInvokeCalls("usage_get_skill_detail")[0].args).toEqual({
      skill: "review",
      source: "Claude Code",
    });
    useUsageStore.getState().clearDetail();
    detailRequest.resolve({
      skill: "review",
      count: 1,
      sessions: 1,
      firstUsedMs: 1,
      lastUsedMs: 1,
      byProject: [],
      weekly: [],
      matchStatus: "unmatched",
      resolvedSkillId: null,
      staticTokenEstimate: null,
      staticByteCount: null,
    });
    await loading;
    expect(useUsageStore.getState().detail).toBeNull();
    expect(useUsageStore.getState().selectedSkill).toBeNull();
  });

  it("clears visible page data and forces a refresh when the target changes", async () => {
    type TargetChangedHandler = (event: { payload: string }) => void;
    let targetChangedHandler: TargetChangedHandler | undefined;
    mockTauriListen.mockImplementation(
      async (_event: string, handler: unknown) => {
        targetChangedHandler = handler as TargetChangedHandler;
        return () => undefined;
      },
    );
    const refresh = vi.fn(async () => null);
    useUsageStore.setState({
      overview: overviewFixture(),
      recent: [
        {
          skill: "review",
          timestampMs: 1,
          project: "/home/demo/repo",
          sessionId: "s1",
          source: "Claude Code",
          matchStatus: "matched",
          resolvedSkillId: "review",
        },
      ],
      providers: [
        {
          providerId: "claude-code",
          displayName: "Claude Code",
          available: true,
          callCount: 4,
          scannedAtMs: 1700000000000,
        },
      ],
      selectedSource: "Claude Code",
      loading: true,
      unused: {
        central: [
          {
            skillId: "legacy-cleanup",
            name: "legacy-cleanup",
            matchStatus: "matched" as const,
            origin: "central" as const,
            agents: [
              {
                agentId: "claude-code",
                linkType: "symlink",
                installedPath: "C:/agents/claude/legacy-cleanup",
                hasPendingRecovery: false,
              },
            ],
            installs: [],
            installedPath: null,
            callCount: 0,
            lastUsedMs: null,
            staticTokenEstimate: 960,
            staticByteCount: 3_840,
            status: "never_used" as const,
          },
        ],
        platforms: [],
      },
      unusedLoading: true,
      backgroundScanning: true,
      refresh,
    });

    await useUsageStore.getState().subscribeTargetChanged();
    expect(targetChangedHandler).toBeDefined();
    targetChangedHandler!({ payload: "ssh-prod" });

    const state = useUsageStore.getState();
    expect(state.overview).toBeNull();
    expect(state.recent).toEqual([]);
    expect(state.providers).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.selectedSource).toBeNull();
    expect(state.unused).toBeNull();
    expect(state.unusedLoading).toBe(false);
    expect(state.unusedError).toBeNull();
    expect(state.backgroundScanning).toBe(false);
    expect(refresh).toHaveBeenCalledWith(true);
  });

  it("refreshUnused requests the strictest threshold once and commits the report", async () => {
    const report = {
      central: [
        {
          skillId: "legacy-cleanup",
          name: "legacy-cleanup",
          matchStatus: "matched",
          origin: "central",
          agents: [
            {
              agentId: "claude-code",
              linkType: "symlink",
              installedPath: "C:/agents/claude/legacy-cleanup",
              hasPendingRecovery: false,
            },
          ],
          installs: [],
          installedPath: null,
          callCount: 0,
          lastUsedMs: null,
          staticTokenEstimate: 960,
          staticByteCount: 3840,
          status: "never_used",
        },
      ],
      platforms: [],
    };
    mockIpcCommand("usage_get_unused_skills", report);

    await useUsageStore.getState().refreshUnused();

    expect(ipcInvokeCalls("usage_get_unused_skills")[0].args).toEqual({
      source: null,
      thresholdDays: UNUSED_REQUEST_THRESHOLD_DAYS,
    });
    const state = useUsageStore.getState();
    expect(state.unused).toEqual(report);
    expect(state.unusedLoading).toBe(false);
    expect(state.unusedError).toBeNull();
  });

  it("discards an out-of-order unused response", async () => {
    const first = deferred<{ central: never[]; platforms: never[] }>();
    const second = deferred<{
      central: { name: string }[];
      platforms: never[];
    }>();
    let call = 0;
    mockIpcCommand("usage_get_unused_skills", () =>
      call++ === 0 ? first.promise : second.promise,
    );

    const staleRequest = useUsageStore.getState().refreshUnused();
    const latestRequest = useUsageStore.getState().refreshUnused();

    second.resolve({ central: [{ name: "new" }], platforms: [] });
    await latestRequest;
    expect(useUsageStore.getState().unused?.central[0]?.name).toBe("new");

    first.resolve({ central: [], platforms: [] });
    await staleRequest;
    expect(useUsageStore.getState().unused?.central[0]?.name).toBe("new");
    expect(useUsageStore.getState().unusedLoading).toBe(false);
  });

  it("discards unused results when the target changes mid-flight", async () => {
    const pending = deferred<{ central: never[]; platforms: never[] }>();
    mockIpcCommand("usage_get_unused_skills", () => pending.promise);

    const request = useUsageStore.getState().refreshUnused();
    useTargetStore.setState({
      targets: [
        { id: "ssh-prod", kind: "ssh", label: "alice@prod", isActive: true },
      ],
      activeTarget: {
        id: "ssh-prod",
        kind: "ssh",
        label: "alice@prod",
        isActive: true,
      },
    });
    pending.resolve({ central: [], platforms: [] });
    await request;

    expect(useUsageStore.getState().unused).toBeNull();
  });

  it("records an unused-specific error without touching the page error", async () => {
    mockIpcCommand("usage_get_unused_skills", () =>
      Promise.reject(ipcFixtureError("storage.unavailable", "unused failed")),
    );

    await useUsageStore.getState().refreshUnused();

    const state = useUsageStore.getState();
    expect(state.unused).toBeNull();
    expect(state.unusedLoading).toBe(false);
    expect(state.unusedError).toContain("unused failed");
    expect(state.error).toBeNull();
  });

  it("marks backgroundScanning when refresh returns a cached page mid-scan", async () => {
    mockIpcCommands({
      usage_refresh: refreshPayload({ scanning: true }),
      usage_get_unused_skills: { central: [], platforms: [] },
    });

    await useUsageStore.getState().refresh(true);

    const state = useUsageStore.getState();
    expect(state.backgroundScanning).toBe(true);
    expect(state.overview?.kpis.totalCalls).toBe(4);
    expect(state.refreshing).toBe(false);
  });

  it("silently refetches page data when the background scan completes", async () => {
    type ScanCompletedHandler = (event: { payload: string }) => void;
    let scanCompletedHandler: ScanCompletedHandler | undefined;
    mockTauriListen.mockImplementation(
      async (event: string, handler: unknown) => {
        if (event === "usage://scan-completed") {
          scanCompletedHandler = handler as ScanCompletedHandler;
        }
        return () => undefined;
      },
    );
    const freshOverview = {
      ...overviewFixture(),
      kpis: { ...overviewFixture().kpis, totalCalls: 42 },
    };
    mockIpcCommands({
      usage_get_page: pageFixture({ overview: freshOverview }),
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    useUsageStore.setState({
      overview: overviewFixture(),
      backgroundScanning: true,
      refreshing: false,
      loading: false,
    });

    await useUsageStore.getState().subscribeScanCompleted();
    expect(scanCompletedHandler).toBeDefined();
    scanCompletedHandler!({ payload: "local" });

    await waitFor(() =>
      expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(42),
    );
    expect(ipcInvokeCalls("usage_get_page")[0].args).toEqual({
      source: null,
    });
    expect(ipcInvokeCalls("usage_get_unused_skills")).toHaveLength(1);
    // 静默更新：无 loading/refreshing 抖动，无 toast，无 error
    const state = useUsageStore.getState();
    expect(state.backgroundScanning).toBe(false);
    expect(state.refreshing).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it("ignores scan-completed events for other targets", async () => {
    type ScanCompletedHandler = (event: { payload: string }) => void;
    let scanCompletedHandler: ScanCompletedHandler | undefined;
    mockTauriListen.mockImplementation(
      async (event: string, handler: unknown) => {
        if (event === "usage://scan-completed") {
          scanCompletedHandler = handler as ScanCompletedHandler;
        }
        return () => undefined;
      },
    );
    mockIpcCommand("usage_get_page", pageFixture());
    useUsageStore.setState({
      overview: overviewFixture(),
      backgroundScanning: true,
    });

    await useUsageStore.getState().subscribeScanCompleted();
    scanCompletedHandler!({ payload: "ssh-prod" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ipcInvokeCalls()).toHaveLength(0);
    expect(useUsageStore.getState().backgroundScanning).toBe(true);
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(4);
  });

  it("discards a silent scan refetch when the source changes mid-flight", async () => {
    type ScanCompletedHandler = (event: { payload: string }) => void;
    let scanCompletedHandler: ScanCompletedHandler | undefined;
    mockTauriListen.mockImplementation(
      async (event: string, handler: unknown) => {
        if (event === "usage://scan-completed") {
          scanCompletedHandler = handler as ScanCompletedHandler;
        }
        return () => undefined;
      },
    );
    const stalePage = deferred<UsagePageSnapshot>();
    mockIpcCommands({
      usage_get_page: ({ source }: { source: string | null }) =>
        source === null
          ? stalePage.promise
          : pageFixture({ overview: {
              ...overviewFixture(),
              kpis: { ...overviewFixture().kpis, totalCalls: 7 },
            } }),
      usage_get_unused_skills: { central: [], platforms: [] },
    });
    useUsageStore.setState({ overview: overviewFixture() });

    await useUsageStore.getState().subscribeScanCompleted();
    scanCompletedHandler!({ payload: "local" });
    await waitFor(() =>
      expect(ipcInvokeCalls("usage_get_page")).toHaveLength(1),
    );

    // 静默重取尚未返回时用户切换 source：旧响应必须被序列号守卫丢弃
    await useUsageStore.getState().selectSource("Codex CLI");
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(7);

    stalePage.resolve(pageFixture({ overview: {
      ...overviewFixture(),
      kpis: { ...overviewFixture().kpis, totalCalls: 99 },
    } }));
    await waitFor(() =>
      expect(ipcInvokeCalls("usage_get_page")).toHaveLength(2),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useUsageStore.getState().selectedSource).toBe("Codex CLI");
    expect(useUsageStore.getState().overview?.kpis.totalCalls).toBe(7);
  });
});
