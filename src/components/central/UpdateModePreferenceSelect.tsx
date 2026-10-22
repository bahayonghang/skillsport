import { useTranslation } from "react-i18next";

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
      <select
        data-testid="central-update-check-mode-select"
        className="focus-ring h-6 min-w-0 flex-1 rounded-full border border-input bg-input-surface px-2 text-xs font-medium text-foreground outline-none"
        value={mode}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value as UpdateCheckMode;
          if (next === "sync" && syncDisabled) {
            return;
          }
          onChange(next);
        }}
      >
        <option value="regular">
          {t("central.updateCheckMode.regular.title")}
        </option>
        <option value="sync" disabled={syncDisabled}>
          {t("central.updateCheckMode.sync.title")}
        </option>
      </select>
    </label>
  );
}
