import { useTranslation } from "react-i18next";

import type { ProviderHealth } from "@/types/usage";
import { UsageFilterButton } from "@/components/usage/UsageFilterControls";
import { cn } from "@/lib/utils";

interface PlatformFilterBarProps {
  providers: ProviderHealth[];
  selected: string | null;
  onSelect: (source: string | null) => void;
  className?: string;
}

/**
 * 平台筛选条 —— 顶部紧凑 segmented options：「全部平台」+ 全部 provider。
 *
 * 固定列出全部 provider（不过滤），顺序沿用数组顺序与 ProviderHealthList 对齐。
 * 无数据 provider（callCount === 0）灰显 + 禁用，让支持的工具集一目了然，
 * stub provider 永远灰显。选中态用 source = provider.displayName 驱动整页作用域。
 */
export function PlatformFilterBar({
  providers,
  selected,
  onSelect,
  className,
}: PlatformFilterBarProps) {
  const { t } = useTranslation();

  return (
    <div
      data-testid="platform-filter-bar"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <PlatformPill
        testId="platform-pill-all"
        label={t("skillUsage.platformFilter.all")}
        active={selected === null}
        onClick={() => onSelect(null)}
      />
      {providers.map((p) => {
        const disabled = p.callCount === 0;
        return (
          <PlatformPill
            key={p.providerId}
            testId={`platform-pill-${p.providerId}`}
            label={p.displayName}
            active={selected === p.displayName}
            disabled={disabled}
            title={disabled ? t("skillUsage.notDetected") : undefined}
            onClick={() => onSelect(p.displayName)}
          />
        );
      })}
    </div>
  );
}

interface PlatformPillProps {
  testId: string;
  label: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

function PlatformPill({
  testId,
  label,
  active,
  disabled = false,
  title,
  onClick,
}: PlatformPillProps) {
  return (
    <UsageFilterButton
      data-testid={testId}
      data-active={active}
      pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={!active ? "border-border" : undefined}
    >
      {label}
    </UsageFilterButton>
  );
}
