import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type { SkillsCliLinkTargetSummary } from "@/pages/skillsCliBatchModel";

export interface SkillsCliBatchBarProps {
  selectedCount: number;
  summaries: readonly SkillsCliLinkTargetSummary[];
  unlinkEnabled: boolean;
  busy: boolean;
  exporting: boolean;
  linkMenuOpen: boolean;
  onLinkMenuOpenChange: (open: boolean) => void;
  unlinkMenuOpen: boolean;
  onUnlinkMenuOpenChange: (open: boolean) => void;
  onLink: (agentId: string) => void;
  onUnlink: () => void;
  onUnlinkPlatform: (agentId: string) => void;
  onUpdate: () => void;
  onExportSelected: () => void;
  onUninstall: () => void;
  onClear: () => void;
  mutationLockReason?: string;
  updateLockReason?: string;
}

export const ICON_HIT =
  "relative size-8 after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

// Two-line menu rows (platform name + counts); the glass popup, item radius,
// highlight and disabled styling come from ui/menu.
const MENU_ITEM_CLASS = "flex-col items-start gap-0.5";

export function SkillsCliBatchBar({
  selectedCount,
  summaries,
  unlinkEnabled,
  busy,
  exporting,
  linkMenuOpen,
  onLinkMenuOpenChange,
  unlinkMenuOpen,
  onUnlinkMenuOpenChange,
  onLink,
  onUnlink,
  onUnlinkPlatform,
  onUpdate,
  onExportSelected,
  onUninstall,
  onClear,
  mutationLockReason,
  updateLockReason,
}: SkillsCliBatchBarProps) {
  const { t } = useTranslation();
  if (selectedCount <= 0) {
    return null;
  }
  const placementLocked = busy || Boolean(mutationLockReason);
  const updateLocked = busy || Boolean(updateLockReason);
  const anyLinkable = summaries.some((item) => item.linkableCount > 0);

  return (
    <div
      role="region"
      aria-label={t("skillsCli.batch.barAria")}
      aria-busy={busy || exporting}
      data-testid="skills-cli-batch-bar"
      className="glass-panel mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-card px-4 py-2"
    >
      <p className="text-sm font-medium tabular-nums">
        {t("skillsCli.batch.selectedCount", { count: selectedCount })}
      </p>
      <Button
        type="button"
        variant="glass"
        className="min-h-10"
        disabled={updateLocked}
        title={updateLockReason}
        onClick={onUpdate}
        aria-label={t("skillsCli.batch.updateAria")}
        data-testid="skills-cli-batch-update"
      >
        {t("skillsCli.batch.update")}
      </Button>
      <Menu
        open={linkMenuOpen}
        onOpenChange={onLinkMenuOpenChange}
      >
        <MenuTrigger
          disabled={placementLocked || !anyLinkable}
          render={
            <Button
              type="button"
              variant="glass"
              className="min-h-10"
              title={mutationLockReason}
              aria-label={t("skillsCli.batch.linkMenuAria")}
              data-testid="skills-cli-batch-link"
            />
          }
        >
          {t("skillsCli.batch.linkToPlatform")}
        </MenuTrigger>
        <MenuContent align="start" sideOffset={4} className="min-w-64">
              {summaries.map((summary) => {
                const disabled = summary.linkableCount === 0 || placementLocked;
                return (
                  <MenuItem
                    key={summary.agentId}
                    disabled={disabled}
                    label={t("skillsCli.batch.linkTargetAria", {
                      name: summary.displayName,
                      linkable: summary.linkableCount,
                      managed: summary.managedCount,
                      copies: summary.directCopyCount,
                      blocked: summary.blockedCount,
                    })}
                    onClick={() => onLink(summary.agentId)}
                    data-testid={`skills-cli-batch-link-${summary.agentId}`}
                    className={MENU_ITEM_CLASS}
                  >
                    <span>{summary.displayName}</span>
                    <span className="text-ui-meta text-muted-foreground">
                      {t("skillsCli.batch.linkable", {
                        count: summary.linkableCount,
                      })}
                      {" · "}
                      {t("skillsCli.batch.managed", {
                        count: summary.managedCount,
                      })}
                      {" · "}
                      {t("skillsCli.batch.directCopy", {
                        count: summary.directCopyCount,
                      })}
                      {" · "}
                      {t("skillsCli.batch.blocked", {
                        count: summary.blockedCount,
                      })}
                    </span>
                  </MenuItem>
                );
              })}
        </MenuContent>
      </Menu>
      <Menu
        open={unlinkMenuOpen}
        onOpenChange={onUnlinkMenuOpenChange}
      >
        <MenuTrigger
          disabled={placementLocked || !unlinkEnabled}
          render={
            <Button
              type="button"
              variant="glass"
              className="min-h-10"
              title={mutationLockReason}
              aria-label={t("skillsCli.batch.unlinkMenuAria")}
              data-testid="skills-cli-batch-unlink"
            />
          }
        >
          {t("skillsCli.batch.unlink")}
        </MenuTrigger>
        <MenuContent align="start" sideOffset={4} className="min-w-64">
              {summaries.map((summary) => {
                const disabled = summary.managedCount === 0 || placementLocked;
                return (
                  <MenuItem
                    key={summary.agentId}
                    disabled={disabled}
                    label={t("skillsCli.batch.unlinkTargetAria", {
                      name: summary.displayName,
                      managed: summary.managedCount,
                      copies: summary.directCopyCount,
                      blocked: summary.blockedCount,
                    })}
                    onClick={() => onUnlinkPlatform(summary.agentId)}
                    data-testid={`skills-cli-batch-unlink-${summary.agentId}`}
                    className={MENU_ITEM_CLASS}
                  >
                    <span>{summary.displayName}</span>
                    <span className="text-ui-meta text-muted-foreground">
                      {t("skillsCli.batch.managed", {
                        count: summary.managedCount,
                      })}
                      {" · "}
                      {t("skillsCli.batch.directCopy", {
                        count: summary.directCopyCount,
                      })}
                      {" · "}
                      {t("skillsCli.batch.blocked", {
                        count: summary.blockedCount,
                      })}
                    </span>
                  </MenuItem>
                );
              })}
              <MenuSeparator />
              <MenuItem
                disabled={placementLocked || !unlinkEnabled}
                label={t("skillsCli.batch.unlinkAllAria")}
                onClick={onUnlink}
                data-testid="skills-cli-batch-unlink-all"
                className={MENU_ITEM_CLASS}
              >
                {t("skillsCli.batch.unlinkAll")}
              </MenuItem>
        </MenuContent>
      </Menu>
      <Button
        type="button"
        variant="glass"
        className="min-h-10"
        disabled={busy || exporting || selectedCount === 0}
        onClick={onExportSelected}
      >
        {t("skillsCli.batch.exportSelected")}
      </Button>
      <Button
        type="button"
        variant="destructive"
        className="min-h-10"
        disabled={placementLocked}
        title={mutationLockReason}
        onClick={onUninstall}
      >
        {t("skillsCli.batch.uninstall")}
      </Button>
      <button
        type="button"
        className={cn(
          ICON_HIT,
          "focus-ring ml-auto rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        )}
        onClick={onClear}
        aria-label={t("skillsCli.batch.clear")}
      >
        <X className="mx-auto size-4" />
      </button>
    </div>
  );
}
