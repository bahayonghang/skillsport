import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleHelp,
  Download,
  GitBranch,
  Library,
  Loader2,
  Sparkles,
  Tags,
} from "lucide-react";

import { PanelHeader } from "@/components/dashboard/DashboardPanels";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile, type StatTileTone } from "@/components/ui/stat-tile";
import type { DashboardQueueItem } from "@/pages/dashboardViewModel";

interface WorkQueuePanelProps {
  onNavigate: (path: string) => void;
  queueItems: DashboardQueueItem[];
  activeJob: { completed: number; total: number } | null;
  /** From `dashboardCentralSummary` (data contract 1) via the view model. */
  centralTotal: number;
  sourceRepositoryCount: number;
}

function queueDestination(key: string): string {
  switch (key) {
    case "ai":
      return "/central?filter=ai-review";
    case "uncategorized":
      return "/central?filter=uncategorized";
    case "unassigned":
      return "/central?filter=unassigned";
    case "updates":
      return "/central?filter=updates";
    default:
      return "/central";
  }
}

// DESIGN.md Signature: Dashboard — counts are one row of stat tiles.
// Mint = the Central library itself (completion), lavender = secondary data
// (pending updates, AI review), neutral = housekeeping queues.
const QUEUE_TONE: Record<string, StatTileTone> = {
  updates: "secondary",
  ai: "secondary",
  uncategorized: "neutral",
  unassigned: "neutral",
};

const QUEUE_ICON: Record<string, ReactNode> = {
  updates: <Download />,
  ai: <Sparkles />,
  uncategorized: <Tags />,
  unassigned: <CircleHelp />,
};

export function WorkQueuePanel({
  onNavigate,
  queueItems,
  activeJob,
  centralTotal,
  sourceRepositoryCount,
}: WorkQueuePanelProps) {
  const { t } = useTranslation();
  const pendingCount = queueItems.filter((item) => item.count > 0).length;

  return (
    <Card className="p-0">
      <PanelHeader
        title={t("dashboard.workQueues", { count: pendingCount })}
        description={t("dashboard.workQueuesDesc")}
      />
      <CardContent className="px-4 pb-4">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          <li className="min-w-0">
            <StatTile
              tone="primary"
              icon={<Library />}
              label={t("dashboard.queue.centralTotal")}
              value={centralTotal}
              className="h-full"
            />
          </li>
          {queueItems.map((item) => (
            <li key={item.key} className="min-w-0">
              <button
                type="button"
                title={`${item.label} — ${item.description}`}
                onClick={() => onNavigate(queueDestination(item.key))}
                className="focus-ring block h-full w-full rounded-inner text-left transition-[scale,box-shadow] duration-150 ease-out hover:shadow-glass-hover active:scale-[0.96]"
              >
                <StatTile
                  tone={QUEUE_TONE[item.key] ?? "neutral"}
                  icon={QUEUE_ICON[item.key]}
                  label={item.label}
                  value={item.count}
                  hint={<span className="line-clamp-2">{item.description}</span>}
                  className="h-full"
                />
              </button>
            </li>
          ))}
          <li className="min-w-0">
            <StatTile
              tone="neutral"
              icon={<GitBranch />}
              label={t("dashboard.queue.sources")}
              value={sourceRepositoryCount}
              className="h-full"
            />
          </li>
        </ul>
        {activeJob && (
          <div className="mt-3 flex items-center gap-2 rounded-inner bg-accent px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            <span className="font-medium text-foreground">
              {t("dashboard.activeJobs")}
            </span>
            <span>
              {t("dashboard.jobProgress", {
                completed: activeJob.completed,
                total: activeJob.total,
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
