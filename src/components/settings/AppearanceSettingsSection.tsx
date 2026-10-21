import { Globe2, Palette, SlidersHorizontal, Type, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WindowMaterialSetting } from "@/components/settings/WindowMaterialSetting";
import {
  BODY_FONT_OPTIONS,
  CHINESE_FALLBACK_OPTIONS,
  DEFAULT_THEMED_FONT_PREFERENCES,
  DISPLAY_FONT_OPTIONS,
  FONT_SCALE_OPTIONS,
  loadThemedFontPreferences,
  resolveBodyFontFamily,
  resolveDisplayFontFamily,
  saveBodyChineseFallback,
  saveBodyFont,
  saveDisplayChineseFallback,
  saveDisplayFont,
  saveFontScale,
  type BodyFontKey,
  type ChineseFallbackKey,
  type DisplayFontKey,
  type FontProfile,
  type ThemedFontPreferences,
} from "@/lib/displayFont";
import { cn } from "@/lib/utils";
import {
  fontThemeModeForFlavor,
  THEME_FLAVORS,
  type FontThemeMode,
  type ThemeFlavor,
} from "@/stores/themeStore";

interface AppearanceSettingsSectionProps {
  flavor: ThemeFlavor;
  onSetFlavor: (flavor: ThemeFlavor) => void;
}

interface FontOption {
  key: string;
  labelKey: string;
}

