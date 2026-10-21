import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  SETTINGS_PAGES,
  getSettingsPagePath,
  type SettingsPageId,
} from "@/components/settings/settingsPages";
import { cn } from "@/lib/utils";

interface SettingsSideNavProps {
  activePageId: SettingsPageId;
}

// Settings secondary navigation. Desktop: a floating glass panel (L2,
// `glass-panel rounded-card`) beside the content column; narrow windows: a
// horizontally scrolling pill row. Items share the main sidebar's activation
// language (DESIGN.md nav-item-active): mint tint + 1px mint stroke + mint
// text, `aria-current="page"`, no fill / glow / edge bar.
export function SettingsSideNav({ activePageId }: SettingsSideNavProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <nav
      aria-label={t("settings.pages.navAriaLabel")}
      className="shrink-0 px-4 pt-4 sm:px-6 lg:w-64 lg:py-6 lg:pr-0 lg:pl-6"
    >
      <div className="glass-panel scrollbar-subtle flex gap-1 overflow-x-auto rounded-card p-1.5 lg:sticky lg:top-0 lg:block lg:space-y-1 lg:overflow-visible lg:p-2">
        {SETTINGS_PAGES.map((page) => {
          const active = page.id === activePageId;
          const Icon = page.icon;

          return (
            <button
              key={page.id}
              type="button"
              aria-current={active ? "page" : undefined}
              data-settings-page-nav={page.id}
              onClick={() => navigate(getSettingsPagePath(page.id))}
              className={cn(
                "focus-ring group flex h-9 shrink-0 items-center gap-2.5 rounded-full border px-3 text-left text-sm transition-[scale,background-color,color,border-color] duration-150 active:scale-[0.96] motion-reduce:active:scale-100 lg:w-full",
                active
                  ? "tint-primary border-primary-stroke font-semibold text-primary-text"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t(page.titleKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
