import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Blocks, Keyboard, Plus, Search } from "lucide-react";

import { usePlatformStore } from "@/stores/platformStore";
import { TargetQuickSwitcher } from "@/components/layout/TargetQuickSwitcher";
import { Button } from "@/components/ui/button";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { cn } from "@/lib/utils";
import { DEFAULT_PLATFORM_CATEGORY_VISIBILITY } from "@/lib/platformVisibility";
import {
  getPlatformTargetCountAgentId,
  getPlatformTargetGroups,
  getPlatformTargetLabel,
} from "@/lib/platformTargetGroups";

interface TopBarProps {
  onSearchClick: () => void;
  onShortcutsClick: () => void;
}

export function TopBar({ onSearchClick, onShortcutsClick }: TopBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const agents = usePlatformStore((s) => s.agents);
  const skillsByAgent = usePlatformStore((s) => s.skillsByAgent);
  const categoryVisibility =
    usePlatformStore((s) => s.categoryVisibility) ??
    DEFAULT_PLATFORM_CATEGORY_VISIBILITY;
  const platformTargets = getPlatformTargetGroups(agents, categoryVisibility);

  // Determine current view label and count
  const viewInfo = (() => {
    if (pathname === "/dashboard" || pathname === "/") {
      return { label: t("sidebar.dashboard"), count: undefined };
    }
    if (pathname === "/central") {
      const count = skillsByAgent["central"] ?? 0;
      return { label: t("sidebar.centralSkills"), count };
    }
    if (pathname.startsWith("/platform/")) {
      const agentId = pathname.split("/platform/")[1];
      const agent =
        platformTargets.find((a) => a.id === agentId) ??
        agents.find((a) => a.id === agentId);
      const countAgentId = agent
        ? getPlatformTargetCountAgentId(agent)
        : agentId;
      return {
        label: agent ? getPlatformTargetLabel(agent, t, "short") : agentId,
        count: skillsByAgent[countAgentId] ?? 0,
      };
    }
    if (pathname === "/marketplace") {
      return { label: t("marketplace.title"), count: undefined };
    }
    if (pathname === "/collections") {
      return { label: t("sidebar.collections"), count: undefined };
    }
    if (pathname === "/logs") {
      return { label: t("logs.title"), count: undefined };
    }
    if (pathname.startsWith("/settings")) {
      return { label: t("sidebar.settings"), count: undefined };
    }
    if (pathname.startsWith("/skill/")) {
      return { label: t("globalSearch.skillDetail"), count: undefined };
    }
    return { label: "", count: undefined };
  })();

  // C5 D-S1 / D-S3: a transparent toolbar sitting straight on the canvas (no
  // fill, no bottom border). The search trigger is a glass capsule; small
  // icon buttons are 32px with a 40px hit area (icon-control-hit-area.md) and
  // the shared outline focus ring. The light/dark toggle lives only in the
  // sidebar footer.
  const searchTriggerClass = cn(
    "glass-panel glass-panel-hover focus-ring flex items-center gap-2 h-8 rounded-full px-3.5 text-sm text-muted-foreground cursor-pointer",
    "transition-[box-shadow,color] hover:text-foreground",
  );
  const iconButtonClass =
    "focus-ring relative inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors duration-150 cursor-pointer hover:bg-accent hover:text-foreground after:absolute after:left-1/2 after:top-1/2 after:size-10 after:min-h-[40px] after:min-w-[40px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-2 px-3 text-foreground">
      {/* App icon */}
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        className={cn(iconButtonClass, "z-10 text-primary-text hover:text-primary-text")}
        aria-label={t("app.name")}
        title={t("app.name")}
      >
        <Blocks className="size-5" aria-hidden="true" />
      </button>

      <div className="hidden flex-1 lg:block" />

      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center px-16 lg:flex">
        <div className="pointer-events-auto flex items-center gap-3 max-w-[min(56rem,calc(100vw-14rem))]">
          <button
            type="button"
            onClick={onSearchClick}
            className={cn(searchTriggerClass, "w-[min(26rem,40vw)] min-w-[14rem]")}
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate flex-1 text-left">
              {t("globalSearch.trigger")}
            </span>
            <ShortcutHint
              shortcut="mod+k"
              className="hidden rounded-full border border-border px-1.5 py-0.5 text-ui-meta text-muted-foreground sm:inline-flex"
            />
          </button>
        </div>
      </div>

      <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={onSearchClick}
          className={cn(searchTriggerClass, "min-w-0 flex-1")}
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate flex-1 text-left">
            {t("globalSearch.trigger")}
          </span>
        </button>
        {viewInfo.label && (
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            {viewInfo.label}
          </span>
        )}
      </div>

      <Button
        size="sm"
        className="z-10 hidden lg:inline-flex"
        onClick={() => navigate("/marketplace")}
        title={t("topbar.importSkill")}
      >
        <Plus className="size-3.5" />
        <span>{t("topbar.importSkill")}</span>
      </Button>

      <TargetQuickSwitcher />

      <button
        type="button"
        onClick={onShortcutsClick}
        className={cn(iconButtonClass, "z-10")}
        aria-label={t("shortcuts.openButton")}
        title={t("shortcuts.openButton")}
      >
        <Keyboard className="size-4" aria-hidden="true" />
      </button>
    </header>
  );
}
