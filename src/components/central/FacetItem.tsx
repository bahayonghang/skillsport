import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Sidebar 通用 facet 项。可单选 / 多选（由 caller 控制 active 状态）。
 *
 * 设计：
 * - 左侧 16px 图标槽位
 * - 主标签 truncate
 * - 右侧 count 单元（tabular-nums，固定宽）
 * - active 状态使用 primary 配色
 * - disabled 状态降低不透明度并禁用点击
 */
export interface FacetItemProps {
  label: string;
  active: boolean;
  count?: number;
  icon?: ReactNode;
  /** 折叠层级，0 = 顶层，1 = owner 下面的 repo 等。 */
  indentLevel?: 0 | 1;
  disabled?: boolean;
  description?: string;
  testId?: string;
  className?: string;
  "data-pinned"?: boolean;
  onClick: () => void;
  /** 常驻显示的右侧角标（如「可更新数」），在 count 之前渲染。 */
  badge?: ReactNode;
  /** Hover 时显示的右侧操作（如 delete）。 */
  trailingAction?: ReactNode;
}

export function FacetItem({
  label,
  active,
  count,
  icon,
  indentLevel = 0,
  disabled = false,
  description,
  testId,
  className,
  "data-pinned": dataPinned,
  onClick,
  badge,
  trailingAction,
}: FacetItemProps) {
  return (
    <div
      className={cn(
        "group relative flex min-h-9 w-full items-center gap-2 rounded-full border px-2.5 py-1 text-left text-xs transition-[background-color,border-color,color] has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-ring has-[button:focus-visible]:outline-solid",
        indentLevel === 1 && "ml-3",
        "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        // caller 装饰（如 pinned 行）覆盖静止态，active 永远胜出
        className,
        active && "border-primary-stroke bg-primary-tint text-primary-text hover:bg-primary-tint hover:text-primary-text",
        disabled && "pointer-events-none opacity-50",
      )}
      data-pinned={dataPinned}
    >
      <button
        type="button"
        data-testid={testId}
        data-active={active}
        onClick={onClick}
        title={description}
        aria-pressed={active}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-2 text-left outline-none"
      >
        {icon ? (
          <span
            className={cn(
              "grid size-4 shrink-0 place-items-center",
              active ? "text-primary-text" : "text-muted-foreground",
            )}
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-pretty font-medium">{label}</span>
      </button>
      {badge}
      {typeof count === "number" && (
        <Badge
          tone={active ? "primary" : "neutral"}
          size="sm"
          className="tabular-nums"
        >
          {count}
        </Badge>
      )}
      {trailingAction}
    </div>
  );
}
