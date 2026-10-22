import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// ─── Switch ───────────────────────────────────────────────────────────────────

interface SwitchProps extends Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "onCheckedChange"> {
  onCheckedChange?: (checked: boolean) => void;
}

function Switch({ className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // DESIGN.md: pill track; off = input well + input-stroke edge (≥3:1),
        // on = mint fill. 1px border + 2px padding seat the thumb.
        "group/switch relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-input bg-input-surface p-0.5 md:h-5 md:w-9",
        "transition-[background-color,border-color] duration-200",
        "hover:border-muted-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[checked]:border-primary data-[checked]:bg-primary",
        className
      )}
      onCheckedChange={
        onCheckedChange
          ? (checked) => onCheckedChange(checked)
          : undefined
      }
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4.5 rounded-full bg-muted-foreground md:size-3.5",
          "transition-[translate,background-color] duration-200",
          "translate-x-0 group-data-[checked]/switch:translate-x-4 group-data-[checked]/switch:bg-primary-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