export function AppearanceSettingsSection({
  flavor,
  onSetFlavor,
}: AppearanceSettingsSectionProps) {
  const { t, i18n } = useTranslation();
  const activeFontMode = fontThemeModeForFlavor(flavor);
  const [editorFontMode, setEditorFontMode] =
    useState<FontThemeMode>(activeFontMode);
  const [prefs, setPrefs] = useState<ThemedFontPreferences>(
    DEFAULT_THEMED_FONT_PREFERENCES,
  );
  const currentLanguage = getCurrentLanguage(i18n.language);
  const profile = prefs[editorFontMode];

  useEffect(() => {
    let cancelled = false;
    void loadThemedFontPreferences().then((loaded) => {
      if (cancelled) return;
      setPrefs((current) =>
        themedFontPreferencesEqual(current, loaded) ? current : loaded,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDisplayKey(key: DisplayFontKey) {
    updateEditorProfile({ display: key });
    await saveDisplayFont(editorFontMode, key, profile.displayCustom);
  }

  async function handleDisplayCustom(custom: string) {
    updateEditorProfile({ displayCustom: custom });
    if (profile.display === "custom") {
      await saveDisplayFont(editorFontMode, "custom", custom);
    }
  }

  async function handleDisplayChineseFallback(key: ChineseFallbackKey) {
    updateEditorProfile({ displayChineseFallback: key });
    await saveDisplayChineseFallback(
      editorFontMode,
      key,
      profile.displayChineseFallbackCustom,
    );
  }

  async function handleDisplayChineseFallbackCustom(custom: string) {
    updateEditorProfile({ displayChineseFallbackCustom: custom });
    if (profile.displayChineseFallback === "custom") {
      await saveDisplayChineseFallback(
        editorFontMode,
        "custom",
        custom,
      );
    }
  }

  async function handleBodyKey(key: BodyFontKey) {
    updateEditorProfile({ body: key });
    await saveBodyFont(editorFontMode, key, profile.bodyCustom);
  }

  async function handleBodyCustom(custom: string) {
    updateEditorProfile({ bodyCustom: custom });
    if (profile.body === "custom") {
      await saveBodyFont(editorFontMode, "custom", custom);
    }
  }

  async function handleBodyChineseFallback(key: ChineseFallbackKey) {
    updateEditorProfile({ bodyChineseFallback: key });
    await saveBodyChineseFallback(
      editorFontMode,
      key,
      profile.bodyChineseFallbackCustom,
    );
  }

  async function handleBodyChineseFallbackCustom(custom: string) {
    updateEditorProfile({ bodyChineseFallbackCustom: custom });
    if (profile.bodyChineseFallback === "custom") {
      await saveBodyChineseFallback(
        editorFontMode,
        "custom",
        custom,
      );
    }
  }

  async function handleScale(value: number) {
    setPrefs((current) => ({ ...current, scale: value }));
    await saveFontScale(value);
  }

  function updateEditorProfile(patch: Partial<FontProfile>) {
    setPrefs((current) => ({
      ...current,
      [editorFontMode]: {
        ...current[editorFontMode],
        ...patch,
      },
    }));
  }

  return (
    <div
      className="divide-y divide-border/70 border-y border-border/70"
      data-settings-section="appearance"
    >
      <SettingGroup
        icon={Palette}
        title={t("settings.appearance.themeGroup")}
        description={t("settings.appearance.themeGroupDesc")}
      >
        <ControlField label={t("settings.appearance.themeMode")}>
          <SegmentedControl
            options={THEME_FLAVORS.map((item) => ({
              value: item,
              label: t(`settings.appearance.themeOption.${item}`),
            }))}
            value={flavor}
            onChange={(value) => onSetFlavor(value as ThemeFlavor)}
          />
        </ControlField>
        <div className="mt-5">
          <WindowMaterialSetting />
        </div>
      </SettingGroup>

      <SettingGroup
        icon={Globe2}
        title={t("settings.appearance.languageGroup")}
        description={t("settings.appearance.languageGroupDesc")}
      >
        <SegmentedControl
          options={[
            { value: "zh", label: t("settings.chinese") },
            { value: "en", label: t("settings.english") },
          ]}
          value={currentLanguage}
          onChange={(value) => void i18n.changeLanguage(value)}
        />
      </SettingGroup>

      <SettingGroup
        icon={Type}
        title={t("settings.appearance.typographyGroup")}
        description={t("settings.appearance.typographyGroupDesc")}
      >
        <div className="space-y-5">
          <ControlField label={t("settings.appearance.fontThemeMode") }>
            <SegmentedControl
              options={(["light", "dark"] as const).map((mode) => ({
                value: mode,
                label: `${t(`settings.appearance.fontTheme.${mode}`)}${
                  mode === activeFontMode
                    ? t("settings.appearance.fontThemeCurrentSuffix")
                    : ""
                }`,
              }))}
              value={editorFontMode}
              onChange={(value) =>
                setEditorFontMode(value as FontThemeMode)
              }
            />
          </ControlField>

          <div className="grid gap-5 divide-y divide-border/70 xl:grid-cols-2 xl:divide-x xl:divide-y-0 [&>*+*]:pt-5 xl:[&>*+*]:pt-0 xl:[&>*+*]:pl-5">
            <FontRoleControl
              groupLabel={t("settings.appearance.displayFontOptionsLabel")}
              title={t("settings.appearance.displayFont")}
              primary={profile.display}
              primaryOptions={DISPLAY_FONT_OPTIONS}
              primaryOptionNamespace="displayFontOption"
              primaryCustom={profile.displayCustom}
              primaryCustomLabel={t("settings.appearance.displayCustomLabel")}
              chineseFallback={profile.displayChineseFallback}
              chineseFallbackLabel={t(
                "settings.appearance.displayChineseFallback",
              )}
              chineseFallbackCustom={profile.displayChineseFallbackCustom}
              chineseFallbackCustomLabel={t(
                "settings.appearance.displayChineseFallbackCustomLabel",
              )}
              specimenFontFamily={resolveDisplayFontFamily(profile)}
              onPrimaryChange={(value) =>
                void handleDisplayKey(value as DisplayFontKey)
              }
              onPrimaryCustomChange={(value) => void handleDisplayCustom(value)}
              onChineseFallbackChange={(value) =>
                void handleDisplayChineseFallback(value)
              }
              onChineseFallbackCustomChange={(value) =>
                void handleDisplayChineseFallbackCustom(value)
              }
            />
            <FontRoleControl
              groupLabel={t("settings.appearance.bodyFontOptionsLabel")}
              title={t("settings.appearance.bodyFont")}
              primary={profile.body}
              primaryOptions={BODY_FONT_OPTIONS}
              primaryOptionNamespace="bodyFontOption"
              primaryCustom={profile.bodyCustom}
              primaryCustomLabel={t("settings.appearance.bodyCustomLabel")}
              chineseFallback={profile.bodyChineseFallback}
              chineseFallbackLabel={t(
                "settings.appearance.bodyChineseFallback",
              )}
              chineseFallbackCustom={profile.bodyChineseFallbackCustom}
              chineseFallbackCustomLabel={t(
                "settings.appearance.bodyChineseFallbackCustomLabel",
              )}
              specimenFontFamily={resolveBodyFontFamily(profile)}
              onPrimaryChange={(value) => void handleBodyKey(value as BodyFontKey)}
              onPrimaryCustomChange={(value) => void handleBodyCustom(value)}
              onChineseFallbackChange={(value) =>
                void handleBodyChineseFallback(value)
              }
              onChineseFallbackCustomChange={(value) =>
                void handleBodyChineseFallbackCustom(value)
              }
            />
          </div>
        </div>
      </SettingGroup>

      <SettingGroup
        icon={SlidersHorizontal}
        title={t("settings.appearance.densityGroup")}
        description={t("settings.appearance.densityGroupDesc")}
      >
        <div className="space-y-4">
          <SegmentedControl
            options={FONT_SCALE_OPTIONS.map((option) => ({
              value: String(option.value),
              label: t(`settings.appearance.${option.labelKey}`),
            }))}
            value={String(prefs.scale)}
            onChange={(value) => void handleScale(Number(value))}
          />
          <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg bg-muted/35 px-4 py-3 ring-1 ring-border/60">
            <span
              className="font-display text-base font-semibold tabular-nums"
            >
              {t("settings.appearance.scaleSpecimen")}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {Math.round(prefs.scale * 100)}%
            </span>
          </div>
        </div>
      </SettingGroup>
    </div>
  );
}

function SettingGroup({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 py-6 md:grid-cols-[minmax(10rem,12rem)_minmax(0,1fr)] md:gap-6">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-balance font-heading text-sm font-semibold leading-5">
            {title}
          </h2>
          <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ControlField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground">{label}</div>
      {children}
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex min-h-10 max-w-full flex-wrap gap-1 rounded-lg bg-muted/45 p-1">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-10 px-3",
              active
                ? "bg-background text-foreground shadow-sm hover:bg-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function FontRoleControl({
  groupLabel,
  title,
  primary,
  primaryOptions,
  primaryOptionNamespace,
  primaryCustom,
  primaryCustomLabel,
  chineseFallback,
  chineseFallbackLabel,
  chineseFallbackCustom,
  chineseFallbackCustomLabel,
  specimenFontFamily,
  onPrimaryChange,
  onPrimaryCustomChange,
  onChineseFallbackChange,
  onChineseFallbackCustomChange,
}: {
  groupLabel: string;
  title: string;
  primary: string;
  primaryOptions: readonly FontOption[];
  primaryOptionNamespace: "displayFontOption" | "bodyFontOption";
  primaryCustom: string;
  primaryCustomLabel: string;
  chineseFallback: ChineseFallbackKey;
  chineseFallbackLabel: string;
  chineseFallbackCustom: string;
  chineseFallbackCustomLabel: string;
  specimenFontFamily: string;
  onPrimaryChange: (value: string) => void;
  onPrimaryCustomChange: (value: string) => void;
  onChineseFallbackChange: (value: ChineseFallbackKey) => void;
  onChineseFallbackCustomChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid min-w-0 gap-4" role="group" aria-label={groupLabel}>
      <h3 className="font-heading text-sm font-semibold leading-5">{title}</h3>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">
              {t("settings.appearance.primaryFont")}
            </span>
            <select
              value={primary}
              onChange={(event) => onPrimaryChange(event.target.value)}
              aria-label={title}
              className="focus-ring h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              {primaryOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {t(
                    `settings.appearance.${primaryOptionNamespace}.${option.labelKey}`,
                  )}
                </option>
              ))}
            </select>
          </label>
          {primary === "custom" ? (
            <Input
              className="h-10"
              placeholder={t("settings.appearance.customPlaceholder")}
              value={primaryCustom}
              onChange={(event) => onPrimaryCustomChange(event.target.value)}
              aria-label={primaryCustomLabel}
            />
          ) : null}
        </div>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">
              {chineseFallbackLabel}
            </span>
            <select
              value={chineseFallback}
              onChange={(event) =>
                onChineseFallbackChange(
                  event.target.value as ChineseFallbackKey,
                )
              }
              aria-label={chineseFallbackLabel}
              className="focus-ring h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              {CHINESE_FALLBACK_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {t(
                    `settings.appearance.chineseFallbackOption.${option.labelKey}`,
                  )}
                </option>
              ))}
            </select>
          </label>
          {chineseFallback === "custom" ? (
            <Input
              className="h-10"
              placeholder={t("settings.appearance.customPlaceholder")}
              value={chineseFallbackCustom}
              onChange={(event) =>
                onChineseFallbackCustomChange(event.target.value)
              }
              aria-label={chineseFallbackCustomLabel}
            />
          ) : null}
        </div>
      </div>

      <div
        className="min-h-14 rounded-lg bg-muted/35 px-3 py-2.5 ring-1 ring-border/60"
        style={{ fontFamily: specimenFontFamily }}
      >
        <div className="text-base font-semibold">
          {t("settings.appearance.mixedSpecimen")}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Aa 0123</div>
      </div>
    </div>
  );
}

function getCurrentLanguage(language: string): "zh" | "en" {
  return language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function fontProfilesEqual(left: FontProfile, right: FontProfile) {
  return (
    left.display === right.display &&
    left.displayCustom === right.displayCustom &&
    left.displayChineseFallback === right.displayChineseFallback &&
    left.displayChineseFallbackCustom === right.displayChineseFallbackCustom &&
    left.body === right.body &&
    left.bodyCustom === right.bodyCustom &&
    left.bodyChineseFallback === right.bodyChineseFallback &&
    left.bodyChineseFallbackCustom === right.bodyChineseFallbackCustom
  );
}

function themedFontPreferencesEqual(
  left: ThemedFontPreferences,
  right: ThemedFontPreferences,
) {
  return (
    fontProfilesEqual(left.light, right.light) &&
    fontProfilesEqual(left.dark, right.dark) &&
    Math.abs(left.scale - right.scale) < 1e-6
  );
}
