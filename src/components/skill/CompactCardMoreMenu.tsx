import { MoreHorizontal, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/menu";

interface CompactCardMoreMenuProps {
  skillName: string;
  isLoading: boolean;
  onDeleteFromCentral: () => void;
}

export function CompactCardMoreMenu({
  skillName,
  isLoading,
  onDeleteFromCentral,
}: CompactCardMoreMenuProps) {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            disabled={isLoading}
            aria-label={t("common.skillCardMoreActions")}
            title={t("common.skillCardMoreActions")}
            data-testid={`skill-card-more-${skillName}`}
            className="focus-ring relative inline-flex size-8 items-center justify-center rounded-control text-muted-foreground transition-[scale,background-color,color] duration-150 after:absolute after:top-1/2 after:left-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-accent hover:text-foreground active:not-disabled:scale-[0.96] disabled:cursor-default disabled:opacity-50"
          >
            <MoreHorizontal className="size-4" />
          </button>
        }
      />
      <MenuContent align="end" sideOffset={4}>
        <MenuItem
          variant="destructive"
          onClick={onDeleteFromCentral}
          data-testid={`delete-central-skill-${skillName}`}
        >
          <Trash2 className="size-3.5" />
          {t("central.deleteSkill")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
