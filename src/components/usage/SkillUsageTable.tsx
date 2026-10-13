import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VirtualizedList } from "@/components/ui/virtualized-list";
import { getAppliedFontScale, subscribeAppliedFontScale } from "@/lib/displayFont";
import {
  UsageFilterButton,
  UsageFilterGroup,
} from "@/components/usage/UsageFilterControls";
import { statusFillClass } from "@/lib/statusTone";
import { cn } from "@/lib/utils";
import { formatUsageRelativeTime } from "@/components/usage/usageFormat";
import type {
  SkillUsageSummary,
  UsageSkillMatchStatus,
} from "@/types/usage";

type SortMode = "count" | "recent" | "name";
type MatchFilter = "all" | "installed" | "unlinked";

const ROW_GRID =
  "grid grid-cols-[minmax(8rem,1fr)_3.5rem_4.5rem_minmax(40px,2.5rem)] gap-2 @2xl/ranking:grid-cols-[minmax(9rem,1fr)_5.5rem_4rem_4rem_6rem_5rem_minmax(40px,2.5rem)]";

interface SkillUsageTableProps {
  skills: SkillUsageSummary[];
  selectedSkill?: string | null;
  onSelect: (skill: string, trigger: HTMLButtonElement, restoreFocus?: () => void) => void;
  className?: string;
}

