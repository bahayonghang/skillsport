import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Globe2,
  Loader2,
  Monitor,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActivityHeatmap } from "@/components/usage/ActivityHeatmap";
import { PlatformFilterBar } from "@/components/usage/PlatformFilterBar";
import { ProviderHealthList } from "@/components/usage/ProviderHealthList";
import { RecentCallsFeed } from "@/components/usage/RecentCallsFeed";
import { SkillUsageDetailPanel } from "@/components/usage/SkillUsageDetailPanel";
import { SkillUsageTable } from "@/components/usage/SkillUsageTable";
import { UnusedSkillsPanel } from "@/components/usage/UnusedSkillsPanel";
import { UsageMetricStrip } from "@/components/usage/UsageMetricStrip";
import { formatUsageRelativeTime } from "@/components/usage/usageFormat";
import { cn } from "@/lib/utils";
import {
  useUsageBindings,
  useUsageBootstrap,
} from "@/pages/skillUsageBindings";
import type { UsageScopeInfo } from "@/types/usage";

export function SkillUsageView() {
  const { t, i18n } = useTranslation();
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailFocusRestoreRef = useRef<(() => void) | null>(null);
  useUsageBootstrap();
  const {
    overview,
    providers,
    recent,
    detail,
    unused,
    unusedLoading,
    unusedError,
    pendingUnlinkKeys,
    scope,
    selectedSource,
    selectedSkill,
    refreshing,
    loading,
    detailLoading,
    error,
    refreshError,
    usedCachedData,
    lastRefreshMs,
    backgroundScanning,
    refresh,
    selectSource,
    loadDetail,
    clearDetail,
    unlinkUnusedSkillFromAgents,
  } = useUsageBindings();

  const kpis = overview?.kpis ?? {
    totalCalls: 0,
    uniqueSkills: 0,
    uniqueProjects: 0,
    uniqueSources: 0,
    uniqueSessions: 0,
  };
  const initialLoading = overview === null && error === null;
  const detailError =
    selectedSkill !== null && !detailLoading && detail === null ? error : null;
  const availableProviders = providers.filter(
    (provider) => provider.available,
  ).length;

  const selectSkill = (skill: string, trigger: HTMLButtonElement, restoreFocus?: () => void) => {
    detailTriggerRef.current = trigger;
    detailFocusRestoreRef.current = restoreFocus ?? null;
    void loadDetail(skill);
  };
  const closeDetail = () => {
    clearDetail();
    requestAnimationFrame(() => {
      if (detailFocusRestoreRef.current) detailFocusRestoreRef.current();
      else detailTriggerRef.current?.focus();
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border px-4 py-2 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <BarChart3 className="size-5 shrink-0 text-primary-text" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-foreground">
                {t("skillUsage.title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("skillUsage.range.allRecorded")}
              </p>
            </div>
            {scope && <ScopeBadge scope={scope} />}
          </div>
          {initialLoading ? (
            <UsageMetricSkeleton />
          ) : overview ? (
            <UsageMetricStrip
              kpis={kpis}
              singlePlatform={selectedSource !== null}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {backgroundScanning && (
              <span
                data-testid="background-scan-hint"
                className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex"
              >
                <Loader2
                  aria-hidden
                  className="size-3 animate-spin motion-reduce:animate-none"
                />
                {t("skillUsage.scanningBackground")}
              </span>
            )}
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {lastRefreshMs
                ? t("skillUsage.lastRefreshed", {
                    time: formatUsageRelativeTime(lastRefreshMs, i18n.language),
                  })
                : t("skillUsage.neverRefreshed")}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="size-10 min-h-[40px] min-w-[40px] md:size-10"
              onClick={() => void refresh(true)}
              disabled={refreshing}
              title={t("skillUsage.refresh")}
              aria-label={t("skillUsage.refresh")}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>
        </div>

        <PlatformFilterBar
          providers={providers}
          selected={selectedSource}
          onSelect={(source) => void selectSource(source)}
          className="mt-2"
        />
      </header>

      <main
        data-testid="skill-usage-scroll-region"
        className="scrollbar-subtle min-w-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5"
      >
        {error && !detailError && (
          <StatusBanner tone="error">{error}</StatusBanner>
        )}
        {refreshError && usedCachedData && (
          <StatusBanner tone="warning">
            {t("skillUsage.showingCachedAfterError")}
            {lastRefreshMs
              ? ` · ${t("skillUsage.lastRefreshed", {
                  time: formatUsageRelativeTime(lastRefreshMs, i18n.language),
                })}`
              : ""}
          </StatusBanner>
        )}
        {scope?.isRemote && !scope.remoteReachable && (
          <StatusBanner tone="warning" testId="remote-unreachable-banner">
            {t(
              usedCachedData
                ? "skillUsage.remoteUnreachableCached"
                : "skillUsage.remoteUnreachableEmpty",
              { host: scope.label },
            )}
          </StatusBanner>
        )}

        {initialLoading ? (
          <UsageSkeleton />
        ) : (
          <div
            aria-busy={loading}
            className={cn(
              "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]",
              loading && "opacity-70",
            )}
          >
            <UsageSection
              title={t("skillUsage.panels.topSkills")}
              className="min-h-[32rem] contain-layout"
              fill
            >
              <SkillUsageTable
                skills={overview?.topSkills ?? []}
                selectedSkill={selectedSkill}
                onSelect={selectSkill}
                className="h-full min-h-[24rem]"
              />
            </UsageSection>

            <div className="flex min-w-0 flex-col gap-4">
              {selectedSkill ? (
                <UsageSection title={t("skillUsage.panels.detail")}>
                  <SkillUsageDetailPanel
                    detail={detail}
                    loading={detailLoading}
                    error={detailError}
                    onClose={closeDetail}
                  />
                </UsageSection>
              ) : (
                <UsageSection
                  key="recent"
                  title={t("skillUsage.panels.recent")}
                  range={t("skillUsage.range.latestCalls", { count: 20 })}
                >
                  <div className="scrollbar-subtle max-h-[26rem] overflow-y-auto">
                    <RecentCallsFeed calls={recent} onSelect={selectSkill} />
                  </div>
                </UsageSection>
              )}

              <UsageSection
                title={t("skillUsage.panels.heatmap")}
                range={t("skillUsage.range.lastWeeks", { count: 16 })}
                className="w-full max-w-[24rem] contain-layout"
              >
                <ActivityHeatmap days={overview?.heatmap ?? []} />
              </UsageSection>

              {selectedSkill && (
                <UsageSection
                  key="recent"
                  title={t("skillUsage.panels.recent")}
                  range={t("skillUsage.range.latestCalls", { count: 20 })}
                >
                  <div className="scrollbar-subtle max-h-[26rem] overflow-y-auto">
                    <RecentCallsFeed calls={recent} onSelect={selectSkill} />
                  </div>
                </UsageSection>
              )}
            </div>

            <UsageSection
              title={t("skillUsage.unused.title")}
              className="xl:col-span-2"
            >
              <UnusedSkillsPanel
                report={unused}
                loading={unusedLoading}
                error={unusedError}
                selectedSkill={selectedSkill}
                onSelect={selectSkill}
                onUnlinkAgents={unlinkUnusedSkillFromAgents}
                pendingUnlinkKeys={pendingUnlinkKeys}
              />
            </UsageSection>
          </div>
        )}

        <details className="group mt-4 border-y border-border bg-muted/10">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span className="font-medium text-foreground">
              {t("skillUsage.panels.providers")}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("skillUsage.providerSummary", {
                available: availableProviders,
                total: providers.length,
              })}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <ProviderHealthList
            providers={providers}
            activeSource={selectedSource}
            onSelect={(source) => void selectSource(source)}
            className="border-t border-border"
          />
        </details>
      </main>
    </div>
  );
}

function UsageSection({
  title,
  range,
  className,
  fill = false,
  children,
}: {
  title: string;
  range?: string;
  className?: string;
  /** true 时卡片纵向 flex，children 填满剩余高度（供表格内部滚动用） */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-md border border-border bg-card",
        fill && "flex flex-col",
        className,
      )}
    >
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {range && (
          <span className="text-xs text-muted-foreground">{range}</span>
        )}
      </div>
      {fill ? <div className="min-h-0 flex-1">{children}</div> : children}
    </section>
  );
}

function StatusBanner({
  tone,
  testId,
  children,
}: {
  tone: "warning" | "error";
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={cn(
        "mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        tone === "error"
          ? "border-destructive/35 bg-destructive/10 text-destructive-text"
          : "border-warning/35 bg-warning/10 text-warning-foreground",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: UsageScopeInfo }) {
  const { t } = useTranslation();
  const Icon = scope.isRemote ? Globe2 : Monitor;
  return (
    <span
      data-testid="scope-badge"
      data-scope-kind={scope.isRemote ? "remote" : "local"}
      className="inline-flex max-w-56 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
      title={scope.label}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">
        {scope.isRemote
          ? t("skillUsage.scope.remote", { label: scope.label })
          : t("skillUsage.scope.local")}
      </span>
    </span>
  );
}

function UsageSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <div className="animate-pulse motion-reduce:animate-none">
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="h-[34rem] rounded-md border border-border bg-muted/30" />
          <div className="flex min-w-0 flex-col gap-4">
            <div className="h-56 rounded-md border border-border bg-muted/25" />
            <div className="h-64 rounded-md border border-border bg-muted/20" />
          </div>
        </div>
      </div>
      <div
        role="status"
        className="absolute inset-0 z-10 flex items-center justify-center"
      >
        <span className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
          <Loader2
            aria-hidden
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          {t("skillUsage.scanning")}
        </span>
      </div>
    </div>
  );
}

function UsageMetricSkeleton() {
  return (
    <div
      aria-hidden
      className="flex animate-pulse flex-wrap items-center gap-x-5 gap-y-2 motion-reduce:animate-none"
    >
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className={cn("min-w-14", index > 0 && "border-l border-border pl-5")}
        >
          <div className="h-4 w-14 rounded bg-muted/40" />
          <div className="mt-0.5 h-5 w-14 rounded bg-muted/50" />
        </div>
      ))}
    </div>
  );
}
