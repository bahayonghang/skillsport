import type { ReactNode } from "react";
import { ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
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
          className="focus-ring flex min-h-10 min-w-0 flex-1 items-center gap-1.5 rounded-full px-2 text-left text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground"
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
            <Menu modal={false}>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("sidebar.projectSortLabel")}
                    title={t("sidebar.projectSortCurrent", {
                      sort: sortOptions.find((option) => option.value === sort.value)?.label,
                    })}
                    className="relative text-muted-foreground hover:bg-sidebar-accent hover:text-foreground after:absolute after:left-1/2 after:top-1/2 after:size-10 after:min-h-[40px] after:min-w-[40px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
                  >
                    <ArrowUpDown className="size-4" aria-hidden="true" />
                  </Button>
                }
              />
              <MenuContent
                align="end"
                aria-label={t("sidebar.projectSortLabel")}
                className="min-w-40"
              >
                <MenuRadioGroup
                  value={sort.value}
                  onValueChange={(next) => {
                    if (isSidebarProjectSort(next)) sort.onChange(next);
                  }}
                >
                  {sortOptions.map((option) => (
                    <MenuRadioItem
                      key={option.value}
                      value={option.value}
                      closeOnClick
                      className="min-h-9"
                    >
                      {option.label}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
          </div>
        ) : null}
      </div>
      {open ? children : null}
    </div>
  );
}
