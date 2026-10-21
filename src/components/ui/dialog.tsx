import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        // Scrim = canvas colour at 30%, no blur (DESIGN.md dialog). Base UI
        // exposes transient animation hooks via data-starting-style /
        // data-ending-style; animating persistent data-open / data-closed
        // makes the layer snap to opacity 0 before the exit animation, which
        // WebView2 shows as a close-time flash. Animate transient attrs only.
        "fixed inset-0 isolate z-50 bg-overlay will-change-[opacity] data-[starting-style]:animate-in data-[starting-style]:fade-in-0 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 animation-duration-150",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayProps,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  /** Extra props for the scrim (e.g. a `data-testid`); mirrors Sheet's `backdropProps`. */
  overlayProps?: Omit<DialogPrimitive.Backdrop.Props, "className"> &
    Partial<Record<`data-${string}`, string>>;
}) {
  const { t } = useTranslation();
  return (
    <DialogPortal>
      <DialogOverlay {...overlayProps} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // L3 overlay: .glass-overlay + 24px dialog blur, rounded-shell,
          // {spacing.2xl} padding; 150ms fade + 2% scale (reduced motion:
          // the global fallback collapses it to an instant cut).
          "glass-overlay glass-overlay-dialog fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] sm:max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-shell p-6 text-sm text-popover-foreground outline-none will-change-transform data-[starting-style]:animate-in data-[starting-style]:fade-in-0 data-[starting-style]:zoom-in-98 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-98 animation-duration-150",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">{t("common.close")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-6 -mb-6 flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="glass" />}>
          {t("common.close")}
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-snug font-semibold",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("overflow-y-auto max-h-[60vh] px-1", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
