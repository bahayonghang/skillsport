import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  isSidebarProjectSort,
  type SidebarProjectSort,
} from "@/lib/sidebarWorkspacePrefs";
import { cn } from "@/lib/utils";

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
          <select
            aria-label={t("sidebar.projectSortLabel")}
            value={sort.value}
            onChange={(event) => {
              const next = event.target.value;
              if (isSidebarProjectSort(next)) {
                sort.onChange(next);
              }
            }}
            className={cn(
              "h-10 max-w-28 shrink-0 rounded-md border border-border bg-transparent px-1.5 text-xs text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            )}
          >
            <option value="name">{t("sidebar.projectSortName")}</option>
            <option value="skillCount">{t("sidebar.projectSortSkillCount")}</option>
            <option value="recent">{t("sidebar.projectSortRecent")}</option>
          </select>
        ) : null}
      </div>
      {open ? children : null}
    </div>
  );
}
