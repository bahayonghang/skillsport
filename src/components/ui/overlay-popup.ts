// DESIGN.md "其余 primitives": Menu, Select, and the font picker share one
// L3 popup. Real blur stays in the `.glass-overlay` class, not a utility.

export const GLASS_OVERLAY_POPUP_CLASS =
  "glass-overlay min-w-44 rounded-card p-1.5 text-sm text-popover-foreground outline-none origin-(--transform-origin) data-[starting-style]:animate-in data-[starting-style]:fade-in-0 data-[starting-style]:zoom-in-95 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95 animation-duration-100"

export const GLASS_OVERLAY_POPUP_SCROLL_CLASS =
  "max-h-(--available-height) overflow-y-auto"

export const GLASS_OVERLAY_ITEM_CLASS =
  "relative flex cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

export const GLASS_SELECT_TRIGGER_CLASS =
  "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-control border border-input bg-input-surface px-3 text-left text-sm text-foreground transition-[color,background-color,border-color] duration-150 outline-none hover:border-muted-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ring"
