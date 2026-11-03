/**
 * `useCentralPaletteActions` —— 把 V2 命令面板的 quick actions 组装在一处。
 *
 * 当前提供：
 * 1. 保存当前视图（仅当 saved-view 桥允许时）
 * 2. 创建标签分组
 * 3. 切换 group-by 模式（5 选其余 4）
 * 4. 一键清理中央仓库（危险，打开预览对话框，不直接执行）
 */

import { useMemo } from "react";
import type { TFunction } from "i18next";

import type { CommandPaletteAction } from "@/components/central/CommandPalette";
import type { CentralViewState, GroupByMode } from "@/lib/centralViewState";

export interface GroupByOption {
  value: GroupByMode;
  label: string;
}

export interface UseCentralV2PaletteActionsArgs {
  t: TFunction;
  viewState: CentralViewState;
  setViewState: (next: CentralViewState) => void;
  canSaveCurrent: boolean;
  onSaveCurrentView: (defaultName: string) => void;
  onCreateTagGroup: () => void;
  /** 打开一键清理预览；缺省则不提供该动作。 */
  onClearCentral?: () => void;
  /** 可选注入 group-by 选项；默认从 t 派生 5 种内置模式。 */
  groupByOptions?: ReadonlyArray<GroupByOption>;
}

export interface UseCentralV2PaletteActionsResult {
  actions: CommandPaletteAction[];
  groupByOptions: GroupByOption[];
}

export function useCentralPaletteActions({
  t,
  viewState,
  setViewState,
  canSaveCurrent,
  onSaveCurrentView,
  onCreateTagGroup,
  onClearCentral,
  groupByOptions: groupByOptionsArg,
}: UseCentralV2PaletteActionsArgs): UseCentralV2PaletteActionsResult {
  const groupByOptions = useMemo<GroupByOption[]>(
    () =>
      groupByOptionsArg
        ? [...groupByOptionsArg]
        : [
            { value: "none", label: t("central.v2.groupByModeNone") },
            { value: "repository", label: t("central.v2.groupByModeRepository") },
            { value: "owner", label: t("central.v2.groupByModeOwner") },
            { value: "tag", label: t("central.v2.groupByModeTag") },
            { value: "status", label: t("central.v2.groupByModeStatus") },
          ],
    [t, groupByOptionsArg],
  );

  const actions = useMemo(() => {
    const items: CommandPaletteAction[] = [];

    if (canSaveCurrent) {
      items.push({
        id: "save-current-view",
        label: t("central.v2.paletteActionSaveCurrentView"),
        onSelect: () =>
          onSaveCurrentView(t("central.v2.savedViewsNamePlaceholder")),
      });
    }

    items.push({
      id: "create-tag-group",
      label: t("central.v2.paletteActionCreateTagGroup"),
      onSelect: onCreateTagGroup,
    });

    for (const opt of groupByOptions) {
      if (opt.value === viewState.group) continue;
      items.push({
        id: `group-by-${opt.value}`,
        label: t("central.v2.paletteActionGroupBy", { label: opt.label }),
        onSelect: () => setViewState({ ...viewState, group: opt.value }),
      });
    }

    if (onClearCentral) {
      items.push({
        id: "clear-central",
        label: t("central.clearAll.paletteAction"),
        keywords: t("central.clearAll.paletteKeywords").split(/\s+/).filter(Boolean),
        onSelect: onClearCentral,
      });
    }

    return items;
  }, [
    t,
    viewState,
    setViewState,
    canSaveCurrent,
    onSaveCurrentView,
    onCreateTagGroup,
    onClearCentral,
    groupByOptions,
  ]);

  return { actions, groupByOptions };
}
