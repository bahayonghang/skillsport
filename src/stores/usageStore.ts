import { create } from "zustand";
import { toast } from "sonner";

import i18n from "@/i18n";
import { formatBackendError } from "@/lib/backendError";
import { invoke, listen } from "@/lib/ipc";
import { useTargetStore } from "@/stores/targetStore";
import type {
  ProviderHealth,
  RecentSkillCall,
  SkillUsageDetail,
  UnusedSkillsReport,
  UnusedUnlinkRequest,
  UnusedUnlinkResult,
  UsageOverview,
  UsagePageSnapshot,
  UsageRefreshResult,
  UsageScopeInfo,
} from "@/types/usage";

interface UsageState {
  overview: UsageOverview | null;
  recent: RecentSkillCall[];
  providers: ProviderHealth[];
  detail: SkillUsageDetail | null;
  unused: UnusedSkillsReport | null;
  unusedLoading: boolean;
  unusedError: string | null;
  /** 进行中的 unlink 动作（key = rowId ?? `${agentId}::${skillId}`），驱动按钮 spinner */
  pendingUnlinkKeys: Record<string, boolean>;
  scope: UsageScopeInfo | null;
  selectedSource: string | null;
  selectedSkill: string | null;
  loading: boolean;
  refreshing: boolean;
  detailLoading: boolean;
  error: string | null;
  refreshError: string | null;
  usedCachedData: boolean;
  lastRefreshMs: number | null;
  /** 本地 target 返回过期缓存页时为 true：后台重扫中，完成后静默重取。 */
  backgroundScanning: boolean;

  refresh: (force?: boolean) => Promise<UsageRefreshResult | null>;
  selectSource: (source: string | null) => Promise<void>;
  loadDetail: (skill: string) => Promise<void>;
  clearDetail: () => void;
  refreshUnused: (silent?: boolean) => Promise<void>;
  unlinkUnusedSkillFromAgents: (
    targets: UnusedUnlinkRequest[],
  ) => Promise<UnusedUnlinkResult[]>;
  loadScope: () => Promise<UsageScopeInfo | null>;
  subscribeTargetChanged: () => Promise<() => void>;
  subscribeScanCompleted: () => Promise<() => void>;
}

let inFlightRefresh: {
  targetId: string;
  promise: Promise<UsageRefreshResult | null>;
} | null = null;
let refreshSequence = 0;
let pageSequence = 0;
let detailSequence = 0;
let unusedSequence = 0;
let pendingSourceRequest: {
  source: string | null;
  targetId: string;
} | null = null;

/**
 * 未使用面板只向后端请求一次最严阈值（30 天）。30/60/90 天切换是视图本地的
 * 重新分类（callCount === 0 → never_used，否则按 lastUsedMs 与选中阈值比较），
 * 30 天报告是 60/90 天结果的超集，因此前端重分类精确、且不再触发后端往返。
 */
export const UNUSED_REQUEST_THRESHOLD_DAYS = 30;

function activeUsageTargetId(): string {
  return useTargetStore.getState().activeTarget.id ?? "local";
}

function pageRequestMatches(request: number, targetId: string): boolean {
  return request === pageSequence && targetId === activeUsageTargetId();
}

async function loadPageForSource(source: string | null) {
  const page: UsagePageSnapshot = await invoke("usage_get_page", { source });
  if (source && !page.providers.some((provider) => provider.displayName === source && provider.callCount > 0)) {
    return { page: await invoke("usage_get_page", { source: null }), source: null };
  }
  return { page, source };
}

