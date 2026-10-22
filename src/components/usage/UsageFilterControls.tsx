import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function UsageFilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap gap-0.5 rounded-pill bg-accent p-0.5"
    >
      {children}
    </div>
  );
}

export function UsageFilterButton({
  pressed,
  className,
  ...props
}: ComponentProps<typeof Button> & { pressed: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={pressed}
      className={cn(
        "h-10 min-h-[40px] min-w-[40px] rounded-pill px-3 text-xs transition-none disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-100 md:h-10 md:min-w-[40px]",
        // DESIGN.md pill-status as a filter: selected = mint tint + 1px mint
        // stroke (not a solid fill); the selected look survives (dark) hover.
        pressed
          ? "border-primary-stroke bg-primary-tint text-primary-text hover:bg-primary-tint hover:text-primary-text dark:hover:bg-primary-tint"
          : "text-muted-foreground hover:bg-accent hover:text-foreground disabled:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}
