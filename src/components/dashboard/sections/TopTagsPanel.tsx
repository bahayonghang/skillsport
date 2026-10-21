import { useTranslation } from "react-i18next";

import {
  ChartStateRow,
  PanelHeader,
  PanelNotice,
  ProgressRow,
} from "@/components/dashboard/DashboardPanels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CentralTopTag } from "@/types";

interface TopTagsPanelProps {
  topTags: CentralTopTag[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function TopTagsPanel({
  topTags,
  isLoading,
  error,
  onRetry,
}: TopTagsPanelProps) {
  const { t } = useTranslation();
  const maxCount = Math.max(1, ...topTags.map((tag) => tag.count));

  return (
    <Card className="p-0">
      <PanelHeader
        title={t("dashboard.topTags.title")}
        description={t("dashboard.topTags.description")}
      />
      <CardContent className="space-y-3 p-4">
        {isLoading ? (
          <ChartStateRow kind="loading" />
        ) : error ? (
          <ChartStateRow kind="error" onRetry={onRetry} />
        ) : topTags.length > 0 ? (
          topTags.map((tag) => (
            <ProgressRow
              key={tag.id}
              label={
                <Badge tone="neutral" size="sm" title={tag.name}>
                  {tag.name}
                </Badge>
              }
              count={tag.count}
              total={maxCount}
              tone="secondary"
            />
          ))
        ) : (
          <PanelNotice>{t("dashboard.topTags.empty")}</PanelNotice>
        )}
      </CardContent>
    </Card>
  );
}
