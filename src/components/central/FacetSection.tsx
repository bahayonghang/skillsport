import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSidebarExpansionSignal } from "@/components/central/useSidebarExpansionSignal";

/**
 * Sidebar 中可折叠的分组容器。
 *
 * - 默认展开；点击 header 切换折叠状态
 * - header 右侧可显示 count 徽章
 * - 提供 sticky 头部，长 facet 列表滚动时仍能看到 section 名
 */
export interface FacetSectionProps {
  title: string;
  icon?: ReactNode;
  count?: number;
  defaultExpanded?: boolean;
  rightSlot?: ReactNode;
  children: ReactNode;
  /** 测试 / data-* 标识。 */
  testId?: string;
}

export function FacetSection({
  title,
  icon,
  count,
  defaultExpanded = true,
  rightSlot,
  children,
  testId,
}: FacetSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const expansionSignal = useSidebarExpansionSignal();
  const expansionToken = expansionSignal?.token;
  const forcedExpanded = expansionSignal?.expanded;
  const Caret = expanded ? ChevronDown : ChevronRight;

  useEffect(() => {
    if (forcedExpanded === undefined) return;
    setExpanded(forcedExpanded);
  }, [forcedExpanded, expansionToken]);

  return (
    <section data-testid={testId}>
      <div className="glass-sticky sticky top-0 z-10 -mx-3 flex items-center gap-1.5 border-b border-border px-4 py-1.5 text-xs font-medium text-muted-foreground">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="focus-ring flex min-h-8 flex-1 items-center gap-1.5 rounded-control text-left transition-[color,background-color] hover:text-foreground"
          aria-expanded={expanded}
        >
          <Caret className="size-3 shrink-0" />
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
          <span className="truncate">{title}</span>
          {typeof count === "number" && (
            <Badge size="sm" className="ml-auto tabular-nums">
              {count}
            </Badge>
          )}
        </button>
        {rightSlot}
      </div>
      <div
        data-testid={testId ? `${testId}-content` : undefined}
        className={cn(
          "space-y-1 pt-2 transition-[max-height,opacity] duration-150",
          !expanded && "hidden"
        )}
      >
        {children}
      </div>
    </section>
  );
}
