import { Loader2 } from "lucide-react";
import type { TFunction } from "i18next";

import type { CentralClearJob } from "@/stores/centralSkillsStore.types";

export function ClearProgressPanel({
  t,
  job,
}: {
  t: TFunction;
  job: CentralClearJob | null;
}) {
  const completed = job?.completed ?? 0;
  const total = job?.total ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const phaseLabel = job?.phase
    ? t(`central.clearAll.phase.${job.phase}`)
    : t("central.clearAll.phaseStarting");
  const isCancelling = job?.status === "cancelling";

  return (
    <div className="space-y-2" data-testid="central-clear-all-progress">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-2" data-testid="central-clear-all-phase">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary-text" aria-hidden />
          <span className="truncate">
            {isCancelling ? t("central.clearAll.cancelling") : phaseLabel}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {t("central.clearAll.progressCount", { completed, total })}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-popover"
        role="progressbar"
        aria-label={t("central.clearAll.progressLabel")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={`${phaseLabel} ${t("central.clearAll.progressCount", { completed, total })}`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
