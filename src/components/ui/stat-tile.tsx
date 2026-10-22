import * as React from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

// DESIGN.md Components → stat-tile.
// Tint block (mint = input / completion, lavender = output / secondary data,
// neutral = surface-hover) with a 14px line icon + `text-xs` muted label on
// top and the `text-display-stat` number below (ink, tabular-nums, never an
// accent colour or gradient). `rounded-inner` (14px) so it nests concentric
// inside a card (18px). Non-interactive.
//
// Accessibility: the root is `role="group"` named "<label>: <value>", so the
// number is announced with its meaning. Loading keeps the height with a
// skeleton; a missing value renders "—" plus an "unavailable" name instead
// of faking 0.

type StatTileTone = "primary" | "secondary" | "neutral"
type StatTileSize = "default" | "compact"

const TONE_CLASS: Record<StatTileTone, string> = {
  primary: "bg-primary-tint",
  secondary: "bg-secondary-accent-tint",
  neutral: "bg-accent",
}

const ICON_TONE_CLASS: Record<StatTileTone, string> = {
  primary: "text-primary-text",
  secondary: "text-secondary-accent-text",
  neutral: "text-muted-foreground",
}

interface StatTileProps
  extends Omit<React.ComponentProps<"div">, "children" | "aria-label"> {
  tone?: StatTileTone
  size?: StatTileSize
  /** Leading line icon (decorative). Input / output tiles pass ↓ / ↑. */
  icon?: React.ReactNode
  /** Visible label; also the first half of the accessible name. */
  label: string
  /**
   * Numbers are formatted with `Intl.NumberFormat` in the active i18n
   * language; strings are rendered as-is (caller formatted). `null` /
   * `undefined` mean "unavailable" (error), not zero.
   */
  value: number | string | null | undefined
  /** Optional one-line muted supplement. */
  hint?: React.ReactNode
  loading?: boolean
  formatOptions?: Intl.NumberFormatOptions
}

function StatTile({
  tone = "primary",
  size = "default",
  icon,
  label,
  value,
  hint,
  loading = false,
  formatOptions,
  className,
  ...props
}: StatTileProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language

  const unavailable = !loading && (value === null || value === undefined)
  const formatted = React.useMemo(() => {
    if (typeof value === "number") {
      try {
        return new Intl.NumberFormat(language, formatOptions).format(value)
      } catch {
        return String(value)
      }
    }
    return value ?? ""
  }, [formatOptions, language, value])

  const spokenValue = loading
    ? t("common.loading")
    : unavailable
      ? t("ui.statUnavailable")
      : formatted
  const compact = size === "compact"

  return (
    <div
      role="group"
      aria-label={t("ui.statAriaLabel", { label, value: spokenValue })}
      aria-busy={loading || undefined}
      data-slot="stat-tile"
      data-tone={tone}
      data-size={size}
      className={cn(
        "flex min-w-0 flex-col rounded-inner",
        compact ? "gap-0.5 px-3 py-2" : "gap-1 px-3.5 py-3",
        TONE_CLASS[tone],
        className
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        {icon ? (
          <span
            className={cn(
              "inline-flex shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
              ICON_TONE_CLASS[tone]
            )}
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "min-w-0 leading-tight font-semibold text-foreground tabular-nums break-words",
          compact ? "text-xl" : "text-display-stat"
        )}
      >
        {loading ? (
          <span
            data-slot="stat-tile-skeleton"
            className="inline-block h-[1lh] w-16 animate-pulse rounded-control bg-accent align-middle"
          />
        ) : unavailable ? (
          "—"
        ) : (
          formatted
        )}
      </div>
      {hint ? (
        <div className="min-w-0 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  )
}

export { StatTile }
export type { StatTileProps, StatTileSize, StatTileTone }
