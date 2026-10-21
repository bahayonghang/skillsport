import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { CustomPlatformsSettingsSection } from "@/components/settings/CustomPlatformsSettingsSection";
import { PlatformDialog } from "@/components/settings/PlatformDialog";
import { PlatformVisibilitySettingsSection } from "@/components/settings/PlatformVisibilitySettingsSection";
import {
  getNormalizedPlatformVisibilityQuery,
  getPlatformVisibilityGroups,
} from "@/pages/settingsViewModel";
import { createPlatformManagementActions } from "@/pages/platformManagementActions";
import type { PlatformCategoryVisibility } from "@/lib/platformVisibility";
import type { AgentWithStatus } from "@/types";

interface CentralPlatformManageDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentWithStatus[];
  categoryVisibility: PlatformCategoryVisibility;
  addCustomAgent: (config: {
    display_name: string;
    global_skills_dir: string;
    category: string;
  }) => Promise<unknown>;
  updateCustomAgent: (
    agentId: string,
    config: {
      display_name: string;
      global_skills_dir: string;
      category: string;
    },
  ) => Promise<unknown>;
  removeCustomAgent: (agentId: string) => Promise<void>;
  setCategoryVisibility: (
    category: "coding" | "lobster",
    visible: boolean,
  ) => Promise<void>;
  setAgentEnabled: (agentId: string, enabled: boolean) => Promise<void>;
  refreshAfterPlatformChange: () => Promise<void>;
}

const DEFAULT_PLATFORM_CATEGORIES: PlatformCategoryVisibility = {
  coding: true,
  lobster: true,
};

export function CentralPlatformManageDrawer({
  open,
  onOpenChange,
  agents,
  categoryVisibility,
  addCustomAgent,
  updateCustomAgent,
  removeCustomAgent,
  setCategoryVisibility,
  setAgentEnabled,
  refreshAfterPlatformChange,
}: CentralPlatformManageDrawerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [isPlatformDialogOpen, setIsPlatformDialogOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] =
    useState<AgentWithStatus | null>(null);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [removingAgent, setRemovingAgent] = useState<string | null>(null);
  const normalizedQuery = useMemo(
    () => getNormalizedPlatformVisibilityQuery(query),
    [query],
  );
  const safeCategoryVisibility =
    categoryVisibility ?? DEFAULT_PLATFORM_CATEGORIES;
  const groups = useMemo(
    () =>
      getPlatformVisibilityGroups({
        agents,
        categoryVisibility: safeCategoryVisibility,
        normalizedQuery,
        t,
      }),
    [agents, normalizedQuery, safeCategoryVisibility, t],
  );
  const customAgents = useMemo(
    () => agents.filter((agent) => !agent.is_builtin),
    [agents],
  );
  const titleId = "central-platform-manage-title";

  const {
    handleOpenAddPlatform,
    handleOpenEditPlatform,
    handleAddPlatform,
    handleEditPlatform,
    handleRemovePlatform,
    handleToggleCategory,
    handleTogglePlatformVisibility,
  } = createPlatformManagementActions({
    t,
    editingPlatform,
    addCustomAgent,
    updateCustomAgent,
    removeCustomAgent,
    refreshAfterPlatformChange,
    setCategoryVisibility,
    setAgentEnabled,
    setEditingPlatform,
    setPlatformError,
    setIsPlatformDialogOpen,
    setRemovingAgent,
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          aria-labelledby={titleId}
          className="w-[min(760px,calc(100vw-1rem))]"
        >
          <SheetHeader>
            <SheetTitle id={titleId}>{t("central.platformManageTitle")}</SheetTitle>
            <SheetDescription>{t("central.platformManageDesc")}</SheetDescription>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("settings.platformSearchPlaceholder")}
                className="h-9 rounded-full pl-9"
              />
            </div>
          </SheetHeader>

          <SheetBody>
            <div className="space-y-4">
              <PlatformVisibilitySettingsSection
                groups={groups}
                isSearchActive={normalizedQuery.length > 0}
                normalizedQuery={normalizedQuery}
                query={query}
                onQueryChange={setQuery}
                onToggleCategory={(category, visible) => {
                  void handleToggleCategory(category, visible);
                }}
                onTogglePlatform={(agentId, enabled) => {
                  void handleTogglePlatformVisibility(agentId, enabled);
                }}
              />
              <CustomPlatformsSettingsSection
                customAgents={customAgents}
                platformError={platformError}
                removingAgent={removingAgent}
                onAddPlatform={handleOpenAddPlatform}
                onEditPlatform={handleOpenEditPlatform}
                onRemovePlatform={(agentId) => {
                  void handleRemovePlatform(agentId);
                }}
              />
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <PlatformDialog
        open={isPlatformDialogOpen}
        onOpenChange={setIsPlatformDialogOpen}
        platform={editingPlatform}
        onAdd={handleAddPlatform}
        onEdit={handleEditPlatform}
      />
    </>
  );
}
