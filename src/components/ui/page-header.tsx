import * as React from "react"

import { cn } from "@/lib/utils"

// DESIGN.md Layout → 页面标题区（PageHeader）.
// Bold page title (fixed rem, `font-display`) on the left; small muted meta
// text and page-level actions on the right. Sits directly on the canvas — no
// panel. The single `<h1>` of the page lives here.
// Responsive: a container query on the header itself; below 900px of header
// width (the "compact" window band once the sidebar is subtracted) the meta
// and actions wrap under the title.

interface PageHeaderProps
  extends Omit<React.ComponentProps<"header">, "title"> {
  title: React.ReactNode
  /** Small muted meta text, e.g. "Newest first · last 8 hours". */
  meta?: React.ReactNode
  /** Page-level actions (Buttons). */
  actions?: React.ReactNode
  /** Optional id for the `<h1>` (aria-labelledby targets). */
  titleId?: string
}

function PageHeader({
  title,
  meta,
  actions,
  titleId,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("@container/page-header w-full min-w-0", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-2 @min-[900px]/page-header:flex-row @min-[900px]/page-header:items-center @min-[900px]/page-header:justify-between @min-[900px]/page-header:gap-6">
        <h1
          id={titleId}
          className="min-w-0 font-display text-2xl leading-tight font-semibold tracking-tight text-foreground"
        >
          {title}
        </h1>
        {meta || actions ? (
          <div
            data-slot="page-header-aside"
            className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 @min-[900px]/page-header:shrink-0 @min-[900px]/page-header:justify-end"
          >
            {meta ? (
              <p
                data-slot="page-header-meta"
                className="min-w-0 text-xs text-muted-foreground"
              >
                {meta}
              </p>
            ) : null}
            {actions ? (
              <div
                data-slot="page-header-actions"
                className="flex shrink-0 flex-wrap items-center gap-2"
              >
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  )
}

export { PageHeader }
export type { PageHeaderProps }
