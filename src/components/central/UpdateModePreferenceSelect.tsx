import { useTranslation } from "react-i18next";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { UpdateCheckMode } from "@/lib/updateCheckMode";

interface UpdateModePreferenceSelectProps {
  mode: UpdateCheckMode;
  disabled: boolean;
  syncDisabled: boolean;
  syncDisabledReason: string;
  onChange: (mode: UpdateCheckMode) => void;
}

export function UpdateModePreferenceSelect({
  mode,
  disabled,
  syncDisabled,
  syncDisabledReason,
  onChange,
}: UpdateModePreferenceSelectProps) {
  const { t } = useTranslation();
  const title = syncDisabled ? syncDisabledReason : t("central.updateCheckMode.inlineHint");

  return (
    <label
      className={cn(
        "inline-flex h-8 min-w-0 shrink-0 items-center gap-2 rounded-full border border-glass-stroke bg-popover pr-1 pl-3 text-xs text-muted-foreground ring-1 ring-glass-hairline",
        disabled && "opacity-50",
      )}
      title={title}
    >
      <span className="whitespace-nowrap font-medium">
        {t("central.updateCheckMode.inlineLabel")}
      </span>
      <Select
        testId="central-update-check-mode-select"
        ariaLabel={t("central.updateCheckMode.inlineLabel")}
        className="h-6 min-w-0 flex-1 rounded-full px-2 text-xs font-medium"
        value={mode}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === "sync" && syncDisabled) return;
          onChange(next as UpdateCheckMode);
        }}
        options={[
          { value: "regular", label: t("central.updateCheckMode.regular.title") },
          {
            value: "sync",
            label: t("central.updateCheckMode.sync.title"),
            disabled: syncDisabled,
          },
        ]}
      />
    </label>
  );
}
