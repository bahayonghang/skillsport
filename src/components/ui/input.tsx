import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // DESIGN.md Components → input: input well + input-stroke (≥3:1),
        // rounded-control; hover deepens the stroke to ink-muted; focus =
        // ring stroke + unified outline; error = aria-invalid rose stroke.
        "h-8 w-full min-w-0 rounded-control border border-input bg-input-surface px-3 py-1 text-base text-foreground transition-[color,background-color,border-color] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive-text aria-invalid:focus-visible:outline-destructive-text md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
