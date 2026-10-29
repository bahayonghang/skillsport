import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { PortableBundleImportResult } from "@/types";

export function ImportResultView({
  result,
  retryCount,
  disabled,
  onRetryFailed,
  onImportAnother,
}: {
  result: PortableBundleImportResult;
  /** Failed plus cancel-skipped items that a retry would write. */
  retryCount: number;
  disabled: boolean;
  onRetryFailed: () => void;
  onImportAnother: () => void;
}) {
  const { t } = useTranslation();
  const written = result.imported.length + result.overwritten.length + result.renamed.length;
  const identical = result.skipped.filter((issue) => issue.code === "identical").length;
  const skipped = result.skipped.length - identical;
  const ok = result.failed.length === 0 && !result.cancelled;

  return (
    <div className="space-y-3" data-testid="central-portability-result">
      <div
        className={
          ok
            ? "flex items-center gap-2 rounded-control border border-border bg-primary-tint p-3 text-sm font-medium"
            : "flex items-center gap-2 rounded-control border border-border bg-warning-tint p-3 text-sm font-medium"
        }
      >
        {ok ? (
          <CheckCircle2 className="size-4 text-primary-text" />
        ) : (
          <AlertTriangle className="size-4 text-warning-foreground" />
        )}
        {result.cancelled
          ? t("central.bundle.result.cancelled", { count: written })
          : t("central.bundle.result.done", { count: written })}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {(
          [
            ["imported", result.imported.length],
            ["overwritten", result.overwritten.length],
            ["renamed", result.renamed.length],
            ["identical", identical],
            ["skipped", skipped],
            ["failed", result.failed.length],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="rounded-inner bg-accent px-2.5 py-2">
            <dt className="text-muted-foreground">{t(`central.bundle.result.${key}`)}</dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-muted-foreground">
        {t("central.bundle.result.metadata", {
          added: result.metadata.added,
          updated: result.metadata.updated,
          unchanged: result.metadata.unchanged,
        })}
      </p>

      {result.renamed.length > 0 ? (
        <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
          {result.renamed.map((entry) => (
            <li key={entry.from} className="truncate">
              {entry.from} → {entry.to}
            </li>
          ))}
        </ul>
      ) : null}

      {result.failed.length > 0 ? (
        <ul
          className="max-h-32 space-y-0.5 overflow-y-auto text-xs"
          data-testid="central-portability-result-failed"
        >
          {result.failed.map((issue) => (
            <li key={issue.id} className="truncate">
              <span className="font-medium">{issue.id}</span>
              <span className="text-muted-foreground">
                {" · "}
                {t(`central.bundle.issue.${issue.code}`, {
                  defaultValue: t("central.bundle.issue.write_failed"),
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onImportAnother} disabled={disabled}>
          {t("central.bundle.result.importAnother")}
        </Button>
        {retryCount > 0 ? (
          <Button
            onClick={onRetryFailed}
            disabled={disabled}
            data-testid="central-portability-retry-failed"
          >
            <RotateCcw className="size-4" />
            {t("central.bundle.result.retryFailed", { count: retryCount })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
