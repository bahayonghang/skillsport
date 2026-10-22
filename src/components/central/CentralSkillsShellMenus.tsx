import {
  ActivityIcon,
  ArrowUpDown,
  Check,
  FileJson,
  LayoutGrid,
  List,
  MoreHorizontal,
  Rows3,
  Rows4,
  SlidersHorizontal,
} from "lucide-react";
import type { TFunction } from "i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import type { CentralInstalledSkillsQuickFilterProps } from "@/components/central/CentralInstalledSkillsQuickFilter";
import type { CentralViewState, GroupByMode } from "@/lib/centralViewState";
import {
  getInstalledFilterPlatformId,
  platformInstalledFilterValue,
} from "@/lib/centralInstalledFilters";
import {
  getPlatformTargetLabel,
  getPlatformTargetTitleHint,
  type PlatformTarget,
} from "@/lib/platformTargetGroups";
import { cn } from "@/lib/utils";
import type {
  CentralSortDirection,
  CentralSortField,
} from "@/pages/centralSkillsViewModel";

type InstalledSkillsFilterProps = Omit<CentralInstalledSkillsQuickFilterProps, "t">;

/** 当前选中项：浅底 + 尾部对勾（对勾承担“已选”语义，不只靠颜色）。 */
const ACTIVE_ITEM_CLASS = "bg-accent text-foreground";

function ActiveCheck({ active }: { active: boolean }) {
  return active ? <Check className="ml-auto size-3.5 text-primary-text" aria-hidden /> : null;
}

