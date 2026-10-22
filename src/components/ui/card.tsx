import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// DESIGN.md Components → card: L2 simulated glass (`.glass-panel`, no real
// blur), `rounded-card` (18px), inner padding {spacing.lg} = 16px.
// Tint variants paint the 12% wash over the panel fill (`.tint-*` is a
// background-image), which is the composite themeContrast.test.ts measures.
// Only interactive cards get the one-step hover shadow.
const cardVariants = cva(
  "group/card flex flex-col gap-4 overflow-hidden rounded-card py-4 text-sm text-card-foreground has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-card *:[img:last-child]:rounded-b-card",
  {
    variants: {
      variant: {
        glass: "glass-panel",
        "tint-primary": "glass-panel tint-primary",
        "tint-secondary": "glass-panel tint-secondary",
        plain: "bg-transparent",
      },
      interactive: {
        true: "glass-panel-hover focus-ring",
        false: "",
      },
    },
    defaultVariants: {
      variant: "glass",
      interactive: false,
    },
  }
)

type CardVariant = NonNullable<VariantProps<typeof cardVariants>["variant"]>

function Card({
  className,
  size = "default",
  variant = "glass",
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  variant?: CardVariant
  interactive?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(cardVariants({ variant, interactive }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-semibold group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

// Footer: divider hairline on top + small muted text; a trailing link-variant
// Button ("查看详情") goes on the right via `ml-auto` / `justify-between`.
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground group-data-[size=sm]/card:px-3 group-data-[size=sm]/card:py-2.5",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
