import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-control border border-input bg-input-surface px-3 py-2 text-base text-foreground transition-[color,background-color,border-color] duration-150 outline-none placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive-text aria-invalid:focus-visible:outline-destructive-text md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
