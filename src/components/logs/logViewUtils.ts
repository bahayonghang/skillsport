import type { LogsListDensity } from "@/components/logs/LogsListRow";

export const LOG_DENSITY_STORAGE_KEY = "skillport.logs.density";

/**
 * Native filter <select> styled as DESIGN.md `input`: input surface, 1px
 * input stroke (>= 3:1), `rounded-control`, hover deepens the stroke, focus
 * = ring stroke + the unified outline. Used by both log console modes.
 */
export const LOG_FILTER_SELECT_CLASS =
  "focus-ring h-8 rounded-control border border-input bg-input-surface px-2.5 text-sm text-foreground transition-colors duration-150 hover:border-muted-foreground focus-visible:border-ring";

/** Quiet text button (reset filters) shared by both log console modes. */
export const LOG_TEXT_BUTTON_CLASS =
  "focus-ring inline-flex items-center gap-1 rounded-pill px-2.5 py-1 transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:opacity-50";

/** Column header strip of a log table card (sentence case, small muted). */
export const LOG_TABLE_HEAD_CLASS =
  "border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground";

export function loadLogDensity(): LogsListDensity {
  if (typeof window === "undefined") return "comfortable";
  const stored = window.localStorage.getItem(LOG_DENSITY_STORAGE_KEY);
  return stored === "compact" ? "compact" : "comfortable";
}

export function downloadOperationLogs(payload: string) {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");

  link.href = url;
  link.download = `skillport-operation-logs-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function toDateInput(value?: string): string {
  return value?.slice(0, 10) ?? "";
}

export function fromStartDateInput(value: string): string | undefined {
  return value ? `${value}T00:00:00Z` : undefined;
}

export function fromEndDateInput(value: string): string | undefined {
  return value ? `${value}T23:59:59Z` : undefined;
}
