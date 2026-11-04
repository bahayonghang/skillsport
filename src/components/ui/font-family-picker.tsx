import { memo, useMemo, useState } from "react"
import { Combobox } from "@base-ui/react/combobox"
import { CheckIcon, ChevronDownIcon, RefreshCwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import {
  GLASS_OVERLAY_ITEM_CLASS,
  GLASS_OVERLAY_POPUP_CLASS,
  GLASS_SELECT_TRIGGER_CLASS,
} from "@/components/ui/overlay-popup"
import {
  bodyRolePreviewFamily,
  chineseFallbackPreviewFamily,
  displayRolePreviewFamily,
  quoteFontFamily,
  type BodyFontKey,
  type ChineseFallbackKey,
  type DisplayFontKey,
} from "@/lib/displayFont"
import {
  loadInstalledFontFamilies,
  type InstalledFontCatalog,
} from "@/lib/systemFonts"

type PresetNamespace =
  | "displayFontOption"
  | "bodyFontOption"
  | "chineseFallbackOption"

interface FontPreset {
  key: string
  labelKey: string
}

interface FontChoiceItem {
  id: string
  label: string
  previewFamily: string
  group: "preset" | "saved" | "installed"
  key: string
  customFamily: string
}

function quotedFamilies(chain: string): string[] {
  const names: string[] = []
  for (const match of chain.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
    names.push(match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"))
  }
  return names
}

function presetPreview(namespace: PresetNamespace, key: string): string {
  if (namespace === "displayFontOption") {
    return displayRolePreviewFamily(key as DisplayFontKey, "")
  }
  if (namespace === "bodyFontOption") {
    return bodyRolePreviewFamily(key as BodyFontKey, "")
  }
  return chineseFallbackPreviewFamily(key as ChineseFallbackKey, "") ?? ""
}

function collisionNames(
  namespace: PresetNamespace,
  presets: readonly FontPreset[],
): Set<string> {
  const names = new Set<string>()
  if (namespace === "chineseFallbackOption") {
    for (const name of quotedFamilies(
      chineseFallbackPreviewFamily("sourceHanSerif", "") ?? "",
    )) {
      names.add(name.toLowerCase())
    }
    return names
  }
  for (const preset of presets) {
    if (preset.key === "system" || preset.key === "custom") continue
    const primary = quotedFamilies(presetPreview(namespace, preset.key))[0]
    if (primary) names.add(primary.toLowerCase())
  }
  return names
}

const FontChoiceRow = memo(function FontChoiceRow({
  item,
}: {
  item: FontChoiceItem
}) {
  return (
    <Combobox.Item
      value={item}
      className={cn(GLASS_OVERLAY_ITEM_CLASS, "pr-8")}
      style={item.previewFamily ? { fontFamily: item.previewFamily } : undefined}
    >
      <Combobox.ItemIndicator className="absolute right-2.5 inline-flex items-center text-primary-text">
        <CheckIcon aria-hidden="true" />
      </Combobox.ItemIndicator>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Combobox.Item>
  )
})

function FontFamilyPicker({
  ariaLabel,
  presetNamespace,
  presets,
  valueKey,
  customFamily,
  className,
  onChange,
}: {
  ariaLabel: string
  presetNamespace: PresetNamespace
  presets: readonly FontPreset[]
  valueKey: string
  customFamily: string
  className?: string
  onChange: (key: string, customFamily: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [catalog, setCatalog] = useState<InstalledFontCatalog>({
    families: [],
    available: true,
  })

  const items = useMemo(() => {
    const collisions = collisionNames(presetNamespace, presets)
    const customTrim = customFamily.trim()
    const installed = catalog.families.filter(
      (family) => !collisions.has(family.trim().toLowerCase()),
    )
    const shownAsInstalled = installed.some(
      (family) => family.trim().toLowerCase() === customTrim.toLowerCase(),
    )
    const next: FontChoiceItem[] = presets.map((preset) => ({
      id: `preset:${preset.key}`,
      label: t(`settings.appearance.${presetNamespace}.${preset.labelKey}`),
      previewFamily: presetPreview(presetNamespace, preset.key),
      group: "preset",
      key: preset.key,
      customFamily: "",
    }))
    if (valueKey === "custom" && customTrim && !shownAsInstalled) {
      next.push({
        id: `saved:${customTrim.toLowerCase()}`,
        label: customTrim,
        previewFamily: quoteFontFamily(customTrim),
        group: "saved",
        key: "custom",
        customFamily: customTrim,
      })
    }
    for (const family of installed) {
      const trimmed = family.trim()
      next.push({
        id: `installed:${trimmed.toLowerCase()}`,
        label: trimmed,
        previewFamily: quoteFontFamily(trimmed),
        group: "installed",
        key: "custom",
        customFamily: trimmed,
      })
    }
    return next
  }, [catalog.families, customFamily, presetNamespace, presets, t, valueKey])

  const selected = useMemo(() => {
    const customTrim = customFamily.trim().toLowerCase()
    return (
      items.find((item) => {
        if (item.group === "preset") {
          return item.key === valueKey && !(valueKey === "custom" && customTrim)
        }
        return valueKey === "custom" && item.customFamily.toLowerCase() === customTrim
      }) ?? null
    )
  }, [customFamily, items, valueKey])

  const trimmedQuery = query.trim().toLowerCase()
  const visible = trimmedQuery
    ? items.filter((item) => item.label.toLowerCase().includes(trimmedQuery))
    : items
  const triggerLabel =
    valueKey !== "custom"
      ? (items.find((item) => item.group === "preset" && item.key === valueKey)
          ?.label ?? valueKey)
      : customFamily.trim() ||
        items.find((item) => item.key === "custom")?.label ||
        valueKey

  function refresh(force: boolean) {
    setLoading(true)
    void loadInstalledFontFamilies(force).then((next) => {
      setCatalog(next)
      setLoading(false)
    })
  }

  const groups = [
    ["preset", t("settings.appearance.fontPresetGroup")],
    ["saved", t("settings.appearance.fontSavedGroup")],
    ["installed", t("settings.appearance.fontInstalledGroup")],
  ] as const

  return (
    <Combobox.Root
      items={visible}
      filter={null}
      value={selected}
      onValueChange={(next) => {
        if (!next) return
        onChange(next.key, next.customFamily)
      }}
      isItemEqualToValue={(item, current) => item.id === current.id}
      itemToStringLabel={(item) => item.label}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setQuery("")
          refresh(false)
        }
      }}
      inputValue={query}
      onInputValueChange={setQuery}
    >
      <Combobox.Trigger
        data-slot="font-family-trigger"
        data-value={valueKey}
        aria-label={ariaLabel}
        className={cn(GLASS_SELECT_TRIGGER_CLASS, className)}
      >
        <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={6} className="z-50 outline-none">
          <Combobox.Popup
            aria-label={ariaLabel}
            className={cn(
              GLASS_OVERLAY_POPUP_CLASS,
              "flex w-max min-w-(--anchor-width) max-w-[min(24rem,var(--available-width))] flex-col gap-1.5",
            )}
          >
            <Combobox.Input
              placeholder={t("settings.appearance.fontSearchPlaceholder")}
              aria-label={t("settings.appearance.fontSearchPlaceholder")}
              className="h-8 w-full rounded-control border border-input bg-input-surface px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
            />
            {!catalog.available && !loading ? (
              <p className="px-2.5 text-xs text-muted-foreground">
                {t("settings.appearance.fontListUnavailable")}
              </p>
            ) : null}
            {loading && catalog.families.length === 0 ? (
              <p className="px-2.5 text-xs text-muted-foreground">
                {t("settings.loading")}
              </p>
            ) : null}
            <Combobox.Empty className="px-1">
              {query.trim() ? (
                <button
                  type="button"
                  className={cn(GLASS_OVERLAY_ITEM_CLASS, "w-full text-left")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange("custom", query.trim())
                    setOpen(false)
                  }}
                >
                  {t("settings.appearance.useFamilyName", { name: query.trim() })}
                </button>
              ) : (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">
                  {t("settings.appearance.fontListEmpty")}
                </p>
              )}
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain outline-none">
              {groups.map(([group, label]) => {
                const groupItems = visible.filter((item) => item.group === group)
                if (groupItems.length === 0) return null
                return (
                  <div key={group}>
                    <div className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                      {label}
                    </div>
                    {groupItems.map((item) => (
                      <FontChoiceRow key={item.id} item={item} />
                    ))}
                  </div>
                )
              })}
            </Combobox.List>
            <button
              type="button"
              className={cn(GLASS_OVERLAY_ITEM_CLASS, "text-muted-foreground")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => refresh(true)}
            >
              <RefreshCwIcon
                className={cn("size-4", loading && "animate-spin")}
                aria-hidden="true"
              />
              {t("settings.appearance.fontRefresh")}
            </button>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

export { FontFamilyPicker }
