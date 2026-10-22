import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { projectShort } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";
import { formatUsageRelativeTime } from "@/components/usage/usageFormat";
import type { RecentSkillCall } from "@/types/usage";

interface RecentCallsFeedProps {
  calls: RecentSkillCall[];
  onSelect: (skill: string, trigger: HTMLButtonElement) => void;
  className?: string;
  limit?: number;
}

export function RecentCallsFeed({
  calls,
  onSelect,
  className,
  limit = 20,
}: RecentCallsFeedProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const list = calls.slice(0, limit);
  const occurrences = new Map<string, number>();

  if (list.length === 0) {
    return (
      <div className={cn("px-4 py-10 text-center text-xs text-muted-foreground", className)}>
        {t("skillUsage.empty.noData")}
      </div>
    );
  }

  return (
    <ul data-testid="recent-feed" className={cn("divide-y divide-border/60", className)}>
      {list.map((call) => {
        const factKey = JSON.stringify([call.skill, call.timestampMs, call.sessionId, call.source, call.project]);
        const occurrence = occurrences.get(factKey) ?? 0;
        occurrences.set(factKey, occurrence + 1);
        return (
        <li
          key={`${factKey}-${occurrence}`}
          data-testid={`recent-row-${call.skill}-${call.timestampMs}`}
          className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(3rem,0.65fr)_minmax(40px,2.5rem)] items-center gap-2 px-3 py-1 hover:bg-accent"
        >
          <span
            className="text-xs tabular-nums text-muted-foreground"
            title={new Date(call.timestampMs).toLocaleString()}
          >
            {formatUsageRelativeTime(call.timestampMs, i18n.language)}
          </span>
          <button
            type="button"
            onClick={(event) => onSelect(call.skill, event.currentTarget)}
            className="min-h-[40px] min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block truncate text-sm font-medium text-foreground hover:text-primary-text">
              {call.skill}
            </span>
            <span className="block truncate text-ui-meta text-muted-foreground">
              {call.source}
            </span>
          </button>
          <span className="truncate text-right text-xs text-muted-foreground">
            {projectShort(call.project)}
          </span>
          {call.resolvedSkillId ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-10 min-h-[40px] min-w-[40px] md:size-10"
              title={t("skillUsage.openSkill")}
              aria-label={t("skillUsage.openSkillNamed", { skill: call.skill })}
              onClick={() =>
                navigate(`/skill/${encodeURIComponent(call.resolvedSkillId!)}`)
              }
            >
              <ArrowUpRight className="size-3.5" />
            </Button>
          ) : (
            <span aria-hidden />
          )}
        </li>
        );
      })}
    </ul>
  );
}