export function ToolbarMoreMenu({
  t,
  activeTaskCount,
  onOpenTaskCenter,
  onOpenPlatformManage,
  onOpenPortability,
}: {
  t: TFunction;
  activeTaskCount: number;
  onOpenTaskCenter: () => void;
  onOpenPlatformManage: () => void;
  onOpenPortability: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="glass"
            size="icon"
            aria-label={t("central.toolbarMoreAriaLabel")}
            data-testid="central-toolbar-more"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <MenuContent align="end" data-testid="central-toolbar-more-menu" className="min-w-52">
        <MenuItem data-testid="central-toolbar-task-center" onClick={onOpenTaskCenter}>
          <ActivityIcon className="size-3.5 shrink-0" />
          <span>{t("central.taskCenterMenuItem")}</span>
          {activeTaskCount > 0 && (
            <Badge
              tone="primary"
              size="sm"
              data-testid="central-toolbar-task-center-badge"
              className="ml-auto tabular-nums"
            >
              {activeTaskCount}
            </Badge>
          )}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={onOpenPlatformManage}>
          {t("central.platformManageButton")}
        </MenuItem>
        <MenuItem data-testid="central-portability-open" onClick={onOpenPortability}>
          <FileJson className="size-3.5 shrink-0" />
          {t("central.portabilityOpen")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

// ─── 排序菜单 ──────────────────────────────────────────────────────

export function ToolbarSortMenu({
  t,
  sortField,
  sortDir,
  sortFieldOptions,
  sortDirectionOptions,
  onChange,
}: {
  t: TFunction;
  sortField: CentralSortField;
  sortDir: CentralSortDirection;
  sortFieldOptions: Array<{ value: CentralSortField; label: string }>;
  sortDirectionOptions: Array<{ value: CentralSortDirection; label: string }>;
  onChange: (next: { field: CentralSortField; dir: CentralSortDirection }) => void;
}) {
  const currentField = sortFieldOptions.find((o) => o.value === sortField);
  const currentDir = sortDirectionOptions.find((o) => o.value === sortDir);
  const currentFieldLabel = currentField?.label ?? sortField;
  const currentDirLabel = currentDir?.label ?? sortDir;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="glass"
            size="sm"
            className="h-8 shrink-0 md:h-8"
            data-testid="central-toolbar-sort"
            aria-label={t("central.toolbarSortAriaLabel")}
            title={t("central.toolbarSortCurrent", {
              field: currentFieldLabel,
              direction: currentDirLabel,
            })}
          >
            <ArrowUpDown className="size-3.5" />
            <span className="text-xs">{currentFieldLabel}</span>
            <span aria-hidden className="text-ui-micro text-muted-foreground">
              {sortDir === "asc" ? "↑" : "↓"}
            </span>
          </Button>
        }
      />
      <MenuContent align="end" className="min-w-52">
        {sortFieldOptions.flatMap((field) =>
          sortDirectionOptions.map((dir) => {
            const active = field.value === sortField && dir.value === sortDir;
            return (
              <MenuItem
                key={`${field.value}-${dir.value}`}
                data-testid={`central-toolbar-sort-${field.value}-${dir.value}`}
                onClick={() => onChange({ field: field.value, dir: dir.value })}
                className={cn(active && ACTIVE_ITEM_CLASS)}
              >
                <span>{field.label}</span>
                <span className="ml-auto text-ui-meta text-muted-foreground">{dir.label}</span>
                {active && <Check className="size-3.5 text-primary-text" aria-hidden />}
              </MenuItem>
            );
          }),
        )}
      </MenuContent>
    </Menu>
  );
}

// ─── 视图菜单 ──────────────────────────────────────────────────────

export function ToolbarViewMenu({
  t,
  viewState,
  setViewState,
  groupByOptions,
  installedSkillsFilter,
}: {
  t: TFunction;
  viewState: CentralViewState;
  setViewState: (next: CentralViewState) => void;
  groupByOptions?: Array<{ value: GroupByMode; label: string }>;
  installedSkillsFilter: InstalledSkillsFilterProps;
}) {
  const hasGroupOptions = (groupByOptions?.length ?? 0) > 1;
  const installedValue = installedSkillsFilter.value;
  const installedPlatformId = getInstalledFilterPlatformId(installedValue);
  const installedCount = installedSkillsFilter.installedCount;
  const uncategorizedActive = viewState.tags.includes("uncategorized");
  const hasActiveModifiers =
    viewState.group !== "none" ||
    installedValue !== "all" ||
    uncategorizedActive ||
    viewState.view !== "grid" ||
    viewState.density !== "comfortable";
  const platformOptions = (installedSkillsFilter.availableInstallAgents ?? []).filter(
    (agent) => agent.id !== "central",
  );

  const handleSelectGroup = (group: GroupByMode) => {
    setViewState({ ...viewState, group });
  };
  const handleSelectLayout = (view: "grid" | "list") => {
    setViewState({ ...viewState, view });
  };
  const handleSelectDensity = (density: "comfortable" | "compact") => {
    setViewState({ ...viewState, density });
  };
  const handleToggleUncategorized = () => {
    const next = uncategorizedActive
      ? viewState.tags.filter((id) => id !== "uncategorized")
      : [...viewState.tags, "uncategorized"];
    setViewState({ ...viewState, tags: next });
  };
  const handleInstalledAll = () => installedSkillsFilter.onChange("all");
  const handleInstalledAny = () => installedSkillsFilter.onChange("installed");
  const handleInstalledPlatform = (agentId: string) =>
    installedSkillsFilter.onChange(platformInstalledFilterValue(agentId));

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="glass"
            size="sm"
            className="h-8 shrink-0 md:h-8"
            data-testid="central-toolbar-view"
            aria-label={t("central.toolbarViewAriaLabel")}
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="text-xs">{t("central.toolbarView")}</span>
            {hasActiveModifiers && (
              <span
                data-testid="central-toolbar-view-dot"
                aria-label={t("central.toolbarViewBadgeActive")}
                className="size-1.5 rounded-full bg-primary"
              />
            )}
          </Button>
        }
      />
      <MenuContent align="end" className="min-w-60">
        <MenuGroup>
          <MenuGroupLabel>
            {t("central.toolbarViewSectionLayout", { defaultValue: "布局" })}
          </MenuGroupLabel>
          <MenuItem
            data-testid="central-toolbar-view-layout-grid"
            onClick={() => handleSelectLayout("grid")}
            className={cn(viewState.view === "grid" && ACTIVE_ITEM_CLASS)}
          >
            <LayoutGrid className="size-3.5 shrink-0" />
            <span>
              {t("central.toolbarViewLayoutGrid", { defaultValue: "网格（双列）" })}
            </span>
            <ActiveCheck active={viewState.view === "grid"} />
          </MenuItem>
          <MenuItem
            data-testid="central-toolbar-view-layout-list"
            onClick={() => handleSelectLayout("list")}
            className={cn(viewState.view === "list" && ACTIVE_ITEM_CLASS)}
          >
            <List className="size-3.5 shrink-0" />
            <span>
              {t("central.toolbarViewLayoutList", { defaultValue: "列表（单列）" })}
            </span>
            <ActiveCheck active={viewState.view === "list"} />
          </MenuItem>
        </MenuGroup>

        <MenuSeparator />

        <MenuGroup>
          <MenuGroupLabel>
            {t("central.toolbarViewSectionDensity", { defaultValue: "密度" })}
          </MenuGroupLabel>
          <MenuItem
            data-testid="central-toolbar-view-density-comfortable"
            onClick={() => handleSelectDensity("comfortable")}
            className={cn(viewState.density === "comfortable" && ACTIVE_ITEM_CLASS)}
          >
            <Rows3 className="size-3.5 shrink-0" />
            <span>
              {t("central.toolbarViewDensityComfortable", { defaultValue: "宽松" })}
            </span>
            <ActiveCheck active={viewState.density === "comfortable"} />
          </MenuItem>
          <MenuItem
            data-testid="central-toolbar-view-density-compact"
            onClick={() => handleSelectDensity("compact")}
            className={cn(viewState.density === "compact" && ACTIVE_ITEM_CLASS)}
          >
            <Rows4 className="size-3.5 shrink-0" />
            <span>
              {t("central.toolbarViewDensityCompact", { defaultValue: "紧凑" })}
            </span>
            <ActiveCheck active={viewState.density === "compact"} />
          </MenuItem>
        </MenuGroup>

        <MenuSeparator />

        {hasGroupOptions && groupByOptions && (
          <MenuGroup>
            <MenuGroupLabel>{t("central.toolbarViewSectionGroup")}</MenuGroupLabel>
            {groupByOptions.map((opt) => {
              const active = viewState.group === opt.value;
              return (
                <MenuItem
                  key={opt.value}
                  data-testid={`central-toolbar-view-group-${opt.value}`}
                  onClick={() => handleSelectGroup(opt.value)}
                  className={cn(active && ACTIVE_ITEM_CLASS)}
                >
                  <span>{opt.label}</span>
                  <ActiveCheck active={active} />
                </MenuItem>
              );
            })}
          </MenuGroup>
        )}

        {hasGroupOptions && <MenuSeparator />}

        <MenuGroup>
          <MenuGroupLabel>{t("central.toolbarViewSectionInstalled")}</MenuGroupLabel>
          <MenuItem
            data-testid="central-toolbar-view-installed-all"
            onClick={handleInstalledAll}
            className={cn(installedValue === "all" && ACTIVE_ITEM_CLASS)}
          >
            <span>{t("central.toolbarViewInstalledAll")}</span>
            <ActiveCheck active={installedValue === "all"} />
          </MenuItem>
          <MenuItem
            data-testid="central-toolbar-view-installed-any"
            onClick={handleInstalledAny}
            className={cn(installedValue === "installed" && ACTIVE_ITEM_CLASS)}
          >
            <span>{t("central.toolbarViewInstalledAny", { count: installedCount })}</span>
            <ActiveCheck active={installedValue === "installed"} />
          </MenuItem>
          {platformOptions.length > 0 && (
            <MenuSubmenu>
              <MenuSubmenuTrigger
                data-testid="central-toolbar-view-installed-platform-trigger"
                className={cn(Boolean(installedPlatformId) && ACTIVE_ITEM_CLASS)}
              >
                <span>{t("central.toolbarViewInstalledPlatform")}</span>
              </MenuSubmenuTrigger>
              <MenuContent align="start" side="right" sideOffset={4} className="max-h-72 min-w-56">
                {platformOptions.map((agent) => {
                  const active = installedPlatformId === agent.id;
                  const displayName = resolvePlatformDisplay(agent, t);
                  const title = resolvePlatformTitle(agent, t);
                  return (
                    <MenuItem
                      key={agent.id}
                      data-testid={`central-toolbar-view-installed-platform-${agent.id}`}
                      title={title}
                      onClick={() => handleInstalledPlatform(agent.id)}
                      className={cn(active && ACTIVE_ITEM_CLASS)}
                    >
                      <span>{displayName}</span>
                      <ActiveCheck active={active} />
                    </MenuItem>
                  );
                })}
              </MenuContent>
            </MenuSubmenu>
          )}
        </MenuGroup>

        <MenuSeparator />

        <MenuGroup>
          <MenuGroupLabel>{t("central.toolbarViewSectionQuickFilters")}</MenuGroupLabel>
          <MenuCheckboxItem
            checked={uncategorizedActive}
            onCheckedChange={() => handleToggleUncategorized()}
            data-testid="central-toolbar-view-uncategorized"
          >
            <span>{t("central.toolbarViewUncategorizedOnly")}</span>
          </MenuCheckboxItem>
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}

function resolvePlatformDisplay(agent: PlatformTarget, t: TFunction): string {
  return getPlatformTargetLabel(agent, t, "full");
}

function resolvePlatformTitle(agent: PlatformTarget, t: TFunction): string {
  return getPlatformTargetTitleHint(agent) || resolvePlatformDisplay(agent, t);
}
