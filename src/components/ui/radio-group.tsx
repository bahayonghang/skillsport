import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"

import { cn } from "@/lib/utils"

// ─── RadioGroup ───────────────────────────────────────────────────────────────

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

// ─── RadioItem ────────────────────────────────────────────────────────────────

function RadioItem({
  className,
  value,
  ...props
}: React.ComponentProps<typeof RadioPrimitive.Root>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-item"
      value={value}
      className={cn(
        "group/radio flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-input-surface transition-[border-color] duration-150",
        "hover:border-muted-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive-text",
        "data-[checked]:border-primary",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        className={cn(
          "size-2 rounded-full bg-primary",
          "data-[unchecked]:hidden"
        )}
      />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioItem }
