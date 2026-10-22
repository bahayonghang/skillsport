import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Activity, FolderOpen, Layers, Puzzle } from "lucide-react";

import { StatTile, type StatTileTone } from "@/components/ui/stat-tile";
import { cn } from "@/lib/utils";
import type { UsageKpis } from "@/types/usage";

interface UsageMetricStripProps {
  kpis: UsageKpis;
  singlePlatform?: boolean;
  className?: string;
}

/**
 * Usage KPIs as compact stat tiles (C6 design §3): calls = mint (the input
 * side of usage), distinct skills = lavender (secondary data), projects and
 * sources / sessions = neutral. Must sit on a panel (tints are measured over
 * panel composites, not the bare canvas).
 */
export function UsageMetricStrip({
  kpis,
  singlePlatform = false,
  className,
}: UsageMetricStripProps) {
  const { t } = useTranslation();
  const metrics: ReadonlyArray<{
    key: string;
    label: string;
    value: number;
    tone: StatTileTone;
    icon: ReactNode;
  }> = [
    {
      key: "calls",
      label: t("skillUsage.kpi.calls"),
      value: kpis.totalCalls,
      tone: "primary",
      icon: <Activity />,
    },
    {
      key: "skills",
      label: t("skillUsage.kpi.skills"),
      value: kpis.uniqueSkills,
      tone: "secondary",
      icon: <Puzzle />,
    },
    {
      key: "projects",
      label: t("skillUsage.kpi.projects"),
      value: kpis.uniqueProjects,
      tone: "neutral",
      icon: <FolderOpen />,
    },
    {
      key: "sources",
      label: t(
        singlePlatform ? "skillUsage.kpi.sessions" : "skillUsage.kpi.sources",
      ),
      value: singlePlatform ? kpis.uniqueSessions : kpis.uniqueSources,
      tone: "neutral",
      icon: <Layers />,
    },
  ];

  return (
    <section
      aria-label={t("skillUsage.range.allRecorded")}
      className={cn(
        "grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4",
        className,
      )}
    >
      {metrics.map((metric) => (
        <StatTile
          key={metric.key}
          size="compact"
          tone={metric.tone}
          icon={metric.icon}
          label={metric.label}
          value={metric.value}
        />
      ))}
    </section>
  );
}
