import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { TFunction } from "i18next";

import { getTagColor } from "@/lib/tagColor";
import { cn } from "@/lib/utils";
import type { FacetCounts } from "@/lib/centralFacetCounts";
import { getVisibleSkillTagsWithUsage } from "@/lib/centralTags";
import type { SkillTag } from "@/types";

export type SourceFilterValue = "github" | "local" | "manual";

export interface CentralTopFiltersProps {
  t: TFunction;
  tags: readonly SkillTag[];
  selectedTagIds: readonly string[];
  onToggleTag: (tagId: string) => void;
  facetCounts: FacetCounts;
  /** 当前来源筛选（null = 全部）。 */
  activeSource: SourceFilterValue | null;
  onToggleSource: (value: SourceFilterValue | null) => void;
  /** 「更多▾」内承载的 Tag Groups 管理 UI；为空则不渲染该入口。 */
  tagGroupsSlot?: ReactNode;
}

const SOURCE_PILLS: ReadonlyArray<{
  value: SourceFilterValue | null;
  labelKey: string;
  testId: string;
}> = [
  { value: null, labelKey: "central.topFilterSourceAll", testId: "all" },
  { value: "local", labelKey: "central.topFilterSourceLocal", testId: "local" },
  { value: "github", labelKey: "central.topFilterSourceGit", testId: "github" },
  {
    value: "manual",
    labelKey: "central.topFilterSourceManual",
    testId: "manual",
  },
];

/**
 * 顶部筛选行：来源 pills + 彩色标签 pills +「更多▾」（Tag Groups 管理）。
 * 替代原侧栏标签区块，承接来源/标签两类筛选维度。
 */
export function CentralTopFilters({
  t,
  tags,
  selectedTagIds,
  onToggleTag,
  facetCounts,
  activeSource,
  onToggleSource,
  tagGroupsSlot,
}: CentralTopFiltersProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const selected = new Set(selectedTagIds);
  const sortedTags = getVisibleSkillTagsWithUsage(
    tags,
    facetCounts.tags,
  ).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
      {/* 来源段 ─────────────────────────────────────────────── */}
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {t("central.topFilterSourceLabel")}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {SOURCE_PILLS.map((pill) => {
          const active =
            pill.value === null
              ? activeSource === null
              : activeSource === pill.value;
          return (
            <button
              key={pill.testId}
              type="button"
              data-testid={`top-filter-source-${pill.testId}`}
              data-active={active}
              aria-pressed={active}
              onClick={() => onToggleSource(pill.value)}
              className={cn(
                "focus-ring h-7 rounded-full border px-2.5 text-xs font-medium transition-[scale,background-color,border-color,color] active:scale-[0.96]",
                active
                  ? "border-primary-stroke bg-primary-tint text-primary-text"
                  : "border-glass-stroke bg-popover text-muted-foreground ring-1 ring-glass-hairline hover:text-foreground",
              )}
            >
              {t(pill.labelKey)}
            </button>
          );
        })}
      </div>

      {sortedTags.length > 0 && (
        <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      )}

      {/* 标签段 ─────────────────────────────────────────────── */}
      {sortedTags.length > 0 && (
        <>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t("central.topFilterTagsLabel")}
          </span>
          <div className="scrollbar-subtle flex min-w-36 flex-1 flex-nowrap items-center gap-1 overflow-x-auto py-0.5">
            {sortedTags.map((tag) => {
              const color = getTagColor(tag);
              const active = selected.has(tag.id);
              const count = facetCounts.tags[tag.id] ?? 0;
              return (
                <button
                  key={tag.id}
                  type="button"
                  data-testid={`top-filter-tag-${tag.id}`}
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => onToggleTag(tag.id)}
                  style={color.style}
                  className={cn(
                    "focus-ring inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-[scale,background-color,border-color,box-shadow,color] active:scale-[0.96]",
                    color.className,
                    active && "ring-2 ring-ring",
                  )}
                >
                  <span className="truncate">{tag.name}</span>
                  {count > 0 && (
                    <span className="tabular-nums">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* 更多▾（Tag Groups 管理）────────────────────────────── */}
      {tagGroupsSlot && (
        <div className="relative shrink-0">
          <button
            type="button"
            data-testid="top-filter-more"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="focus-ring flex h-7 items-center gap-1 rounded-full border border-glass-stroke bg-popover px-2.5 text-xs font-medium text-muted-foreground ring-1 ring-glass-hairline transition-[scale,background-color,color] hover:text-foreground active:scale-[0.96]"
          >
            {t("central.topFilterMore")}
            <ChevronDown className="size-3" />
          </button>
          {moreOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                aria-hidden
                onClick={() => setMoreOpen(false)}
              />
              <div className="glass-overlay absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-card px-3 pb-2">
                {tagGroupsSlot}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