/** 与 skillStore 的 skillActionKey 同一约定：rowId 唯一标识 observation 行。 */
export function unlinkActionKey(
  agentId: string,
  skillId: string,
  rowId?: string | null,
): string {
  return rowId ?? `${agentId}::${skillId}`;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  overview: null,
  recent: [],
  providers: [],
  detail: null,
  unused: null,
  unusedLoading: false,
  unusedError: null,
  pendingUnlinkKeys: {},
  scope: null,
  selectedSource: null,
  selectedSkill: null,
  loading: false,
  refreshing: false,
  detailLoading: false,
  error: null,
  refreshError: null,
  usedCachedData: false,
  lastRefreshMs: null,
  backgroundScanning: false,

  async refresh(force = false) {
    const targetId = activeUsageTargetId();
    if (inFlightRefresh && inFlightRefresh.targetId === targetId) {
      return inFlightRefresh.promise;
    }

    const requestSequence = ++refreshSequence;
    const source = get().selectedSource;
    const pageAtRefreshStart = pageSequence;
    const refreshPromise = (async () => {
      const stillLatestRequest = () =>
        requestSequence === refreshSequence &&
        targetId === activeUsageTargetId();

      set({ refreshing: true, error: null, refreshError: null });
      try {
        const result = await invoke("usage_refresh", { force, source });
        if (!stillLatestRequest()) return result;

        const commonState = {
          scope: result.scope,
          refreshing: false,
          refreshError: result.refreshError,
          usedCachedData: result.usedCachedData,
          backgroundScanning: result.scanning,
          error:
            result.refreshError && !result.usedCachedData
              ? result.refreshError
              : null,
        };
        const sourceRequest = pendingSourceRequest;
        const selected = sourceRequest?.targetId === targetId
          ? sourceRequest.source
          : get().selectedSource;
        const selectedStillExists = selected
          ? result.providers.some(
              (provider) =>
                provider.displayName === selected && provider.callCount > 0,
            )
          : false;

        const nextSource = selectedStillExists ? selected : null;
        const pageWasReplaced = pageSequence !== pageAtRefreshStart;
        const pageRequest = ++pageSequence;
        if (pendingSourceRequest === sourceRequest) pendingSourceRequest = null;
        if (nextSource !== source || pageWasReplaced) {
          set(commonState);
          try {
            const { page, source: pageSource } = await loadPageForSource(nextSource);
            if (
              stillLatestRequest() &&
              pageRequestMatches(pageRequest, targetId)
            ) {
              if (pageSource !== get().selectedSource) {
                ++detailSequence;
                set({ selectedSkill: null, detail: null, detailLoading: false });
              }
              set({
                ...page,
                selectedSource: pageSource,
                loading: false,
                lastRefreshMs: page.overview.lastScanMs,
              });
            }
          } catch (error) {
            if (stillLatestRequest() && pageRequestMatches(pageRequest, targetId)) {
              set({ loading: false, error: errorMessage(error) });
            }
          }
        } else {
          if (nextSource !== get().selectedSource) {
            ++detailSequence;
          }
          set({
            ...commonState,
            overview: result.overview,
            recent: result.recent,
            providers: result.providers,
            lastRefreshMs: result.overview.lastScanMs,
            selectedSource: nextSource,
            loading: false,
            ...(nextSource !== get().selectedSource
              ? { selectedSkill: null, detail: null, detailLoading: false }
              : {}),
          });
        }

        if (!stillLatestRequest()) return result;
        // 未使用清单派生自 skill_calls，只在成功扫描后刷新；面板自身有序列号防陈旧。
        void get().refreshUnused();

        if (result.usedCachedData && result.refreshError) {
          toast.info(i18n.t("skillUsage.showingCachedAfterError"));
        }
        return result;
      } catch (error) {
        if (stillLatestRequest()) {
          const message = errorMessage(error);
          const hasCachedPage = get().overview !== null;
          set({
            refreshing: false,
            refreshError: message,
            usedCachedData: hasCachedPage,
            error: hasCachedPage ? null : message,
          });
        }
        return null;
      }
    })();

    inFlightRefresh = { targetId, promise: refreshPromise };
    return refreshPromise.finally(() => {
      if (inFlightRefresh?.promise === refreshPromise) {
        inFlightRefresh = null;
      }
    });
  },

  async selectSource(source) {
    if (source === get().selectedSource && pendingSourceRequest === null) return;

    const targetId = activeUsageTargetId();
    const requestSequence = ++pageSequence;
    const sourceRequest = { source, targetId };
    pendingSourceRequest = sourceRequest;
    ++detailSequence;
    set({
      loading: true,
      error: null,
      selectedSkill: null,
      detail: null,
      detailLoading: false,
    });

    try {
      const { page, source: pageSource } = await loadPageForSource(source);
      if (pageRequestMatches(requestSequence, targetId)) {
        const sourceChanged = pageSource !== get().selectedSource;
        if (sourceChanged) ++detailSequence;
        set({
          ...page,
          lastRefreshMs: page.overview.lastScanMs,
          selectedSource: pageSource,
          loading: false,
          ...(sourceChanged
            ? { selectedSkill: null, detail: null, detailLoading: false }
            : {}),
        });
        // source 口径同样作用于未使用报告的 calls 聚合，随 source 切换重取。
        void get().refreshUnused();
      }
    } catch (error) {
      if (pageRequestMatches(requestSequence, targetId)) {
        set({ loading: false, error: errorMessage(error) });
      }
    } finally {
      if (pendingSourceRequest === sourceRequest) pendingSourceRequest = null;
    }
  },

  async loadDetail(skill) {
    const targetId = activeUsageTargetId();
    const source = get().selectedSource;
    const requestSequence = ++detailSequence;
    set({
      selectedSkill: skill,
      detail: null,
      detailLoading: true,
      error: null,
    });
    try {
      const detail = await invoke("usage_get_skill_detail", { skill, source });
      if (
        requestSequence === detailSequence &&
        targetId === activeUsageTargetId() &&
        source === get().selectedSource &&
        skill === get().selectedSkill
      ) {
        set({ detail, detailLoading: false });
      }
    } catch (error) {
      if (
        requestSequence === detailSequence &&
        targetId === activeUsageTargetId() &&
        source === get().selectedSource &&
        skill === get().selectedSkill
      ) {
        set({ detailLoading: false, error: errorMessage(error) });
      }
    }
  },

  clearDetail() {
    ++detailSequence;
    set({ selectedSkill: null, detail: null, detailLoading: false });
  },

  async refreshUnused(silent = false) {
    const targetId = activeUsageTargetId();
    const source = get().selectedSource;
    const requestSequence = ++unusedSequence;
    if (!silent) set({ unusedLoading: true, unusedError: null });
    try {
      const unused = await invoke("usage_get_unused_skills", {
        source,
        thresholdDays: UNUSED_REQUEST_THRESHOLD_DAYS,
      });
      if (
        requestSequence === unusedSequence &&
        targetId === activeUsageTargetId() &&
        source === get().selectedSource
      ) {
        set({ unused, unusedLoading: false });
      }
    } catch (error) {
      if (
        requestSequence === unusedSequence &&
        targetId === activeUsageTargetId()
      ) {
        set({
          unusedLoading: false,
          ...(!silent ? { unusedError: errorMessage(error) } : {}),
        });
      }
    }
  },

  async unlinkUnusedSkillFromAgents(targets) {
    const results: UnusedUnlinkResult[] = [];
    // 顺序执行：后端 Central mutation lock 本就串行化，N ≤ Agent 数，量级个位数。
    for (const target of targets) {
      const actionKey = unlinkActionKey(
        target.agentId,
        target.skillId,
        target.rowId,
      );
      set((state) => ({
        pendingUnlinkKeys: { ...state.pendingUnlinkKeys, [actionKey]: true },
      }));
      let error: string | null = null;
      try {
        await invoke("uninstall_skill_from_agent", {
          skillId: target.skillId,
          agentId: target.agentId,
          ...(target.rowId ? { rowId: target.rowId } : {}),
        });
      } catch (err) {
        error = formatBackendError(err, i18n.t);
      } finally {
        set((state) => {
          const next = { ...state.pendingUnlinkKeys };
          delete next[actionKey];
          return { pendingUnlinkKeys: next };
        });
      }
      results.push({
        skillId: target.skillId,
        agentId: target.agentId,
        rowId: target.rowId ?? null,
        ok: error === null,
        error,
      });
    }
    // observation/installations 行已随后端 unlink 清除，整批结束后只重取一次报告；
    // 成功摘要/部分失败 toast 走既有通道，逐项失败明细由返回值交给弹窗呈现，不逐项 toast。
    try {
      await get().refreshUnused();
    } catch (error) {
      toast.error(
        i18n.t("skillUsage.unused.unlink.error", {
          error: formatBackendError(error, i18n.t),
        }),
      );
    }
    const failedCount = results.filter((result) => !result.ok).length;
    if (failedCount === 0) {
      toast.success(
        i18n.t("skillUsage.unused.unlink.dialog.success", {
          count: results.length,
        }),
      );
    } else {
      toast.error(
        i18n.t("skillUsage.unused.unlink.dialog.partialFailure", {
          succeeded: results.length - failedCount,
          failed: failedCount,
        }),
      );
    }
    return results;
  },

  async loadScope() {
    const targetId = activeUsageTargetId();
    try {
      const scope = await invoke("usage_get_scope_info");
      if (targetId !== activeUsageTargetId() || scope.targetId !== targetId) return null;
      const current = get().scope;
      const next = current?.targetId === targetId && current.isRemote
        ? { ...scope, remoteReachable: current.remoteReachable }
        : scope;
      set({ scope: next });
      return next;
    } catch {
      return null;
    }
  },

  async subscribeTargetChanged() {
    try {
      const unlisten = await listen<string>("usage://target-changed", () => {
        ++refreshSequence;
        ++pageSequence;
        ++detailSequence;
        ++unusedSequence;
        pendingSourceRequest = null;
        // 连同页面数据一起清空：重扫期间不得继续展示上一个 target 的面板
        set({
          overview: null,
          recent: [],
          providers: [],
          loading: false,
          detail: null,
          selectedSkill: null,
          detailLoading: false,
          unused: null,
          unusedLoading: false,
          unusedError: null,
          pendingUnlinkKeys: {},
          scope: null,
          lastRefreshMs: null,
          error: null,
          refreshError: null,
          usedCachedData: false,
          selectedSource: null,
          backgroundScanning: false,
        });
        void get().refresh(true);
      });
      return () => {
        try {
          const result: unknown = unlisten();
          if (result && typeof result === "object" && "catch" in result) {
            (result as Promise<unknown>).catch(() => undefined);
          }
        } catch {
          // Browser fixtures expose a no-op listener.
        }
      };
    } catch {
      return () => undefined;
    }
  },

  async subscribeScanCompleted() {
    try {
      const unlisten = await listen<string>(
        "usage://scan-completed",
        (event) => {
          const targetId = activeUsageTargetId();
          if (event.payload !== targetId) return;
          // 后台重扫完成：静默重取页面数据——不动 refreshing/loading、不清空
          // 现有面板、不弹 toast，提交仍走 pageSequence/unusedSequence 守卫。
          set({ backgroundScanning: false });
          const sourceRequest = pendingSourceRequest;
          const source = sourceRequest?.targetId === targetId
            ? sourceRequest.source
            : get().selectedSource;
          const requestSequence = ++pageSequence;
          if (pendingSourceRequest === sourceRequest) pendingSourceRequest = null;
          void (async () => {
            try {
              const { page, source: pageSource } = await loadPageForSource(source);
              if (pageRequestMatches(requestSequence, targetId)) {
                const sourceChanged = pageSource !== get().selectedSource;
                if (sourceChanged) ++detailSequence;
                set({
                  ...page,
                  selectedSource: pageSource,
                  lastRefreshMs: page.overview.lastScanMs,
                  ...(sourceRequest ? { loading: false } : {}),
                  ...(sourceChanged ? { selectedSkill: null, detail: null, detailLoading: false } : {}),
                });
                void get().refreshUnused(true);
              }
            } catch {
              // 静默更新失败不打扰用户；下次手动/进入页面的刷新会重试
              if (sourceRequest && pageRequestMatches(requestSequence, targetId)) {
                set({ loading: false });
              }
            }
          })();
        },
      );
      return () => {
        try {
          const result: unknown = unlisten();
          if (result && typeof result === "object" && "catch" in result) {
            (result as Promise<unknown>).catch(() => undefined);
          }
        } catch {
          // Browser fixtures expose a no-op listener.
        }
      };
    } catch {
      return () => undefined;
    }
  },
}));

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
