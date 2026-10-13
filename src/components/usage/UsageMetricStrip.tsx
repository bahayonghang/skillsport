import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { UsageKpis } from "@/types/usage";

interface UsageMetricStripProps {
  kpis: UsageKpis;
  singlePlatform?: boolean;
  className?: string;
}

export function UsageMetricStrip({
  kpis,
  singlePlatform = false,
  className,
}: UsageMetricStripProps) {
  const { t } = useTranslation();
  const metrics = [
    [t("skillUsage.kpi.calls"), kpis.totalCalls],
    [t("skillUsage.kpi.skills"), kpis.uniqueSkills],
    [t("skillUsage.kpi.projects"), kpis.uniqueProjects],
    [
      t(singlePlatform ? "skillUsage.kpi.sessions" : "skillUsage.kpi.sources"),
      singlePlatform ? kpis.uniqueSessions : kpis.uniqueSources,
    ],
  ] as const;

  return (
    <section
      aria-label={t("skillUsage.range.allRecorded")}
      className={cn("min-w-0", className)}
    >
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {metrics.map(([label, value], index) => (
          <div
            key={label}
            className={cn(
              "min-w-14",
              index > 0 && "border-l border-border pl-5",
            )}
          >
            <dt className="text-xs text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-0.5 text-right text-xl font-semibold leading-none tabular-nums text-foreground">
              {value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
