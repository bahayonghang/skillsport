import { useTranslation } from "react-i18next";

export function OrphansTabPanel() {
  const { t } = useTranslation();
  return (
    <p className="rounded-inner border border-dashed border-input p-4 text-sm text-muted-foreground">
      {t("central.updateCenter.orphansComingSoon")}
    </p>
  );
}
