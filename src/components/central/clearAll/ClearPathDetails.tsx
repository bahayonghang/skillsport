import { useState, type UIEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TFunction } from "i18next";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { ClearCentralPathItem } from "@/types/centralClear";

/** Above this many rows the list renders only the visible window. */
export const CLEAR_PATH_WINDOW_THRESHOLD = 200;
const ROW_HEIGHT = 24;
const VIEWPORT_HEIGHT = 192;
const OVERSCAN = 10;

function PathRow({ t, item }: { t: TFunction; item: ClearCentralPathItem }) {
  return (
    <li
      className="flex h-6 min-w-0 items-center gap-2 px-2 font-mono text-ui-meta"
      title={item.path}
    >
      <span className="min-w-0 flex-1 truncate">{item.path}</span>
      {item.dangling ? (
        <Badge size="sm" tone="warning">
          {t("central.clearAll.danglingBadge")}
        </Badge>
      ) : null}
    </li>
  );
}

/** Collapsed, height-capped path list with simple windowing for long lists. */
function PathList({ t, items }: { t: TFunction; items: readonly ClearCentralPathItem[] }) {
  const [scrollTop, setScrollTop] = useState(0);
  const windowed = items.length > CLEAR_PATH_WINDOW_THRESHOLD;
  const start = windowed ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const end = windowed
    ? Math.min(items.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN)
    : items.length;

  return (
    <div
      className="scrollbar-subtle overflow-auto rounded-inner bg-popover"
      style={{ maxHeight: VIEWPORT_HEIGHT }}
      onScroll={
        windowed
          ? (event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)
          : undefined
      }
      data-testid="central-clear-all-path-list"
      data-windowed={windowed || undefined}
    >
      {windowed ? (
        <div className="relative" style={{ height: items.length * ROW_HEIGHT }}>
          <ul className="absolute inset-x-0" style={{ top: start * ROW_HEIGHT }}>
            {items.slice(start, end).map((item) => (
              <PathRow key={item.key} t={t} item={item} />
            ))}
          </ul>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <PathRow key={item.key} t={t} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClearPathDetails({
  t,
  testId,
  label,
  checked,
  disabled,
  onCheckedChange,
  items,
  total,
}: {
  t: TFunction;
  testId: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  items: readonly ClearCentralPathItem[];
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (total === 0) return null;
  const listId = `${testId}-paths`;
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <Checkbox
            checked={checked}
            disabled={disabled}
            onCheckedChange={(value) => onCheckedChange(!!value)}
            aria-label={label}
            data-testid={`${testId}-toggle`}
          />
          <span className="min-w-0" aria-hidden>
            {label}
          </span>
        </label>
        {items.length > 0 ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
            data-testid={`${testId}-expand`}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden />
            )}
            {expanded ? t("central.clearAll.hidePaths") : t("central.clearAll.showPaths")}
          </button>
        ) : null}
      </div>
      {items.length < total ? (
        <p className="text-xs text-muted-foreground" data-testid={`${testId}-truncated`}>
          {t("central.clearAll.pathsTruncated", { shown: items.length, total })}
        </p>
      ) : null}
      {expanded ? (
        <div id={listId}>
          <PathList t={t} items={items} />
        </div>
      ) : null}
    </div>
  );
}
