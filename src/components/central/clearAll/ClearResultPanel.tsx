import type { TFunction } from "i18next";

import { formatBackendError } from "@/lib/backendError";
import { clearCentralFailedCount, clearCentralSucceededCount } from "@/lib/centralClearAll";
import type { ClearCentralResult } from "@/types/centralClear";

/** Failure rows rendered at most; the rest are summarized as a count. */
export const CLEAR_RESULT_FAILED_ROW_LIMIT = 200;

interface FailedRow {
  id: string;
  label: string;
  message: string;
}

function failedRows(t: TFunction, result: ClearCentralResult): FailedRow[] {
  const fallback = t("central.clearAll.failedItemFallback");
  const rows: FailedRow[] = result.skills.failed.map((item) => ({
    id: `skill:${item.skill_id}`,
    label: item.skill_id,
    message: formatBackendError(
      item.error_code ? `${item.error_code}:${fallback}` : fallback,
      t,
    ),
  }));
  for (const outcome of [
    result.projectLinks,
    result.untrackedCentralEntries,
    result.orphanLinks,
  ]) {
    for (const item of outcome.failed) {
      rows.push({
        id: `path:${item.key}`,
        label: item.path,
        message: formatBackendError(`${item.errorCode}:${fallback}`, t),
      });
    }
  }
  return rows;
}

export function ClearResultPanel({
  t,
  result,
}: {
  t: TFunction;
  result: ClearCentralResult;
}) {
  const succeeded = clearCentralSucceededCount(result);
  const failed = clearCentralFailedCount(result);
  const rows = failedRows(t, result);
  const title = result.cancelled
    ? t("central.clearAll.resultTitleCancelled")
    : failed > 0
      ? t("central.clearAll.resultTitlePartial")
      : t("central.clearAll.resultTitleDone");

  return (
    <div className="space-y-3" data-testid="central-clear-all-result">
      <p className="text-sm font-medium" role="status">
        {title}
      </p>
      <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <li data-testid="central-clear-all-result-succeeded">
          {t("central.clearAll.resultSucceeded", { count: succeeded })}
        </li>
        <li data-testid="central-clear-all-result-failed">
          {t("central.clearAll.resultFailed", { count: failed })}
        </li>
        <li>{t("central.clearAll.resultSkipped", { count: result.skippedChanged })}</li>
        {result.recovery.recovered + result.recovery.failed > 0 ? (
          <li>
            {t("central.clearAll.resultRecovery", {
              recovered: result.recovery.recovered,
              failed: result.recovery.failed,
            })}
          </li>
        ) : null}
      </ul>
      {result.cancelled ? (
        <p className="text-xs text-muted-foreground">
          {t("central.clearAll.resultCancelledHint")}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <details className="rounded-inner bg-warning-tint p-3 text-xs text-warning-foreground">
          <summary className="cursor-pointer font-medium">
            {t("central.clearAll.failedListTitle")} ({rows.length})
          </summary>
          <ul
            className="scrollbar-subtle mt-2 max-h-48 space-y-1 overflow-auto"
            data-testid="central-clear-all-failed-list"
          >
            {rows.slice(0, CLEAR_RESULT_FAILED_ROW_LIMIT).map((row) => (
              <li key={row.id} className="min-w-0 break-all">
                <span className="font-mono">{row.label}</span>: {row.message}
              </li>
            ))}
            {rows.length > CLEAR_RESULT_FAILED_ROW_LIMIT ? (
              <li data-testid="central-clear-all-failed-more">
                {t("central.clearAll.listMore", {
                  count: rows.length - CLEAR_RESULT_FAILED_ROW_LIMIT,
                })}
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
