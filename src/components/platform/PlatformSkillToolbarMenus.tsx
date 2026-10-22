import { ArrowUpDown, Check, SlidersHorizontal } from "lucide-react";
import type { TFunction } from "i18next";

import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type {
  PlatformGroupBy,
  PlatformSortDirection,
  PlatformSortField,
} from "@/lib/platformSkillViewModel";

/** 当前选中项：浅底 + 尾部对勾（对勾承担“已选”语义，不只靠颜色）。 */
const ACTIVE_ITEM_CLASS = "bg-accent text-foreground";

export function PlatformSkillSortMenu({
  t,
  sortField,
  sortDirection,
  sortFieldOptions,
  sortDirectionOptions,
  onChange,
}: {
  t: TFunction;
  sortField: PlatformSortField;
  sortDirection: PlatformSortDirection;
  sortFieldOptions: Array<{ value: PlatformSortField; label: string }>;
  sortDirectionOptions: Array<{ value: PlatformSortDirection; label: string }>;
  onChange: (next: {
    field: PlatformSortField;
    direction: PlatformSortDirection;
  }) => void;
}) {
  const fieldLabel =
    sortFieldOptions.find((option) => option.value === sortField)?.label ?? sortField;
  const directionLabel =
    sortDirectionOptions.find((option) => option.value === sortDirection)?.label ??
    sortDirection;

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="glass"
            size="sm"
            className="h-8 shrink-0 md:h-8"
            data-testid="platform-toolbar-sort"
            aria-label={t("platform.toolbarSortAriaLabel")}
            title={t("platform.toolbarSortCurrent", {
              field: fieldLabel,
              direction: directionLabel,
            })}
          >
            <ArrowUpDown className="size-3.5" />
            <span className="hidden text-xs sm:inline">{fieldLabel}</span>
            <span aria-hidden className="text-ui-micro text-muted-foreground">
              {sortDirection === "asc" ? "↑" : "↓"}
            </span>
          </Button>
        }
      />
      <MenuContent align="end" className="min-w-52">
        {sortFieldOptions.flatMap((field) =>
          sortDirectionOptions.map((direction) => {
            const active =
              field.value === sortField && direction.value === sortDirection;
            return (
              <MenuItem
                key={`${field.value}-${direction.value}`}
                data-testid={`platform-toolbar-sort-${field.value}-${direction.value}`}
                onClick={() =>
                  onChange({ field: field.value, direction: direction.value })
                }
                className={cn(active && ACTIVE_ITEM_CLASS)}
              >
                <span>{field.label}</span>
                <span className="ml-auto text-ui-meta text-muted-foreground">
                  {direction.label}
                </span>
                {active && <Check className="size-3.5 text-primary-text" aria-hidden />}
              </MenuItem>
            );
          }),
        )}
      </MenuContent>
    </Menu>
  );
}

export function PlatformSkillViewMenu({
  t,
  groupBy,
  groupByOptions,
  onChangeGroupBy,
}: {
  t: TFunction;
  groupBy: PlatformGroupBy;
  groupByOptions: Array<{ value: PlatformGroupBy; label: string }>;
  onChangeGroupBy: (value: PlatformGroupBy) => void;
}) {
  const hasActiveGroup = groupBy !== "none";

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="glass"
            size="sm"
            className="h-8 shrink-0 md:h-8"
            data-testid="platform-toolbar-view"
            aria-label={t("platform.toolbarViewAriaLabel")}
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden text-xs sm:inline">{t("platform.toolbarView")}</span>
            {hasActiveGroup && (
              <span
                data-testid="platform-toolbar-view-dot"
                aria-label={t("platform.toolbarViewBadgeActive")}
                className="size-1.5 rounded-full bg-primary"
              />
            )}
          </Button>
        }
      />
      <MenuContent align="end" className="min-w-52">
        <MenuGroup>
          <MenuGroupLabel>{t("platform.toolbarViewSectionGroup")}</MenuGroupLabel>
          {groupByOptions.map((option) => {
            const active = option.value === groupBy;
            return (
              <MenuItem
                key={option.value}
                data-testid={`platform-toolbar-view-group-${option.value}`}
                onClick={() => onChangeGroupBy(option.value)}
                className={cn(active && ACTIVE_ITEM_CLASS)}
              >
                <span>{option.label}</span>
                {active && (
                  <Check className="ml-auto size-3.5 text-primary-text" aria-hidden />
                )}
              </MenuItem>
            );
          })}
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}
