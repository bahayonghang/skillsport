import { useTranslation } from "react-i18next";
import { ChevronRight, Loader2 } from "lucide-react";

import {
  LogRow,
  PanelHeader,
  PanelNotice,
} from "@/components/dashboard/DashboardPanels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OperationLogEntry } from "@/types";

interface LogsPanelProps {
  onNavigate: (path: string) => void;
  recentLogs: OperationLogEntry[];
  isLogsLoading: boolean;
  logTotal: number;
}

export function LogsPanel({
  onNavigate,
  recentLogs,
  isLogsLoading,
  logTotal,
}: LogsPanelProps) {
  const { t } = useTranslation();

  return (
    <Card className="p-0">
      <PanelHeader
        title={t("dashboard.recentLogs")}
        description={t("dashboard.recentLogsDesc", { count: logTotal })}
        action={
          <Button variant="ghost" size="sm" onClick={() => onNavigate("/logs")}>
            {t("dashboard.viewAllLogs")}
            <ChevronRight className="size-3.5" />
          </Button>
        }
      />
      <CardContent className="px-4 py-3">
        {isLogsLoading ? (
          <PanelNotice>
            <Loader2 className="size-4 animate-spin" />
            {t("dashboard.loadingLogs")}
          </PanelNotice>
        ) : recentLogs.length > 0 ? (
          <div className="divide-y divide-border">
            {recentLogs.map((entry) => (
              <LogRow
                key={entry.id}
                entry={entry}
                statusLabel={t(`logs.status.${entry.status}`, {
                  defaultValue: entry.status,
                })}
              />
            ))}
          </div>
        ) : (
          <PanelNotice>{t("dashboard.noRecentLogs")}</PanelNotice>
        )}
      </CardContent>
    </Card>
  );
}
