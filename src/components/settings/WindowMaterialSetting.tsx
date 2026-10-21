import { useId } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { formatBackendError } from "@/lib/backendError";
import { useWindowMaterialStore } from "@/stores/windowMaterialStore";

/**
 * Window material switch (Mica / off). Minimal control only; the Appearance
 * page layout is owned by the settings migration task.
 */
export function WindowMaterialSetting() {
  const { t } = useTranslation();
  const preference = useWindowMaterialStore((state) => state.preference);
  const material = useWindowMaterialStore((state) => state.state);
  const isSaving = useWindowMaterialStore((state) => state.isSaving);
  const setPreference = useWindowMaterialStore((state) => state.setPreference);
  const descriptionId = useId();

  const unsupported = material !== null && !material.supported;
  const unavailableReason =
    material?.reason === "unsupportedOs" ||
    material?.reason === "unsupportedPlatform" ||
    material?.reason === "applyFailed"
      ? material.reason
      : null;
  const checked = !unsupported && preference === "mica";

  async function handleChange(next: boolean) {
    try {
      await setPreference(next ? "mica" : "off");
    } catch (error) {
      toast.error(t("settings.appearance.windowMaterialSaveFailed"), {
        description: formatBackendError(error, t),
      });
    }
  }

  return (
    <div
      className="flex items-start justify-between gap-4"
      data-testid="window-material-setting"
    >
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-medium text-foreground">
          {t("settings.appearance.windowMaterial")}
        </div>
        <p id={descriptionId} className="text-pretty text-xs text-muted-foreground">
          {unavailableReason
            ? t(`settings.appearance.windowMaterialUnavailable.${unavailableReason}`)
            : t("settings.appearance.windowMaterialDesc")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {checked
            ? t("settings.appearance.windowMaterialOn")
            : t("settings.appearance.windowMaterialOff")}
        </span>
        <Switch
          checked={checked}
          disabled={unsupported || isSaving}
          onCheckedChange={(next) => void handleChange(next)}
          aria-label={t("settings.appearance.windowMaterialToggle")}
          aria-describedby={descriptionId}
        />
      </div>
    </div>
  );
}
