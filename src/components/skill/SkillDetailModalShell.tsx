import { type ReactNode, type RefObject, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SkillDetailModalShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  titleId?: string;
  children?: ReactNode;

  /** 可选：自定义弹窗最大宽度，CSS 长度值。默认 "1200px" */
  maxWidth?: string;
  /** 可选：自定义弹窗最大高度，CSS 长度值。默认 "800px" */
  maxHeight?: string;

  /** 可选：头部右侧额外操作区域（如 Install 按钮） */
  headerActions?: ReactNode;
}

export function SkillDetailModalShell({
  open,
  onOpenChange,
  returnFocusRef,
  titleId,
  children,
  maxWidth,
  maxHeight,
  headerActions,
}: SkillDetailModalShellProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (open) {
      return;
    }
    const el = returnFocusRef?.current ?? document.body;
    el?.focus?.();
  }, [open, returnFocusRef]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayProps={{ "data-testid": "skill-detail-modal-overlay" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={children ? titleId : undefined}
        data-testid="skill-detail-modal"
        className={cn(
          // L3 overlay shell（DialogContent = .glass-overlay + rounded-shell）；
          // 这里只覆盖布局与尺寸：无内距、纵向 flex、内容区自管滚动。
          "flex flex-col gap-0 overflow-hidden p-0",
          "w-[min(90vw,var(--modal-max-w))] max-w-none min-w-[360px] sm:max-w-none",
          "h-[min(85vh,var(--modal-max-h))] min-h-[400px]",
          // 响应式宽度覆盖
          "lg:w-[min(70vw,var(--modal-max-w))]",
          "sm:max-lg:w-[85vw]",
          "max-sm:h-[90vh] max-sm:w-[95vw]",
        )}
        style={
          {
            "--modal-max-w": maxWidth ?? "1200px",
            "--modal-max-h": maxHeight ?? "800px",
          } as React.CSSProperties
        }
      >
        {/* 头部栏 */}
        <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-border px-3">
          {headerActions}
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.close")}
              />
            }
          >
            <XIcon />
          </DialogClose>
        </div>
        {/* 内容区 */}
        <div className="min-h-0 flex-1 overflow-hidden">{children ?? null}</div>
      </DialogContent>
    </Dialog>
  );
}
