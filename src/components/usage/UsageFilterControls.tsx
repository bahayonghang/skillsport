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
      className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-muted/20 p-0.5"
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
        "h-10 min-h-[40px] min-w-[40px] rounded-md px-3 text-xs transition-none disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-100 md:h-10 md:min-w-[40px]",
        pressed
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground disabled:border-border disabled:bg-muted/15",
        className,
      )}
      {...props}
    />
  );
}
