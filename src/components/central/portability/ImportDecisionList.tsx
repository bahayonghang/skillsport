import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VirtualizedList } from "@/components/ui/virtualized-list";
import {
  CONFLICT_STATUSES,
  effectiveDecision,
  filterSkills,
  formatBytes,
  STATUS_TONE,
  type DecisionCounts,
  type DecisionFilter,
  type RenameProblem,
} from "@/lib/portabilityViewModel";
import { cn } from "@/lib/utils";
import type {
  PortableBundleDecision,
  PortableBundleDecisionAction,
  PortableBundleSkillPreview,
} from "@/types";

const ROW_HEIGHT = 64;
const FILTERS: DecisionFilter[] = ["all", "conflicts", "new", "changed", "exists_unmanaged", "identical", "invalid"];

function actionsFor(skill: PortableBundleSkillPreview): PortableBundleDecisionAction[] {
  // Identical content is skipped automatically; invalid entries cannot be written.
  if (skill.status === "identical" || skill.status === "invalid") return [];
  return ["overwrite", "skip", "rename"];
}

export function ImportDecisionList({
  skills,
  decisions,
  counts,
  renameProblems,
  disabled,
  onDecide,
  onBulk,
}: {
  skills: PortableBundleSkillPreview[];
  decisions: Record<string, PortableBundleDecision>;
  counts: DecisionCounts;
  renameProblems: Record<string, RenameProblem>;
  disabled: boolean;
  onDecide: (decision: PortableBundleDecision) => void;
  onBulk: (action: "overwrite" | "skip") => void;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const conflicts = CONFLICT_STATUSES.reduce((sum, status) => sum + counts.byStatus[status], 0);
  const [filter, setFilter] = useState<DecisionFilter>(conflicts > 0 ? "conflicts" : "all");
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => filterSkills(skills, filter, query),
    [skills, filter, query],
  );

  function filterCount(value: DecisionFilter) {
    if (value === "all") return counts.total;
    if (value === "conflicts") return conflicts;
    return counts.byStatus[value];
  }

  return (
    <div className="space-y-2" data-testid="central-portability-decisions">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.filter((value) => value === "all" || filterCount(value) > 0).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            data-testid={`central-portability-filter-${value}`}
            onClick={() => setFilter(value)}
            className={cn(
              "focus-ring rounded-full border px-2.5 py-1 text-xs transition-colors",
              filter === value
                ? "border-primary-stroke bg-primary-tint text-primary-text"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {t(`central.bundle.filter.${value}`)} · {filterCount(value)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("central.bundle.import.search")}
            aria-label={t("central.bundle.import.search")}
            className="pl-8"
            data-testid="central-portability-search"
          />
        </div>
        {conflicts > 0 ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onBulk("overwrite")}
              data-testid="central-portability-bulk-overwrite"
            >
              {t("central.bundle.import.overwriteAll", { count: conflicts })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onBulk("skip")}
              data-testid="central-portability-bulk-skip"
            >
              {t("central.bundle.import.skipAll", { count: conflicts })}
            </Button>
          </>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto rounded-inner border border-border"
        data-testid="central-portability-decision-scroll"
      >
        {visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("central.bundle.import.noMatch")}
          </div>
        ) : (
          <VirtualizedList
            items={visible}
            itemHeight={ROW_HEIGHT}
            fallbackHeight={320}
            scrollContainerRef={scrollRef}
            itemKey={(skill) => skill.id}
            renderItem={(skill) => (
              <DecisionRow
                skill={skill}
                decision={effectiveDecision(skill, decisions)}
                renameProblem={renameProblems[skill.id] ?? null}
                disabled={disabled}
                onDecide={onDecide}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}

function DecisionRow({
  skill,
  decision,
  renameProblem,
  disabled,
  onDecide,
}: {
  skill: PortableBundleSkillPreview;
  decision: PortableBundleDecision | null;
  renameProblem: RenameProblem | null;
  disabled: boolean;
  onDecide: (decision: PortableBundleDecision) => void;
}) {
  const { t } = useTranslation();
  const actions = actionsFor(skill);
  const renaming = decision?.action === "rename";

  return (
    <div
      className="flex h-16 items-center gap-3 border-b border-border px-3 last:border-b-0"
      data-testid={`central-portability-row-${skill.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={skill.name}>
          {skill.name}
        </div>
        {renaming ? (
          <Input
            autoFocus
            value={decision?.renameTo ?? ""}
            onChange={(event) =>
              onDecide({ skillId: skill.id, action: "rename", renameTo: event.target.value })
            }
            aria-label={t("central.bundle.import.renameTo", { name: skill.name })}
            aria-invalid={renameProblem ? true : undefined}
            title={renameProblem ? t(`central.bundle.rename.${renameProblem}`) : undefined}
            placeholder={t("central.bundle.import.renamePlaceholder")}
            className="mt-1 h-6 text-xs"
            disabled={disabled}
            data-testid={`central-portability-rename-${skill.id}`}
          />
        ) : (
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Badge size="sm" tone={STATUS_TONE[skill.status]}>
              {t(`central.bundle.status.${skill.status}`)}
            </Badge>
            <span className="truncate">
              {skill.status === "invalid"
                ? t(`central.bundle.invalidReason.${skill.invalidReason ?? "unknown"}`, {
                    defaultValue: t("central.bundle.invalidReason.unknown"),
                  })
                : [skill.name === skill.id ? null : skill.id, formatBytes(skill.contentBytes)]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </div>
        )}
      </div>
      {actions.length > 0 ? (
        <div
          role="radiogroup"
          aria-label={t("central.bundle.import.decisionFor", { name: skill.name })}
          className="inline-flex shrink-0 rounded-control border border-border bg-accent p-0.5"
        >
          {actions.map((action) => {
            const selected = decision?.action === action;
            return (
              <button
                key={action}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                data-testid={`central-portability-action-${skill.id}-${action}`}
                onClick={() =>
                  onDecide(
                    action === "rename"
                      ? { skillId: skill.id, action, renameTo: decision?.renameTo ?? `${skill.id}-imported` }
                      : { skillId: skill.id, action },
                  )
                }
                className={cn(
                  "focus-ring rounded-control px-2 py-1 text-xs transition-colors disabled:opacity-50",
                  selected ? "bg-popover text-foreground" : "text-muted-foreground",
                )}
              >
                {t(`central.bundle.action.${skill.status === "new" && action === "overwrite" ? "import" : action}`)}
              </button>
            );
          })}
        </div>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          {skill.status === "identical" ? t("central.bundle.import.autoSkip") : null}
        </span>
      )}
    </div>
  );
}
