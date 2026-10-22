import type { ReactNode } from "react";

import { useTextTruncation } from "@/hooks/useTextTruncation";
import { cn } from "@/lib/utils";

export function CardActionButton({
  onClick,
  disabled,
  title,
  ariaLabel,
  icon,
  testId,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  ariaLabel: string;
  icon: ReactNode;
  testId?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        "focus-ring relative inline-flex size-8 items-center justify-center rounded-control text-muted-foreground transition-[scale,background-color,color] duration-150 active:not-disabled:scale-[0.96] disabled:cursor-default disabled:opacity-50",
        "after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
        danger
          ? "hover:bg-destructive-tint hover:text-destructive-text"
          : "hover:bg-accent hover:text-primary-text",
      )}
    >
      {icon}
    </button>
  );
}

export function SkillCardSummary({
  text,
  label,
  lineClamp = 2,
}: {
  text: string;
  label?: string;
  lineClamp?: 2 | 3;
}) {
  const { ref, isTruncated } = useTextTruncation<HTMLParagraphElement>(text);
  return (
    <div className="relative">
      <p
        ref={ref}
        data-truncated={isTruncated ? "true" : "false"}
        title={text}
        className={cn(
          "text-pretty break-words text-sm leading-relaxed text-muted-foreground",
          lineClamp === 3 ? "line-clamp-3" : "line-clamp-2",
        )}
      >
        {label && (
          <span className="mr-1.5 inline-flex align-baseline rounded-pill bg-primary-tint px-2 py-0.5 text-xs font-medium leading-none text-primary-text">
            {label}
          </span>
        )}
        {text}
      </p>
      {/* 不再叠 from-card 渐隐：L2 玻璃面板是半透明的，实色渐变会在描述末行
          画出一块不同底色的矩形；line-clamp 的省略号已足以表达截断。 */}
    </div>
  );
}
