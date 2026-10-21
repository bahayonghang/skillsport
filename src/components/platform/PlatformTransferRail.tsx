import { useTranslation } from "react-i18next";
import {
  ArrowRightLeft,
  Eraser,
  PackagePlus,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export function PlatformTransferRail({
  selectedCount,
  selectableCount,
  onSelectCurrentResults,
  onClearSelection,
  onSelectMostUniversal,
}: {
  selectedCount: number;
  selectableCount: number;
  onSelectCurrentResults: () => void;
  onClearSelection: () => void;
  onSelectMostUniversal?: () => void;
}) {
  const { t } = useTranslation();
  const hasSelectableSkills = selectableCount > 0;
  const canSelectMostUniversal = typeof onSelectMostUniversal === "function";

  return (
    <div
      data-testid="platform-transfer-rail"
      className="glass-panel mx-4 rounded-card px-4 py-2.5 sm:mx-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-56 flex-1 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary-tint text-primary-text">
            <ArrowRightLeft className="size-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("platform.batchRailKicker")}
            </p>
            <p
              data-testid="platform-transfer-summary"
              className="text-sm font-semibold text-foreground"
            >
              {t("platform.batchSelectionSummary", {
                selectedCount,
                selectableCount,
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="glass"
            size="sm"
            disabled={!hasSelectableSkills}
            onClick={onSelectCurrentResults}
            data-testid="platform-select-current-results"
          >
            {t("platform.transferSelectCurrent")}
          </Button>
          {canSelectMostUniversal && (
            <Button
              type="button"
              variant="glass"
              size="sm"
              disabled={!hasSelectableSkills}
              onClick={onSelectMostUniversal}
              data-testid="platform-select-most-universal"
            >
              <Sparkles className="size-3.5" aria-hidden />
              {t("platform.transferSelectMostUniversal")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selectedCount === 0}
            onClick={onClearSelection}
            data-testid="platform-clear-selection"
          >
            <Eraser className="size-3.5" aria-hidden />
            {t("platform.transferClear")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PlatformTransferActionBar({
  selectedCount,
  isInstalling,
  isDeleting,
  onClearSelection,
  onDelete,
  onInstall,
}: {
  selectedCount: number;
  isInstalling: boolean;
  isDeleting: boolean;
  onClearSelection: () => void;
  onDelete: () => void;
  onInstall?: () => void;
}) {
  const { t } = useTranslation();
  const showInstall = typeof onInstall === "function";

  if (selectedCount === 0) return null;

  return (
    <div
      data-testid="platform-batch-action-bar"
      className="sticky bottom-0 z-20 px-4 pb-4 sm:px-6"
    >
      <div className="glass-sticky flex flex-wrap items-center justify-between gap-3 rounded-full border border-glass-stroke py-2 pr-2 pl-4 shadow-overlay">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-2 rounded-full bg-primary" />
          <span className="text-sm font-semibold text-foreground">
            {t("platform.batchActionSummary", { count: selectedCount })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
          >
            {t("platform.transferClear")}
          </Button>
          {showInstall && (
            <Button
              type="button"
              size="sm"
              disabled={isInstalling || isDeleting}
              onClick={onInstall}
              data-testid="platform-batch-install"
            >
              <PackagePlus className="size-3.5" aria-hidden />
              {t("platform.transferInstall")}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isDeleting || isInstalling}
            onClick={onDelete}
            data-testid="platform-batch-delete"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {t("platform.batchDelete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
