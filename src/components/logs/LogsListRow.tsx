import { useTranslation } from "react-i18next";

import { OperationLogEntry } from "@/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buildOperationDiagnostic } from "@/components/logs/logDiagnostics";
import {
  logLevelBadge,
  logStatusBadge,
} from "@/components/logs/logStatusBadge";
import { formatBackendError } from "@/lib/backendError";
import {
  formatDurationMs,
  formatLogAbsoluteTime,
  formatLogIsoTime,
  formatRelativeTime,
} from "@/components/logs/logsUtils";

export type LogsListDensity = "compact" | "comfortable";

interface LogsListRowProps {
  entry: OperationLogEntry;
  onOpen: (entry: OperationLogEntry, trigger: HTMLButtonElement) => void;
  density?: LogsListDensity;
  rowIndex?: number;
}

function targetLabelKey(targetKind: string): string {
  return ["local", "ssh", "wsl"].includes(targetKind)
    ? `logs.targets.${targetKind}`
    : "logs.targets.unknown";
}

function statusLabelKey(status: string): string {
  return [
    "started",
    "succeeded",
    "failed",
    "partial",
    "cancelled",
    "interrupted",
  ].includes(status)
    ? `logs.status.${status}`
    : "logs.status.unknown";
}

export function LogsListRow({
  entry,
  onOpen,
  density = "comfortable",
  rowIndex,
}: LogsListRowProps) {
  const { t, i18n } = useTranslation();
  const diagnostic = buildOperationDiagnostic(entry);
  const hasError = ["failed", "partial", "interrupted"].includes(entry.status);
  const status = logStatusBadge(entry.status);
  const level = logLevelBadge(entry.level);
  const relative = formatRelativeTime(entry.createdAt, i18n.language);
  const absolute = formatLogAbsoluteTime(entry.createdAt);
  const iso = formatLogIsoTime(entry.createdAt);

  return (
    <button
      type="button"
      data-logs-row=""
      data-row-index={rowIndex}
      onClick={(event) => onOpen(entry, event.currentTarget)}
      className={cn(
        "group/log relative grid w-full grid-cols-[9rem_4.5rem_minmax(0,1fr)_minmax(0,1.6fr)_5rem_7rem] items-start gap-3 border-b border-border px-3 text-left text-sm transition-colors duration-150 last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        density === "compact" ? "py-1.5" : "py-2.5",
      )}
    >
      <span className="flex flex-col" title={iso}>
        <span className="text-xs text-foreground">{relative}</span>
        <span className="font-mono text-ui-meta text-muted-foreground">
          {absolute}
        </span>
      </span>
      <span className="flex">
        <Badge tone={level.tone} size="sm" icon={level.icon} className="font-mono">
          {entry.level}
        </Badge>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm">
          {t(targetLabelKey(entry.targetKind))}
        </span>
        <span className="text-xs text-muted-foreground">
          {entry.targetKind}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-xs">{entry.action}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {t(`logs.diagnostics.statusSummaries.${entry.status}`, {
            defaultValue: t("logs.diagnostics.statusSummaries.default"),
          })}
        </span>
        {hasError && (
          <span className="mt-1 line-clamp-2 block rounded-control bg-destructive-tint px-2 py-1 text-xs text-destructive-text">
            <span className="font-medium">{t("logs.errorInline")}</span>
            <span className="ml-1">
              {diagnostic.errorCode
                ? formatBackendError(
                    {
                      code: diagnostic.errorCode,
                      message: t("logs.diagnostics.reasons.unavailable"),
                      retryable: diagnostic.retryable ?? false,
                    },
                    t,
                  )
                : t("logs.diagnostics.reasons.unavailable")}
            </span>
          </span>
        )}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatDurationMs(entry.durationMs ?? null)}
      </span>
      <span className="flex self-start">
        <Badge tone={status.tone} icon={status.icon}>
          {t(statusLabelKey(entry.status))}
        </Badge>
      </span>
    </button>
  );
}