export function SkillUsageTable({
  skills,
  selectedSkill,
  onSelect,
  className,
}: SkillUsageTableProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const tableRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectButtons = useRef(new Map<string, HTMLButtonElement>());
  const openButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ skill: string; action: "select" | "open" } | null>(null);
  const [focusedSkill, setFocusedSkill] = useState<string | null>(null);
  const [originSkill, setOriginSkill] = useState<string | null>(null);
  const [listHasFocus, setListHasFocus] = useState(false);
  const [revealItem, setRevealItem] = useState<{ index: number } | null>(null);
  const [fullColumns, setFullColumns] = useState(false);
  const fontScale = useSyncExternalStore(subscribeAppliedFontScale, getAppliedFontScale, () => 1);
  const sorted = useMemo(
    () => sortSkills(filterSkills(skills, matchFilter), sortMode),
    [skills, matchFilter, sortMode],
  );
  const indexBySkill = useMemo(
    () => new Map(sorted.map((item, index) => [item.skill, index])),
    [sorted],
  );
  const navigation = useRef({ sorted, indexBySkill });
  const hasSkills = skills.length > 0;
  const virtualized = sorted.length > 60;
  const activeIndex = focusedSkill === null ? 0 : indexBySkill.get(focusedSkill) ?? 0;
  const rowHeight = Math.ceil(Math.max(40, (fullColumns ? 40 : 58) * fontScale) + 1);

  useLayoutEffect(() => {
    navigation.current = { sorted, indexBySkill };
  }, [sorted, indexBySkill]);

  useLayoutEffect(() => {
    const node = tableRef.current;
    if (!node) return;
    const update = () => setFullColumns(node.clientWidth >= 42 * 16 * fontScale);
    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [fontScale, hasSkills]);

  const focusRow = useCallback((skill: string, action: "select" | "open" = "select") => {
    const index = navigation.current.indexBySkill.get(skill);
    if (index === undefined) {
      tableRef.current?.focus();
      return;
    }
    pendingFocus.current = { skill, action };
    setFocusedSkill(skill);
    setRevealItem({ index });
    const node = (action === "open" ? openButtons : selectButtons).current.get(skill);
    if (node) {
      requestAnimationFrame(() => {
        if (node.isConnected && pendingFocus.current?.skill === skill && pendingFocus.current.action === action) {
          pendingFocus.current = null;
          node.focus();
        }
      });
    }
  }, []);

  function registerButton(skill: string, action: "select" | "open", node: HTMLButtonElement | null) {
    const map = (action === "open" ? openButtons : selectButtons).current;
    if (node) map.set(skill, node);
    else map.delete(skill);
    if (node && pendingFocus.current?.skill === skill && pendingFocus.current.action === action) {
      requestAnimationFrame(() => {
        if (node.isConnected && pendingFocus.current?.skill === skill && pendingFocus.current.action === action) {
          pendingFocus.current = null;
          node.focus();
        }
      });
    }
  }

  function renderRow(item: SkillUsageSummary, index: number) {
    const selected = item.skill === selectedSkill;
    return (
      <div
        key={item.skill}
        data-testid={`usage-row-${item.skill}`}
        className={cn(
          ROW_GRID,
          "h-full items-stretch border-b border-border/70 px-3 hover:bg-muted/20",
          selected && "bg-primary/7",
        )}
      >
        <button
          type="button"
          data-usage-action="select"
          data-usage-index={index}
          ref={(node) => registerButton(item.skill, "select", node)}
          tabIndex={virtualized ? (index === activeIndex ? 0 : -1) : undefined}
          onFocus={() => setFocusedSkill(item.skill)}
          aria-pressed={selected}
          onClick={(event) => {
            setOriginSkill(item.skill);
            onSelect(item.skill, event.currentTarget, () => focusRow(item.skill));
          }}
          className="col-span-3 grid min-h-[40px] min-w-0 grid-cols-subgrid items-center py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring @2xl/ranking:col-span-6"
        >
          <span className="min-w-0 pr-2">
            <span className="block truncate text-sm font-medium text-foreground">
              {item.skill}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground @2xl/ranking:hidden">
              {t(`skillUsage.match.${item.matchStatus}`)} · {item.projects}{" "}
              {t("skillUsage.projectsShort")}
            </span>
          </span>
          <UsageMatchStatus
            status={item.matchStatus}
            className="hidden @2xl/ranking:flex"
          />
          <span className="text-right text-sm font-medium tabular-nums">
            {item.count.toLocaleString()}
          </span>
          <span className="hidden text-right text-xs tabular-nums text-muted-foreground @2xl/ranking:block">
            {item.sessions.toLocaleString()}
          </span>
          <span
            className="hidden text-right text-xs tabular-nums text-muted-foreground @2xl/ranking:block"
            title={
              item.staticTokenEstimate === null
                ? t("skillUsage.staticEstimateUnavailable")
                : t("skillUsage.staticEstimateTooltip", {
                    bytes: item.staticByteCount?.toLocaleString() ?? "—",
                  })
            }
          >
            {item.staticTokenEstimate === null
              ? "—"
              : `~${item.staticTokenEstimate.toLocaleString()}`}
          </span>
          <span className="text-right text-xs tabular-nums text-muted-foreground">
            {formatUsageRelativeTime(item.lastUsedMs, i18n.language)}
          </span>
        </button>
        <div className="flex items-center justify-end">
          {item.resolvedSkillId && (
            <Button
              type="button"
              data-usage-action="open"
              data-usage-index={index}
                          ref={(node) => registerButton(item.skill, "open", node instanceof HTMLButtonElement ? node : null)}
              tabIndex={virtualized ? (index === activeIndex ? 0 : -1) : undefined}
              onFocus={() => setFocusedSkill(item.skill)}
              size="icon-sm"
              variant="ghost"
              className="size-10 min-h-[40px] min-w-[40px] md:size-10"
              title={t("skillUsage.openSkill")}
              aria-label={t("skillUsage.openSkillNamed", {
                skill: item.skill,
              })}
              onClick={() =>
                navigate(`/skill/${encodeURIComponent(item.resolvedSkillId!)}`)
              }
            >
              <ArrowUpRight className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div ref={tableRef} tabIndex={-1} role="group" aria-label={t("skillUsage.panels.topSkills")} className={cn("px-4 py-12 text-center text-sm", className)}>
        <p className="text-foreground">{t("skillUsage.empty.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("skillUsage.empty.noData")}
        </p>
      </div>
    );
  }

  return (
    <div ref={tableRef} tabIndex={-1} role="group" aria-label={t("skillUsage.panels.topSkills")} className={cn("@container/ranking flex min-h-0 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {matchFilter === "all"
            ? t("skillUsage.rankingCount", { count: sorted.length })
            : t("skillUsage.rankingFiltered", {
                count: sorted.length,
                total: skills.length,
              })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <UsageFilterGroup label={t("skillUsage.matchFilter.label")}>
            {(["all", "installed", "unlinked"] as const).map((filter) => (
              <UsageFilterButton
                key={filter}
                pressed={matchFilter === filter}
                onClick={() => {
                  setMatchFilter(filter);
                  setFocusedSkill(null);
                  setRevealItem({ index: 0 });
                }}
              >
                {t(`skillUsage.matchFilter.${filter}`)}
              </UsageFilterButton>
            ))}
          </UsageFilterGroup>
          <UsageFilterGroup label={t("skillUsage.sort.label")}>
            {(["count", "recent", "name"] as const).map((mode) => (
              <UsageFilterButton
                key={mode}
                pressed={sortMode === mode}
                onClick={() => {
                  setSortMode(mode);
                  setFocusedSkill(null);
                  setRevealItem({ index: 0 });
                }}
              >
                {t(`skillUsage.sort.${mode}`)}
              </UsageFilterButton>
            ))}
          </UsageFilterGroup>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 px-4 py-12 text-center text-sm">
          <p className="text-foreground">
            {t("skillUsage.empty.filteredTitle")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("skillUsage.empty.filteredHint")}
          </p>
        </div>
      ) : (
        <>
          <div className={cn(ROW_GRID, "scrollbar-subtle overflow-y-auto border-b border-border px-3 py-2 text-xs text-muted-foreground [scrollbar-gutter:stable]")}>
            <span>{t("skillUsage.columns.skill")}</span>
            <span className="hidden @2xl/ranking:block">{t("skillUsage.columns.match")}</span>
            <span className="text-right">{t("skillUsage.columns.calls")}</span>
            <span className="hidden text-right @2xl/ranking:block">
              {t("skillUsage.columns.sessions")}
            </span>
            <span className="hidden text-right @2xl/ranking:block">
              {t("skillUsage.columns.estimate")}
            </span>
            <span className="text-right">{t("skillUsage.columns.lastUsed")}</span>
            <span className="sr-only">{t("skillUsage.openSkill")}</span>
          </div>

          <div
            ref={viewportRef}
            data-testid="usage-ranking-viewport"
            data-virtualized={virtualized}
            onFocusCapture={() => setListHasFocus(true)}
            onBlurCapture={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                setListHasFocus(false);
              }
            }}
            className={cn(
              "scrollbar-subtle overflow-y-auto [scrollbar-gutter:stable]",
              virtualized ? "h-[26rem] min-h-0 shrink-0" : "min-h-0 flex-1",
            )}
            onKeyDown={(event) => {
              if (!virtualized || !(event.target instanceof HTMLElement)) return;
              const button = event.target.closest<HTMLButtonElement>("button[data-usage-action]");
              if (!button) return;
              const index = Number(button.dataset.usageIndex);
              let next = index;
              let action: "select" | "open" = "select";
              if (event.key === "ArrowDown") next = Math.min(sorted.length - 1, index + 1);
              else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = sorted.length - 1;
              else if (event.key === "Tab") {
                if (!event.shiftKey) {
                  if (button.dataset.usageAction === "select" && sorted[index].resolvedSkillId) return;
                  if (index === sorted.length - 1) return;
                  next = index + 1;
                } else {
                  if (button.dataset.usageAction === "open" || index === 0) return;
                  next = index - 1;
                  if (sorted[next].resolvedSkillId) action = "open";
                }
              } else return;
              event.preventDefault();
              focusRow(sorted[next].skill, action);
            }}
          >
            {virtualized ? (
              <VirtualizedList
                as="ul"
                items={sorted}
                itemHeight={rowHeight}
                fallbackHeight={416 * fontScale}
                scrollContainerRef={viewportRef}
                pinnedIndex={listHasFocus ? activeIndex : originSkill === null ? undefined : indexBySkill.get(originSkill)}
                revealItem={revealItem}
                itemKey={(item) => item.skill}
                renderItem={renderRow}
              />
            ) : (
              <ul>{sorted.map((item, index) => <li key={item.skill}>{renderRow(item, index)}</li>)}</ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// unmatched 为中性态（无语义色），刻意不进 statusTone 四态
const matchDotClass: Record<UsageSkillMatchStatus, string> = {
  matched: statusFillClass.success,
  ambiguous: statusFillClass.warning,
  unmatched: "bg-muted-foreground/40",
};

/** 匹配状态文本 + 语义色状态点，表格「Central match」列与详情面板共用。 */
export function UsageMatchStatus({
  status,
  className,
}: {
  status: UsageSkillMatchStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", matchDotClass[status])}
      />
      <span className="truncate">{t(`skillUsage.match.${status}`)}</span>
    </span>
  );
}

function filterSkills(
  skills: SkillUsageSummary[],
  filter: MatchFilter,
): SkillUsageSummary[] {
  if (filter === "all") return skills;
  if (filter === "installed") {
    return skills.filter((item) => item.matchStatus === "matched");
  }
  return skills.filter((item) => item.matchStatus !== "matched");
}

function sortSkills(
  skills: SkillUsageSummary[],
  mode: SortMode,
): SkillUsageSummary[] {
  return [...skills].sort((a, b) => {
    if (mode === "name") return a.skill.localeCompare(b.skill);
    if (mode === "recent") {
      return b.lastUsedMs - a.lastUsedMs || a.skill.localeCompare(b.skill);
    }
    return (
      b.count - a.count ||
      b.lastUsedMs - a.lastUsedMs ||
      a.skill.localeCompare(b.skill)
    );
  });
}
