import type { TFunction } from "i18next";

import {
  CentralSkillCategorizePanel,
  type CentralSkillCategorizePanelProps,
} from "@/components/central/CentralSkillCategorizePanel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * CategorizeDrawer：右侧抽屉装载 CentralSkillCategorizePanel 内容。
 * - 仅在 open=true 时挂载（DialogPortal keepMounted=false）。
 * - 标题区由抽屉自己拼，PaneltClient 只关心三段内容。
 */
export interface CategorizeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: TFunction;
  /** 透传给内部 Categorize 面板。 */
  panelProps: Omit<CentralSkillCategorizePanelProps, "t">;
}

export function CategorizeDrawer({
  open,
  onOpenChange,
  t,
  panelProps,
}: CategorizeDrawerProps) {
  const titleId = "central-categorize-drawer-title";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="central-categorize-drawer"
        aria-labelledby={titleId}
      >
        <SheetHeader>
          <SheetTitle id={titleId}>{t("central.categorizePanelTitle")}</SheetTitle>
          <SheetDescription>{t("central.categorizePanelDesc")}</SheetDescription>
        </SheetHeader>
        <CentralSkillCategorizePanel {...panelProps} t={t} />
      </SheetContent>
    </Sheet>
  );
}
