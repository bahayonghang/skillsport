import { useTranslation } from "react-i18next"
import { Toaster as SonnerToaster, type ToasterProps } from "sonner"

import { fontThemeModeForFlavor, useThemeStore } from "@/stores/themeStore"

// DESIGN.md "其余 primitives" → Toaster: every toast is an L3 `.glass-overlay`
// (real blur from that whitelisted block only) with `rounded-card`. sonner's
// palette variables, the per-status 12% tint wash and status icon colours are
// mapped onto the glass tokens in `src/index.css` ("Toaster" section) because
// sonner injects unlayered attribute-selector styles at runtime. `richColors`
// is intentionally off: it would paint saturated fills over the glass.

function Toaster({
  position = "bottom-right",
  toastOptions,
  ...props
}: ToasterProps) {
  const { t } = useTranslation()
  const flavor = useThemeStore((state) => state.flavor)

  return (
    <SonnerToaster
      position={position}
      theme={fontThemeModeForFlavor(flavor)}
      containerAriaLabel={t("ui.notifications")}
      toastOptions={{
        closeButtonAriaLabel: t("ui.closeNotification"),
        ...toastOptions,
        classNames: {
          toast: "glass-overlay",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
