import { Download, X } from "lucide-react";
import type { TFunction } from "i18next";

import { Button } from "@/components/ui/button";
import {
  getPlatformTargetLabel,
  getPlatformTargetTitleHint,
  type PlatformTarget,
} from "@/lib/platformTargetGroups";
import {
  getInstalledFilterPlatformId,
  platformInstalledFilterValue,
  type InstalledSkillsFilterValue,
} from "@/lib/centralInstalledFilters";
import { cn } from "@/lib/utils";

export interface CentralInstalledSkillsQuickFilterProps {
  availableInstallAgents: readonly PlatformTarget[];
  filteredCount: number;
  installedCount: number;
  selectedCount: number;
  value: InstalledSkillsFilterValue;
  onChange: (value: InstalledSkillsFilterValue) => void;
  onClear: () => void;
  onInstallSelected: () => void;
  onSelectFiltered: () => void;
  t: TFunction;
}

function getPlatformDisplayName(agent: PlatformTarget, t: TFunction): string {
  return getPlatformTargetLabel(agent, t, "full");
}

export function CentralInstalledSkillsQuickFilter({
  availableInstallAgents,
  filteredCount,
  installedCount,
  selectedCount,
  value,
  onChange,
  onClear,
  onInstallSelected,
  onSelectFiltered,
  t,
}: CentralInstalledSkillsQuickFilterProps) {
  const selectedPlatformId = getInstalledFilterPlatformId(value);
  const hasFilter = value !== "all";
  const platformOptions = availableInstallAgents.filter(
    (agent) => agent.id !== "central",
  );

  return (
    <div
      className="glass-panel flex flex-wrap items-center gap-2 rounded-card px-3 py-2"
      data-testid="central-installed-skills-filter"
    >
      <span className="text-xs font-medium text-muted-foreground">
        {t("central.installedSkillsFilterLabel")}
      </span>
      <Button
        type="button"
        variant={value === "installed" ? "default" : "outline"}
        size="sm"
        className="h-7"
        onClick={() => onChange(value === "installed" ? "all" : "installed")}
        data-testid="installed-filter-any"
      >
        {t("central.installedSkillsFilterAny", { count: installedCount })}
      </Button>
      <select
        aria-label={t("central.installedSkillsFilterPlatformAria")}
        className={cn(
          "focus-ring h-7 rounded-control border border-input bg-input-surface px-2 text-xs text-foreground outline-none transition-colors",
          selectedPlatformId
            ? "border-primary-stroke bg-primary-tint text-primary-text"
            : null,
        )}
        value={selectedPlatformId ?? ""}
        onChange={(event) => {
          const nextPlatformId = event.target.value;
          onChange(
            nextPlatformId
              ? platformInstalledFilterValue(nextPlatformId)
              : "all",
          );
        }}
        data-testid="installed-filter-platform"
      >
        <option value="">
          {t("central.installedSkillsFilterPlatformPlaceholder")}
        </option>
        {platformOptions.map((agent) => {
          const displayName = getPlatformDisplayName(agent, t);
          return (
            <option
              key={agent.id}
              value={agent.id}
              title={getPlatformTargetTitleHint(agent)}
            >
              {displayName}
            </option>
          );
        })}
      </select>
      {hasFilter && (
        <>
          <span className="rounded-full bg-accent px-2.5 py-1 text-ui-meta text-muted-foreground">
            {t("central.installedSkillsFilterResult", { count: filteredCount })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={onSelectFiltered}
            disabled={filteredCount === 0}
            data-testid="installed-filter-select-results"
          >
            {t("central.installedSkillsFilterSelectResults", {
              count: filteredCount,
            })}
          </Button>
        </>
      )}
      {selectedCount > 0 && (
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-7"
          onClick={onInstallSelected}
          disabled={selectedCount === 0}
          data-testid="installed-filter-install-selected"
        >
          <Download className="size-3.5" />
          {t("central.installedSkillsFilterInstallSelected", {
            count: selectedCount,
          })}
        </Button>
      )}
      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={onClear}
          data-testid="installed-filter-clear"
        >
          <X className="size-3.5" />
          {t("central.installedSkillsFilterClear")}
        </Button>
      )}
    </div>
  );
}
