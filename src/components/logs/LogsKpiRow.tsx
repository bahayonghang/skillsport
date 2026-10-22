import { useTranslation } from "react-i18next";
import { Activity, AlertCircle, CheckCircle2, Timer } from "lucide-react";

import { StatTile } from "@/components/ui/stat-tile";
import {
  LogsKpi,
  formatDurationMs,
  formatPercent,
} from "@/components/logs/logsUtils";

interface LogsKpiRowProps {
  kpi: LogsKpi;
  total: number;
  loadedCount: number;
}

/**
 * Logs KPI row (C6 design §4): four stat tiles inside one glass panel.
 * total = neutral, success rate = mint (completion), average duration =
 * lavender (secondary data), failures = neutral tile whose icon and
 * breakdown line switch to rose text when there are failures. The number
 * itself stays ink (DESIGN.md Big-Number Rule); StatTile only offers the
 * mint / lavender / neutral fills, keeping "one primary, one secondary".
 */
export function LogsKpiRow({ kpi, total, loadedCount }: LogsKpiRowProps) {
  const { t } = useTranslation();
  const isSampled = total > loadedCount;
  const sampledLabel = isSampled
    ? t("logs.kpi.basedOn", { count: loadedCount })
    : undefined;
  const hasFailures = kpi.failures > 0;
  const failuresDetail = hasFailures ? (
    <span className="text-destructive-text">
      {t("logs.kpi.failuresBreakdown", {
        failed: kpi.failed,
        partial: kpi.partial,
      })}
    </span>
  ) : (
    sampledLabel
  );

  return (
    <div className="glass-panel grid gap-3 rounded-card p-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        data-testid="logs-kpi-total"
        tone="neutral"
        icon={<Activity />}
        label={t("logs.kpi.total")}
        value={total}
        hint={sampledLabel}
      />
      <StatTile
        data-testid="logs-kpi-success-rate"
        tone="primary"
        icon={<CheckCircle2 />}
        label={t("logs.kpi.successRate")}
        value={formatPercent(kpi.successRate)}
        hint={sampledLabel}
      />
      <StatTile
        data-testid="logs-kpi-failures"
        tone="neutral"
        icon={
          <AlertCircle
            className={hasFailures ? "text-destructive-text" : undefined}
          />
        }
        label={t("logs.kpi.failures")}
        value={kpi.failures}
        hint={failuresDetail}
      />
      <StatTile
        data-testid="logs-kpi-avg-duration"
        tone="secondary"
        icon={<Timer />}
        label={t("logs.kpi.avgDuration")}
        value={formatDurationMs(kpi.avgDurationMs)}
        hint={sampledLabel}
      />
    </div>
  );
}
