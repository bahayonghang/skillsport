import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";

import { PanelHeader } from "@/components/dashboard/DashboardPanels";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getPlatformTargetCountAgentId,
  getPlatformTargetLabel,
  getPlatformTargetPathHint,
  type PlatformTarget,
} from "@/lib/platformTargetGroups";

interface AgentsPanelProps {
  onNavigate: (path: string) => void;
  visiblePlatformTargets: PlatformTarget[];
  enabledTargetsCount: number;
  skillsByAgent: Record<string, number>;
}

const dashboardControlMotion =
  "transition-[scale,background-color,border-color,color] duration-150 ease-out active:scale-[0.96]";

export function AgentsPanel({
  onNavigate,
  visiblePlatformTargets,
  enabledTargetsCount,
  skillsByAgent,
}: AgentsPanelProps) {
  const { t } = useTranslation();

  return (
    <Card className="p-0">
      <PanelHeader
        title={t("dashboard.agents.title", {
          enabled: enabledTargetsCount,
          total: visiblePlatformTargets.length,
        })}
        description={t("dashboard.agents.description")}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10"
            onClick={() => onNavigate("/settings/platforms")}
          >
            {t("dashboard.agents.manage")}
            <ChevronRight className="size-3.5" />
          </Button>
        }
      />
      <CardContent className="p-0">
        {visiblePlatformTargets.length > 0 ? (
          <ul>
            {visiblePlatformTargets.slice(0, 7).map((agent) => {
              const countAgentId = getPlatformTargetCountAgentId(agent);
              const pathHint = getPlatformTargetPathHint(agent);
              const label = getPlatformTargetLabel(agent, t, "short");
              const count = skillsByAgent[countAgentId] ?? 0;
              const maxCount = Math.max(
                1,
                ...visiblePlatformTargets.map(
                  (target) =>
                    skillsByAgent[getPlatformTargetCountAgentId(target)] ?? 0,
                ),
              );

              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/platform/${agent.id}`)}
                    className={`focus-ring grid w-full grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-border px-4 py-3 text-left first:border-t-0 hover:bg-accent ${dashboardControlMotion}`}
                    aria-label={t("dashboard.agents.openLabel", {
                      name: label,
                    })}
                  >
                    <span className="grid size-8 place-items-center rounded-control bg-accent text-foreground">
                      <PlatformIcon agentId={agent.id} className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {label}
                        </span>
                        {!agent.is_enabled && (
                          <Badge
                            tone="neutral"
                            size="sm"
                            className="hidden sm:inline-flex"
                          >
                            {t("dashboard.agents.hidden")}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {pathHint || t("dashboard.agents.noPath")}
                      </span>
                    </span>
                    <span className="flex w-20 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-accent"
                      >
                        <span
                          className="block h-full origin-left rounded-pill bg-primary"
                          style={{
                            transform: `scaleX(${Math.min(1, count / maxCount)})`,
                          }}
                        />
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {count}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t("sidebar.noPlatforms")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
