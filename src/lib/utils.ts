import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge the project tokens registered in `src/index.css`
// `@theme inline`. Without this, unknown `text-*` values are classified as
// text colours, so `cn("text-ui-meta", "text-muted-foreground")` silently
// dropped the size; unknown `rounded-*` / `shadow-*` values never conflicted
// with the stock ones, leaving the winner to CSS source order.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "ui-meta",
        "ui-micro",
        "display-stat",
      ],
      radius: ["control", "inner", "card", "shell", "pill"],
      shadow: ["glass", "glass-hover", "overlay"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
