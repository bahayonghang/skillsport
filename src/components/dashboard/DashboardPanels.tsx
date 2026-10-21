import type { ReactNode } from "react";

import { useTranslation } from "react-i18next";
import { Loader2, XCircle } from "lucide-react";

import { logStatusBadge } from "@/components/logs/logStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OperationLogEntry } from "@/types";

/** 模块级 formatter：避免每行日志渲染都新建 Intl.DateTimeFormat。 */
const logTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

function ratio(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, count / total));
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return logTimeFormatter.format(date);
}

/**
 * Quiet in-panel placeholder block (loading / empty). `rounded-inner` so it
 * nests concentric inside an 18px card; surface-hover fill, muted text.
 */
export function PanelNotice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-inner bg-accent px-3 py-4 text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 图表面板的加载/失败占位（Activity / TopTags 共用，失败可重试）。 */
export function ChartStateRow({
  kind,
  onRetry,
}: {
  kind: "loading" | "error";
  onRetry?: () => void;
}) {
  const { t } = useTranslation();

  if (kind === "loading") {
    return (
      <PanelNotice>
        <Loader2 className="size-4 animate-spin" />
        {t("dashboard.loading")}
      </PanelNotice>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-inner bg-destructive-tint px-3 py-3 text-sm text-destructive-text">
      <span className="flex min-w-0 items-center gap-2">
        <XCircle className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{t("dashboard.chartError")}</span>
      </span>
      {onRetry && (
        <Button
          variant="glass"
          size="sm"
          className="shrink-0"
          onClick={onRetry}
        >
          {t("dashboard.retry")}
        </Button>
      )}
    </div>
  );
}

/** Card header row: title (typography.title) + muted description + action. */
export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <CardHeader className="border-b border-border px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="truncate text-base font-semibold text-balance">
            {title}
          </CardTitle>
          {description && (
            <CardDescription className="mt-1 max-w-full break-words text-pretty text-xs leading-5">
              {description}
            </CardDescription>
          )}
        </div>
        {action && <div className="shrink-0 self-start">{action}</div>}
      </div>
    </CardHeader>
  );
}

export function ProgressRow({
  label,
  count,
  total,
  tone = "default",
  testId,
}: {
  label: ReactNode;
  count: number;
  total: number;
  tone?: "default" | "primary" | "secondary" | "muted" | "destructive";
  testId?: string;
}) {
  const scale = ratio(count, total);
  const fillClass =
    tone === "destructive"
      ? "bg-destructive"
      : tone === "muted"
        ? "bg-muted-foreground"
        : tone === "secondary"
          ? "bg-secondary-accent"
          : "bg-primary";

  return (
    <div
      data-testid={testId}
      className="grid grid-cols-[minmax(7.5rem,0.9fr)_minmax(4.5rem,1fr)_2.5rem] items-center gap-3"
    >
      <span className="min-w-0 text-xs font-medium leading-4 text-muted-foreground">
        {label}
      </span>
      <span className="h-1.5 overflow-hidden rounded-pill bg-accent">
        <span
          className={cn("block h-full origin-left rounded-pill", fillClass)}
          style={{ transform: `scaleX(${scale})` }}
        />
      </span>
      <span className="text-right text-xs font-semibold tabular-nums">
        {count}
      </span>
    </div>
  );
}

export function LogRow({
  entry,
  statusLabel,
}: {
  entry: OperationLogEntry;
  statusLabel: string;
}) {
  const status = logStatusBadge(entry.status);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{entry.summary}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono text-ui-meta">{entry.action}</span>
          <span aria-hidden="true" className="h-3 w-px bg-border" />
          <span>{entry.targetLabel ?? entry.targetKind}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={status.tone} size="sm" icon={status.icon}>
          {statusLabel}
        </Badge>
        <span className="hidden w-12 text-right text-xs tabular-nums text-muted-foreground sm:block">
          {formatTime(entry.createdAt)}
        </span>
      </div>
    </div>
  );
}
