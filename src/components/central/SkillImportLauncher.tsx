import { useCallback } from "react";
import { GitBranch, PackagePlus, FolderArchive } from "lucide-react";
import type { TFunction } from "i18next";

import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

export type SkillImportIntent = "github" | "local_zip";

export interface SkillImportLauncherProps {
  t: TFunction;
  /** True when the active target is SSH/WSL — ZIP intent is disabled. */
  isRemoteTarget: boolean;
  /** Fired when the user picks an import source. */
  onOpenIntent: (intent: SkillImportIntent) => void;
}

/**
 * Unified "Add Skill" entry point.
 *
 * Replaces the single GitHub-import button in the Central header with a
 * compact dropdown that routes to either the GitHub wizard (existing flow)
 * or the local ZIP wizard (new flow). The launcher never opens a modal
 * inside another modal; it only fires `onOpenIntent` so the parent can
 * mount the right wizard.
 *
 * The launcher is also the single entry point future deep-link prefill
 * will target.
 */
export function SkillImportLauncher({
  t,
  isRemoteTarget,
  onOpenIntent,
}: SkillImportLauncherProps) {
  const handleSelect = useCallback(
    (intent: SkillImportIntent) => {
      onOpenIntent(intent);
    },
    [onOpenIntent],
  );

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button variant="glass" data-testid="central-add-skill-launcher">
            <PackagePlus className="size-3.5" />
            {t("central.addSkillLauncher.label")}
          </Button>
        }
      />
      <MenuContent
        align="end"
        data-testid="central-add-skill-launcher-menu"
        className="min-w-60"
      >
        <MenuItem
          data-testid="central-add-skill-github"
          onClick={() => handleSelect("github")}
          className="items-start"
        >
          <GitBranch className="mt-0.5 size-3.5 shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t("central.addSkillLauncher.github")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("central.addSkillLauncher.githubDesc")}
            </span>
          </div>
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          data-testid="central-add-skill-local-zip"
          onClick={() => handleSelect("local_zip")}
          disabled={isRemoteTarget}
          className="items-start"
        >
          <FolderArchive className="mt-0.5 size-3.5 shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {t("central.addSkillLauncher.localZip")}
            </span>
            <span className="text-xs text-muted-foreground">
              {isRemoteTarget
                ? t("central.addSkillLauncher.localZipRemoteDisabled")
                : t("central.addSkillLauncher.localZipDesc")}
            </span>
          </div>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
