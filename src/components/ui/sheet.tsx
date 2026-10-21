import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// DESIGN.md Components → dialog / Sheet (L3): a side drawer built on base-ui
// Dialog. The popup floats 8px off the window edge with `rounded-shell`
// (20px), `.glass-overlay` + `.glass-overlay-dialog` (24px real blur). The
// scrim is the canvas colour at 30% with no blur. Focus is trapped by
// base-ui, Esc closes, focus returns to the trigger.

function Sheet(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

type SheetSide = "right" | "left"

const SIDE_CLASS: Record<SheetSide, string> = {
  right:
    "right-2 data-[starting-style]:translate-x-6 data-[ending-style]:translate-x-6",
  left: "left-2 data-[starting-style]:-translate-x-6 data-[ending-style]:-translate-x-6",
}

interface SheetContentProps extends DialogPrimitive.Popup.Props {
  side?: SheetSide
  showCloseButton?: boolean
  /** Unmount on close (default) or keep the subtree mounted. */
  keepMounted?: boolean
  backdropClassName?: string
  /** Extra props for the scrim (e.g. a `data-testid`). */
  backdropProps?: Omit<DialogPrimitive.Backdrop.Props, "className"> &
    Partial<Record<`data-${string}`, string>>
}

function SheetContent({
  side = "right",
  showCloseButton = true,
  keepMounted = false,
  backdropClassName,
  backdropProps,
  className,
  children,
  ...props
}: SheetContentProps) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Portal keepMounted={keepMounted}>
      <DialogPrimitive.Backdrop
        {...backdropProps}
        data-slot="sheet-overlay"
        className={cn(
          "fixed inset-0 z-50 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          backdropClassName
        )}
      />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "glass-overlay glass-overlay-dialog fixed inset-y-2 z-50 flex w-[min(440px,calc(100vw-1rem))] flex-col overflow-hidden rounded-shell text-sm text-popover-foreground outline-none",
          "transition-[translate,opacity] duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          SIDE_CLASS[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-3 right-3"
              />
            }
          >
            <XIcon />
            <span className="sr-only">{t("common.close")}</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-border px-6 pt-5 pb-4 pr-14",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base leading-snug font-semibold",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-6 py-4",
        className
      )}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
}
export type { SheetSide }
