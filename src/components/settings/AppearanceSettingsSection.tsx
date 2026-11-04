import {
  CheckCircle2,
  Globe2,
  Palette,
  SlidersHorizontal,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { FontFamilyPicker } from "@/components/ui/font-family-picker";
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

  async function handleDisplayChoice(key: DisplayFontKey, custom: string) {
    updateEditorProfile({ display: key, displayCustom: custom });
    await saveDisplayFont(editorFontMode, key, custom);
  }

  async function handleDisplayChineseFallbackChoice(
    key: ChineseFallbackKey,
    custom: string,
  ) {
    updateEditorProfile({
      displayChineseFallback: key,
      displayChineseFallbackCustom: custom,
    });
    await saveDisplayChineseFallback(editorFontMode, key, custom);
  }

  async function handleBodyChoice(key: BodyFontKey, custom: string) {
    updateEditorProfile({ body: key, bodyCustom: custom });
    await saveBodyFont(editorFontMode, key, custom);
  }

  async function handleBodyChineseFallbackChoice(
    key: ChineseFallbackKey,
    custom: string,
  ) {
    updateEditorProfile({
      bodyChineseFallback: key,
      bodyChineseFallbackCustom: custom,
    });
    await saveBodyChineseFallback(editorFontMode, key, custom);
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
    <div className="space-y-4" data-settings-section="appearance">
      <SettingGroup
        icon={Palette}
        title={t("settings.appearance.themeGroup")}
        description={t("settings.appearance.themeGroupDesc")}
      >
        <div className="space-y-5">
          <ControlField label={t("settings.appearance.themeMode")}>
            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              {THEME_FLAVORS.map((item) => (
                <ThemePreviewCard
                  key={item}
                  flavor={item}
                  selected={item === flavor}
                  onSelect={() => onSetFlavor(item)}
                />
              ))}
            </div>
          </ControlField>
          <div className="border-t border-border pt-4">
            <WindowMaterialSetting />
          </div>
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
          <ControlField label={t("settings.appearance.fontThemeMode")}>
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

          <div className="grid gap-5 divide-y divide-border xl:grid-cols-2 xl:gap-0 xl:divide-x xl:divide-y-0 [&>*+*]:pt-5 xl:[&>*+*]:pt-0 xl:[&>*+*]:pl-5 xl:[&>*:first-child]:pr-5">
            <FontRoleControl
              groupLabel={t("settings.appearance.displayFontOptionsLabel")}
              title={t("settings.appearance.displayFont")}
              primary={profile.display}
              primaryOptions={DISPLAY_FONT_OPTIONS}
              primaryOptionNamespace="displayFontOption"
              primaryCustom={profile.displayCustom}
              chineseFallback={profile.displayChineseFallback}
              chineseFallbackLabel={t(
                "settings.appearance.displayChineseFallback",
              )}
              chineseFallbackCustom={profile.displayChineseFallbackCustom}
              specimenFontFamily={resolveDisplayFontFamily(profile)}
              onPrimaryChange={(key, custom) =>
                void handleDisplayChoice(key as DisplayFontKey, custom)
              }
              onChineseFallbackChange={(key, custom) =>
                void handleDisplayChineseFallbackChoice(key, custom)
              }
            />
            <FontRoleControl
              groupLabel={t("settings.appearance.bodyFontOptionsLabel")}
              title={t("settings.appearance.bodyFont")}
              primary={profile.body}
              primaryOptions={BODY_FONT_OPTIONS}
              primaryOptionNamespace="bodyFontOption"
              primaryCustom={profile.bodyCustom}
              chineseFallback={profile.bodyChineseFallback}
              chineseFallbackLabel={t(
                "settings.appearance.bodyChineseFallback",
              )}
              chineseFallbackCustom={profile.bodyChineseFallbackCustom}
              specimenFontFamily={resolveBodyFontFamily(profile)}
              onPrimaryChange={(key, custom) =>
                void handleBodyChoice(key as BodyFontKey, custom)
              }
              onChineseFallbackChange={(key, custom) =>
                void handleBodyChineseFallbackChoice(key, custom)
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
          <div className="flex min-h-16 items-center justify-between gap-4 rounded-inner bg-accent px-4 py-3">
            <span className="font-display text-base font-semibold tabular-nums">
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

/**
 * Theme choice as a preview card (DESIGN.md Settings · Appearance): a
 * miniature canvas with a sidebar and two panels painted from the target
 * theme's own tokens (the preview subtree carries that `data-theme`, so the
 * swatch is right whichever theme is active). No real blur. Selected = mint
 * stroke + check icon + `aria-pressed`; the accessible name is the theme
 * label only, the description is wired through `aria-describedby`.
 */
function ThemePreviewCard({
  flavor,
  selected,
  onSelect,
}: {
  flavor: ThemeFlavor;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const descriptionId = useId();

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      data-theme-preview={flavor}
      onClick={onSelect}
      className={cn(
        "focus-ring group flex min-w-0 flex-col gap-3 rounded-inner border p-2 text-left transition-[border-color,background-color,scale] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
        selected
          ? "tint-primary border-primary-stroke"
          : "border-border hover:bg-accent",
      )}
    >
      <span
        aria-hidden="true"
        data-theme={flavor}
        className="relative block h-24 overflow-hidden rounded-control bg-(--background) bg-[radial-gradient(10rem_6rem_at_10%_0%,var(--canvas-blob-1),transparent_70%),radial-gradient(10rem_6rem_at_95%_100%,var(--canvas-blob-2),transparent_70%),linear-gradient(135deg,var(--canvas-from),var(--canvas-to))]"
      >
        <span className="absolute inset-y-2 left-2 flex w-1/4 flex-col gap-1.5 rounded-control border border-glass-stroke bg-sidebar p-1.5">
          <span className="h-2 w-full rounded-full border border-primary-stroke bg-primary-tint" />
          <span className="h-1.5 w-3/4 rounded-full bg-muted-foreground/30" />
          <span className="h-1.5 w-2/3 rounded-full bg-muted-foreground/30" />
        </span>
        <span className="absolute top-2 right-2 left-[calc(25%+1rem)] flex h-9 items-center gap-1.5 rounded-control border border-glass-stroke bg-card px-2">
          <span className="h-1.5 w-1/3 rounded-full bg-foreground/70" />
          <span className="ml-auto h-3 w-6 rounded-full bg-primary" />
        </span>
        <span className="absolute right-2 bottom-2 left-[calc(25%+1rem)] grid h-9 grid-cols-2 gap-1.5">
          <span className="rounded-control bg-card tint-primary" />
          <span className="rounded-control bg-card tint-secondary" />
        </span>
      </span>
      <span className="flex min-w-0 items-start justify-between gap-2 px-1 pb-1">
        <span className="min-w-0">
          <span
            id={labelId}
            className={cn(
              "block text-sm font-medium",
              selected ? "text-primary-text" : "text-foreground",
            )}
          >
            {t(`settings.appearance.themeOption.${flavor}`)}
          </span>
          <span
            id={descriptionId}
            className="mt-0.5 block text-xs text-muted-foreground"
          >
            {t(`settings.appearance.themeOptionDesc.${flavor}`)}
          </span>
        </span>
        {selected ? (
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-primary-text"
            aria-hidden="true"
          />
        ) : null}
      </span>
    </button>
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
    <section className="glass-panel grid gap-4 rounded-card px-5 py-5 md:grid-cols-[minmax(10rem,12rem)_minmax(0,1fr)] md:gap-6">
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

// Segmented pill group (same language as the Usage filter groups): neutral
// `bg-accent` track, selected item = mint tint + 1px mint stroke + mint text.
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
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-pill bg-accent p-0.5">
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
              "h-10 min-h-10 px-4 text-sm md:h-10",
              active
                ? "border-primary-stroke bg-primary-tint text-primary-text hover:bg-primary-tint hover:text-primary-text"
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
  chineseFallback,
  chineseFallbackLabel,
  chineseFallbackCustom,
  specimenFontFamily,
  onPrimaryChange,
  onChineseFallbackChange,
}: {
  groupLabel: string;
  title: string;
  primary: string;
  primaryOptions: readonly FontOption[];
  primaryOptionNamespace: "displayFontOption" | "bodyFontOption";
  primaryCustom: string;
  chineseFallback: ChineseFallbackKey;
  chineseFallbackLabel: string;
  chineseFallbackCustom: string;
  specimenFontFamily: string;
  onPrimaryChange: (key: string, customFamily: string) => void;
  onChineseFallbackChange: (key: ChineseFallbackKey, customFamily: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid min-w-0 content-start gap-4" role="group" aria-label={groupLabel}>
      <h3 className="font-heading text-sm font-semibold leading-5">{title}</h3>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(14rem,100%),1fr))]">
        <div className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">
            {t("settings.appearance.primaryFont")}
          </span>
          <FontFamilyPicker
            ariaLabel={title}
            presetNamespace={primaryOptionNamespace}
            presets={primaryOptions}
            valueKey={primary}
            customFamily={primaryCustom}
            className="h-10"
            onChange={onPrimaryChange}
          />
        </div>
        <div className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">
            {chineseFallbackLabel}
          </span>
          <FontFamilyPicker
            ariaLabel={chineseFallbackLabel}
            presetNamespace="chineseFallbackOption"
            presets={CHINESE_FALLBACK_OPTIONS}
            valueKey={chineseFallback}
            customFamily={chineseFallbackCustom}
            className="h-10"
            onChange={(key, custom) =>
              onChineseFallbackChange(key as ChineseFallbackKey, custom)
            }
          />
        </div>
      </div>

      <div
        className="min-h-14 rounded-inner bg-accent px-3 py-2.5"
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
