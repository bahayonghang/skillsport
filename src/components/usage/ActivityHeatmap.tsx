import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { DayCount } from "@/types/usage";
import { buildHeatmapScale, heatLevelFor } from "@/components/usage/usageHeatmapScale";

interface ActivityHeatmapProps {
  days: DayCount[];
  compact?: boolean;
  className?: string;
}

const LABELED_WEEKDAY_ROWS = new Set([0, 2, 4]);

/** 固定轨道：格子边长不随容器宽度变化，避免 maximize 时 aspect-ratio 回传高度。 */
const CELL_TRACK_CLASS = {
  default: "auto-cols-[1rem]",
  compact: "auto-cols-[0.625rem]",
} as const;
const CELL_SIZE_CLASS = {
  default: "size-4",
  compact: "size-2.5",
} as const;

export function ActivityHeatmap({
  days,
  compact = false,
  className,
}: ActivityHeatmapProps) {
  const { t, i18n } = useTranslation();
  const [focusIndex, setFocusIndex] = useState(0);
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const heatmapScale = useMemo(
    () => buildHeatmapScale(days.map((day) => day.count)),
    [days],
  );
  const weekdayLabels = useMemo(() => {
    const mondayUtc = Date.UTC(2024, 0, 1);
    const formatter = new Intl.DateTimeFormat(i18n.language || undefined, {
      weekday: "short",
      timeZone: "UTC",
    });
    return Array.from({ length: 7 }, (_, index) =>
      LABELED_WEEKDAY_ROWS.has(index)
        ? formatter.format(new Date(mondayUtc + index * 86_400_000))
        : "",
    );
  }, [i18n.language]);
  const monthLabels = useMemo(
    () => buildMonthLabels(days, i18n.language),
    [days, i18n.language],
  );
  const trackSize = compact ? "compact" : "default";
  const cellTrackClass = CELL_TRACK_CLASS[trackSize];
  const cellSizeClass = CELL_SIZE_CLASS[trackSize];

  if (days.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-32 items-center justify-center text-xs text-muted-foreground",
          className,
        )}
      >
        {t("skillUsage.empty.noActivity")}
      </div>
    );
  }

  function moveFocus(index: number, delta: number) {
    const next = Math.max(0, Math.min(days.length - 1, index + delta));
    setFocusIndex(next);
    cells.current[next]?.focus();
  }

  return (
    <div
      data-testid="heatmap-shell"
      className={cn("min-w-0", compact ? "py-1" : "px-3 py-3", className)}
    >
      <div className="overflow-x-auto pb-1">
        <div data-testid="heatmap-plot" className="w-max">
          <div
            data-testid="heatmap-months"
            className={cn(
              "ml-9 grid grid-flow-col gap-1 text-ui-micro text-muted-foreground",
              cellTrackClass,
            )}
          >
            {monthLabels.map(({ key, label, startWeek, weekSpan }) => (
              <span
                key={key}
                style={{ gridColumn: `${startWeek + 1} / span ${weekSpan}` }}
                className="overflow-hidden whitespace-nowrap"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            <div className="grid w-7 shrink-0 grid-rows-7 items-center text-ui-micro text-muted-foreground">
              {weekdayLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
            <div
              data-testid="heatmap-grid"
              role="grid"
              aria-label={t("skillUsage.heatmap.ariaLabel")}
              className={cn(
                "grid grid-flow-col grid-rows-7 gap-1",
                cellTrackClass,
              )}
            >
              {days.map((day, index) => {
                const level = heatLevelFor(day.count, heatmapScale);
                const label = t("skillUsage.heatmap.cellLabel", {
                  date: day.date,
                  count: day.count,
                });
                return (
                  <button
                    key={day.date}
                    ref={(element) => {
                      cells.current[index] = element;
                    }}
                    type="button"
                    role="gridcell"
                    tabIndex={index === focusIndex ? 0 : -1}
                    data-testid={`heatmap-cell-${day.date}`}
                    data-level={level}
                    title={label}
                    aria-label={label}
                    onFocus={() => setFocusIndex(index)}
                    onKeyDown={(event) => {
                      const delta =
                        event.key === "ArrowRight"
                          ? 7
                          : event.key === "ArrowLeft"
                            ? -7
                            : event.key === "ArrowDown"
                              ? 1
                              : event.key === "ArrowUp"
                                ? -1
                                : 0;
                      if (delta !== 0) {
                        event.preventDefault();
                        moveFocus(index, delta);
                      }
                    }}
                    className={cn(
                      "block shrink-0 rounded-[3px] border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                      cellSizeClass,
                      CELL_LEVEL_CLASS[level],
                    )}
                  />
                );
              })}
            </div>
          </div>
          <div
            data-testid="heatmap-legend"
            className="mt-2 flex items-center justify-end gap-1.5 text-ui-micro text-muted-foreground"
          >
            <span>{t("skillUsage.heatmap.less")}</span>
            {([0, 1, 2, 3, 4, 5] as const).map((level) => (
              <span
                key={level}
                aria-hidden
                className={cn(
                  "size-2.5 rounded-[2px] border border-transparent",
                  CELL_LEVEL_CLASS[level],
                )}
              />
            ))}
            <span>{t("skillUsage.heatmap.more")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildMonthLabels(days: DayCount[], locale: string) {
  const formatter = new Intl.DateTimeFormat(locale || undefined, {
    month: "short",
  });
  const months: Array<{
    key: string;
    label: string;
    startWeek: number;
    weekSpan: number;
  }> = [];
  for (let week = 0; week < Math.ceil(days.length / 7); week += 1) {
    const day = days[week * 7];
    if (!day) continue;
    const date = new Date(`${day.date}T12:00:00`);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    const previous = months[months.length - 1];
    if (previous?.key === monthKey) {
      previous.weekSpan += 1;
    } else {
      months.push({
        key: monthKey,
        label: formatter.format(date),
        startWeek: week,
        weekSpan: 1,
      });
    }
  }
  // 单周残月无法容纳月份全文；仅略过标签，日期格子全部保留。
  return months.filter((month) => month.weekSpan >= 2);
}

const CELL_LEVEL_CLASS: Record<0 | 1 | 2 | 3 | 4 | 5, string> = {
  0: "border-border/60 bg-muted/25",
  1: "bg-chart-2/20",
  2: "bg-chart-2/35",
  3: "bg-chart-2/55",
  4: "bg-chart-2/75",
  5: "bg-chart-2",
};
