import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { UpdateCenterTab } from "@/stores/updateCenterStore";
import type {
  SkillRefreshMode,
  SkillRefreshScopeKind,
} from "@/types/skillUpdateInventory";

interface UpdateCenterToolbarProps {
  scopeKind: SkillRefreshScopeKind;
  onScopeKindChange: (next: SkillRefreshScopeKind) => void;
  refreshMode: SkillRefreshMode;
  onRefreshModeChange: (next: SkillRefreshMode) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  lastRefreshedAt: string | null;
  activeTab: UpdateCenterTab;
  onTabChange: (tab: UpdateCenterTab) => void;
  tabOrder: readonly UpdateCenterTab[];
  counts: Record<UpdateCenterTab, number>;
  scopeEnabled: Record<SkillRefreshScopeKind, boolean>;
}

export function UpdateCenterToolbar({
  scopeKind,
  onScopeKindChange,
  refreshMode,
  onRefreshModeChange,
  isRefreshing,
  onRefresh,
  lastRefreshedAt,
  activeTab,
  onTabChange,
  tabOrder,
  counts,
  scopeEnabled,
}: UpdateCenterToolbarProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          id="update-center-scope"
          ariaLabel={t("central.updateCenter.scopeLabel")}
          className="h-7 w-auto px-2"
          value={scopeKind}
          disabled={isRefreshing}
          onValueChange={(next) =>
            onScopeKindChange(next as SkillRefreshScopeKind)
          }
          options={[
            {
              value: "all",
              label: t("central.updateCenter.scopeAll"),
              disabled: !scopeEnabled.all,
            },
            {
              value: "repositories",
              label: t("central.updateCenter.scopeRepository"),
              disabled: !scopeEnabled.repositories,
            },
            {
              value: "platform",
              label: t("central.updateCenter.scopePlatform"),
              disabled: !scopeEnabled.platform,
            },
            {
              value: "skills",
              label: t("central.updateCenter.scopeCurrent"),
              disabled: !scopeEnabled.skills,
            },
          ]}
        />
        <Select
          id="update-center-refresh-mode"
          ariaLabel={t("central.updateCenter.modeLabel")}
          className="h-7 w-auto px-2"
          value={refreshMode}
          disabled={isRefreshing}
          onValueChange={(next) =>
            onRefreshModeChange(next as SkillRefreshMode)
          }
          options={[
            { value: "regular", label: t("central.updateCenter.modeRegular") },
            { value: "sync", label: t("central.updateCenter.modeSync") },
          ]}
        />
        <Button size="sm" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {t("central.updateCenter.refreshing")}
            </>
          ) : (
            <>
              <RefreshCw className="size-3.5" />
              {t("central.updateCenter.refreshButton")}
            </>
          )}
        </Button>
        {lastRefreshedAt ? (
          <span className="text-xs text-muted-foreground">
            {t("central.updateCenter.lastRefreshedAt", {
              time: new Date(lastRefreshedAt).toLocaleString(),
            })}
          </span>
        ) : null}
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border">
        {tabOrder.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => onTabChange(tab)}
            className={
              activeTab === tab
                ? "rounded-t-lg bg-primary-tint px-3 py-2 text-sm font-medium text-primary-text"
                : "rounded-t-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            }
          >
            {t(`central.updateCenter.tabs.${tab}`, { count: counts[tab] })}
          </button>
        ))}
      </div>
    </>
  );
}
