import * as React from "react"

import { BADGE_TONE_CLASS, type BadgeTone } from "@/lib/statusTone"
import { cn } from "@/lib/utils"

// DESIGN.md Components → pill-status / Badge.
// Capsule + 12% semantic tint + semantic text colour, `text-xs` label in
// sentence case. Non-interactive. Colour is never alone: children (text) are
// required and an optional leading icon reinforces the state.
// Badges must sit on a panel / sidebar / overlay (the composites the contrast
// matrix measures), not directly on the canvas.

const SIZE_CLASS = {
  sm: "h-5 gap-1 px-2 [&_svg:not([class*='size-'])]:size-3",
  md: "h-5.5 gap-1 px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
} as const

type BadgeSize = keyof typeof SIZE_CLASS

interface BadgeProps extends Omit<React.ComponentProps<"span">, "children"> {
  tone?: BadgeTone
  size?: BadgeSize
  /** Leading 14px line icon (decorative; the text carries the meaning). */
  icon?: React.ReactNode
  children: React.ReactNode
}

function Badge({
  tone = "neutral",
  size = "md",
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      data-size={size}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center rounded-full text-xs leading-none font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0",
        SIZE_CLASS[size],
        BADGE_TONE_CLASS[tone],
        className
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

export { Badge }
export type { BadgeProps, BadgeSize, BadgeTone }
