import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  GLASS_OVERLAY_ITEM_CLASS,
  GLASS_OVERLAY_POPUP_CLASS,
  GLASS_SELECT_TRIGGER_CLASS,
} from "@/components/ui/overlay-popup"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  title?: string
}

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  ariaLabel: string
  disabled?: boolean
  id?: string
  testId?: string
  className?: string
  defaultOpen?: boolean
  onTriggerClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
}

function Select({
  value,
  onValueChange,
  options,
  ariaLabel,
  disabled = false,
  id,
  testId,
  className,
  defaultOpen = false,
  onTriggerClick,
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      items={options}
      value={value}
      defaultOpen={defaultOpen}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next)
      }}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        data-slot="select-trigger"
        data-testid={testId}
        data-value={value}
        aria-label={ariaLabel}
        onClick={onTriggerClick}
        className={cn(GLASS_SELECT_TRIGGER_CLASS, className)}
      >
        <SelectPrimitive.Value className="min-w-0 flex-1 truncate text-left" />
        <SelectPrimitive.Icon className="text-muted-foreground">
          <ChevronDownIcon aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          align="start"
          sideOffset={6}
          className="z-50 outline-none"
        >
          <SelectPrimitive.Popup
            data-slot="select-popup"
            className={cn(
              GLASS_OVERLAY_POPUP_CLASS,
              "w-max min-w-(--anchor-width) max-w-[min(24rem,var(--available-width))]",
            )}
          >
            <SelectPrimitive.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain outline-none">
              {options.map((option, index) => (
                <SelectPrimitive.Item
                  key={`${option.value}:${index}`}
                  value={option.value}
                  disabled={option.disabled}
                  title={option.title}
                  className={cn(GLASS_OVERLAY_ITEM_CLASS, "pr-8")}
                >
                  <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
                    {option.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2.5 inline-flex items-center text-primary-text">
                    <CheckIcon aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { Select }
