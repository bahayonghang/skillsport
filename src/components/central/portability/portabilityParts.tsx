import { AlertTriangle, Loader2, Server, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { formatBackendError, parseBackendError } from "@/lib/backendError";
import type { PortableBundleJob } from "@/types";

export function TargetBadge({ label, target }: { label: string; target: string }) {
  return (
    <div
      className="mt-2 inline-flex max-w-full items-center gap-2 rounded-control border border-border bg-accent px-2.5 py-1.5 text-xs"
      data-testid="central-portability-active-target"
    >
      <Server className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{target}</span>
    </div>
  );
}

export function JobProgress({
  job,
  onCancel,
}: {
  job: PortableBundleJob;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const isCancelling = job.status === "cancelling";
  const ratio = job.total > 0 ? Math.min(1, job.completed / job.total) : 0;
  return (
    <div
      className="space-y-2 rounded-control border border-border bg-accent p-3"
      data-testid="central-portability-progress"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <div className="font-medium">
            {job.phase ? t(`central.portabilityPhase.${job.phase}`) : t("central.portabilityProgressTitle")}
          </div>
          {job.currentItem ? (
            <div className="truncate text-xs text-muted-foreground">{job.currentItem}</div>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="central-portability-cancel-job"
          onClick={onCancel}
          disabled={isCancelling}
        >
          {isCancelling ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <XCircle className="size-4" />
          )}
          {isCancelling ? t("central.portabilityCancelling") : t("central.portabilityCancel")}
        </Button>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-popover"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${job.total > 0 ? Math.round(ratio * 100) : 0}%` }}
        />
      </div>
      {job.total > 0 ? (
        <div className="text-xs text-muted-foreground">
          {t("central.portabilityProgressCompleted", {
            completed: job.completed,
            total: job.total,
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Coded backend errors get a hint about what to do next where one exists. */
export function ErrorNotice({ error, testId }: { error: unknown; testId?: string }) {
  const { t } = useTranslation();
  const code = parseBackendError(error).code;
  const hint = code ? (t(`central.bundle.errorHint.${code}`, { defaultValue: "" }) as string) : "";
  return (
    <div
      role="alert"
      data-testid={testId ?? "central-portability-error"}
      className="flex gap-2 rounded-control border border-destructive/30 bg-destructive-tint p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive-text" />
      <div className="min-w-0 space-y-1">
        <div className="text-foreground">{formatBackendError(error, t)}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}
