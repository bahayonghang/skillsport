import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// DESIGN.md "其余 primitives" → Menu / dropdown: L3 `.glass-overlay` (real
// blur, one of the two whitelisted blocks) + `rounded-card`; items are
// `rounded-control` so 18px popup − 6px padding = 12px item (concentric).
// Thin wrapper over base-ui Menu: behaviour, focus management, typeahead and
// keyboard navigation stay with base-ui.

function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />
}

function MenuSubmenu(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot {...props} />
}

function MenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />
}

function MenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />
}

function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

const POPUP_CLASS =
  "glass-overlay min-w-44 rounded-card p-1.5 text-sm text-popover-foreground outline-none max-h-(--available-height) overflow-y-auto origin-(--transform-origin) data-[starting-style]:animate-in data-[starting-style]:fade-in-0 data-[starting-style]:zoom-in-95 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95 animation-duration-100"

interface MenuContentProps extends MenuPrimitive.Popup.Props {
  align?: MenuPrimitive.Positioner.Props["align"]
  side?: MenuPrimitive.Positioner.Props["side"]
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"]
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"]
  positionerClassName?: string
}

function MenuContent({
  align = "start",
  side = "bottom",
  sideOffset = 6,
  alignOffset,
  positionerClassName,
  className,
  ...props
}: MenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className={cn("z-50 outline-none", positionerClassName)}
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(POPUP_CLASS, className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

const ITEM_CLASS =
  "relative flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

interface MenuItemProps extends MenuPrimitive.Item.Props {
  variant?: "default" | "destructive"
}

function MenuItem({ className, variant = "default", ...props }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      data-variant={variant}
      className={cn(
        ITEM_CLASS,
        variant === "destructive" &&
          "text-destructive-text data-[highlighted]:bg-destructive-tint data-[highlighted]:text-destructive-text",
        className
      )}
      {...props}
    />
  )
}

function MenuCheckboxItem({
  className,
  children,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      className={cn(ITEM_CLASS, "pr-8", className)}
      {...props}
    >
      {children}
      <MenuPrimitive.CheckboxItemIndicator className="absolute right-2.5 inline-flex items-center text-primary-text">
        <CheckIcon />
      </MenuPrimitive.CheckboxItemIndicator>
    </MenuPrimitive.CheckboxItem>
  )
}

function MenuRadioItem({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      className={cn(ITEM_CLASS, "pr-8", className)}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator className="absolute right-2.5 inline-flex items-center text-primary-text">
        <CheckIcon />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  )
}

function MenuSubmenuTrigger({
  className,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-submenu-trigger"
      className={cn(ITEM_CLASS, "data-[popup-open]:bg-accent", className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto text-muted-foreground" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function MenuGroupLabel({
  className,
  ...props
}: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-group-label"
      className={cn(
        "px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
      {...props}
    />
  )
}

function MenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menu-shortcut"
      className={cn(
        "ml-auto font-mono text-ui-meta text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuTrigger,
}
