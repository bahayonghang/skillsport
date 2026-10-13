import type { ReactNode } from "react";
import { ArrowUpDown, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  isSidebarProjectSort,
  type SidebarProjectSort,
} from "@/lib/sidebarWorkspacePrefs";

interface SidebarSectionProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  sort?: {
    value: SidebarProjectSort;
    onChange: (value: SidebarProjectSort) => void;
  };
}

export function SidebarSection({
  label,
  open,
  onToggle,
  children,
  sort,
}: SidebarSectionProps) {
  const { t } = useTranslation();
  const sortOptions = [
    { value: "name", label: t("sidebar.projectSortName") },
    { value: "skillCount", label: t("sidebar.projectSortSkillCount") },
    { value: "recent", label: t("sidebar.projectSortRecent") },
  ];

  return (
    <div className="pt-1">
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={
            open
              ? t("sidebar.collapseSection", { name: label })
              : t("sidebar.expandSection", { name: label })
          }
          className="flex min-h-10 min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{label}</span>
        </button>
        {open && sort ? (
          <div className="flex size-10 min-h-[40px] min-w-[40px] shrink-0 items-center justify-center">
            <Menu.Root modal={false}>
              <Menu.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("sidebar.projectSortLabel")}
                    title={t("sidebar.projectSortCurrent", {
                      sort: sortOptions.find((option) => option.value === sort.value)?.label,
                    })}
                    className="relative text-muted-foreground focus-visible:ring-sidebar-ring after:absolute after:left-1/2 after:top-1/2 after:size-10 after:min-h-[40px] after:min-w-[40px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
                  >
                    <ArrowUpDown className="size-4" aria-hidden="true" />
                  </Button>
                }
              />
              <Menu.Portal>
                <Menu.Positioner align="end" sideOffset={6} className="z-50 outline-none">
                  <Menu.Popup
                    aria-label={t("sidebar.projectSortLabel")}
                    className="min-w-40 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg outline-none"
                  >
                    <Menu.RadioGroup
                      value={sort.value}
                      onValueChange={(next) => {
                        if (isSidebarProjectSort(next)) sort.onChange(next);
                      }}
                    >
                      {sortOptions.map((option) => (
                        <Menu.RadioItem
                          key={option.value}
                          value={option.value}
                          closeOnClick
                          className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                        >
                          <span>{option.label}</span>
                          <Menu.RadioItemIndicator className="ml-auto inline-flex">
                            <Check className="size-3.5" aria-hidden="true" />
                          </Menu.RadioItemIndicator>
                        </Menu.RadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        ) : null}
      </div>
      {open ? children : null}
    </div>
  );
}
