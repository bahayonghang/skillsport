import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { UpdateCenterDialog } from "@/components/central/UpdateCenterDialog";
import { ImportIntentController } from "@/components/import/ImportIntentController";
import { usePlatformStore } from "@/stores/platformStore";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { useTargetStore } from "@/stores/targetStore";
import { useSkillStore } from "@/stores/skillStore";
import { useMarketplaceStore } from "@/stores/marketplaceStore";
import { useImportIntentStore } from "@/stores/importIntentStore";
import { useProjectsStore } from "@/stores/projectsStore";
import {
  cancelScheduledExternalChangeRefresh,
  captureExternalChangeBaseline,
  scheduleExternalChangeRefresh,
} from "@/stores/externalChangeWatcher";
import { useSkillsCliStore } from "@/stores/skillsCliStore";
import { isTauriRuntime, listen } from "@/lib/ipc";

type MigrationProgressPayload =
  | { phase: "started" }
  | { phase: "completed"; copied: number; skipped: number; failed: number }
  | { phase: "failed"; error: string };

function disposeListener(unlisten?: (() => void | Promise<void>) | null) {
  if (!unlisten) {
    return;
  }

  void Promise.resolve(unlisten()).catch(() => undefined);
}

/**
 * Top-level app shell: fixed glass canvas + transparent TopBar + floating
 * glass sidebar + main content area.
 * Triggers the initial platform scan on mount.
 */
export function AppShell() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const initialize = usePlatformStore((s) => s.initialize);
  const rescan = usePlatformStore((s) => s.rescan);
  const resetPlatformForTargetChange = usePlatformStore(
    (s) => s.resetForTargetChange,
  );
  const loadCentralSkills = useCentralSkillsStore((s) => s.loadCentralSkills);
  const resetCentralForTargetChange = useCentralSkillsStore(
    (s) => s.resetForTargetChange,
  );
  const resetSkillsForTargetChange = useSkillStore(
    (s) => s.resetForTargetChange,
  );
  const resetMarketplaceForTargetChange = useMarketplaceStore(
    (s) => s.resetForTargetChange,
  );
  const resetSkillsCliForTargetChange = useSkillsCliStore(
    (s) => s.resetForTargetChange,
  );
  const clearGitHubBranchForTargetChange = useImportIntentStore(
    (s) => s.setGitHubBranch,
  );
  const loadProjects = useProjectsStore((s) => s.loadProjects);
  const resetProjectsForTargetChange = useProjectsStore(
    (s) => s.resetForTargetChange,
  );
  const loadTargets = useTargetStore((s) => s.loadTargets);
  const activeTargetId = useTargetStore((s) => s.activeTarget.id);
  const [hasLoadedTargets, setHasLoadedTargets] = useState(false);
  const lastTargetIdRef = useRef<string | null>(null);
  const isInitialTargetLoadRef = useRef(true);
  const startupActionsRef = useRef({ initialize, loadTargets, loadProjects });
  const handleGlobalRescan = useCallback(async () => {
    await rescan();
    await loadCentralSkills();
  }, [loadCentralSkills, rescan]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        initialize: initialInitialize,
        loadTargets: initialLoadTargets,
        loadProjects: initialLoadProjects,
      } = startupActionsRef.current;
      await initialLoadTargets().catch(() => undefined);
      if (cancelled) return;
      setHasLoadedTargets(true);
      await Promise.all([
        initialInitialize().catch(() => undefined),
        initialLoadProjects().catch(() => undefined),
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeTargetId) return;

    if (isInitialTargetLoadRef.current) {
      lastTargetIdRef.current = activeTargetId;
      if (hasLoadedTargets) {
        isInitialTargetLoadRef.current = false;
      }
      return;
    }

    if (lastTargetIdRef.current === null) {
      lastTargetIdRef.current = activeTargetId;
      return;
    }

    if (lastTargetIdRef.current === activeTargetId) return;

    lastTargetIdRef.current = activeTargetId;
    resetPlatformForTargetChange();
    resetCentralForTargetChange();
    resetSkillsForTargetChange();
    resetMarketplaceForTargetChange();
    resetSkillsCliForTargetChange();
    resetProjectsForTargetChange();
    clearGitHubBranchForTargetChange("");
    void handleGlobalRescan();
    void loadProjects();
  }, [
    activeTargetId,
    clearGitHubBranchForTargetChange,
    handleGlobalRescan,
    hasLoadedTargets,
    loadProjects,
    resetCentralForTargetChange,
    resetMarketplaceForTargetChange,
    resetPlatformForTargetChange,
    resetProjectsForTargetChange,
    resetSkillsCliForTargetChange,
    resetSkillsForTargetChange,
  ]);

  useEffect(() => {
    if (!mainRef.current) return;
    mainRef.current.scrollTop = 0;
  }, [pathname]);

  useEffect(() => {
    captureExternalChangeBaseline();
    const onFocus = () => {
      scheduleExternalChangeRefresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleExternalChangeRefresh();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelScheduledExternalChangeRefresh();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void | Promise<void>) | undefined;

    void listen<MigrationProgressPayload>(
      "system://migration-progress",
      (event) => {
        if (disposed) return;
        const payload = event.payload;
        switch (payload.phase) {
          case "completed":
            if (payload.copied > 0 || payload.failed > 0) {
              toast.success(
                t("central.migrationCompleted", {
                  copied: payload.copied,
                  skipped: payload.skipped,
                  failed: payload.failed,
                }),
              );
            }
            break;
          case "failed":
            toast.error(t("central.migrationFailed", { error: payload.error }));
            break;
          default:
            break;
        }
      },
    )
      .then((cleanup) => {
        if (disposed) {
          disposeListener(cleanup);
          return;
        }
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      disposeListener(unlisten);
    };
  }, [t]);

  function handleAction(action: string) {
    switch (action) {
      case "rescan":
        void handleGlobalRescan();
        break;
    }
  }

  return (
    // C5 D-S1: the L1 canvas is its own fixed layer behind the content, so it
    // never scrolls with <main> (and stays the element html[data-window-
    // material="mica"] makes translucent). The transparent TopBar row sits
    // directly on it; below it the floating sidebar panel keeps a 12px gap to
    // the left / bottom window edges, and <main> keeps 12px to the right /
    // bottom. Pages bring their own 24px gutter.
    <div className="relative isolate flex h-screen flex-col overflow-hidden text-foreground">
      <div
        aria-hidden="true"
        data-slot="app-canvas"
        className="glass-canvas pointer-events-none fixed inset-0 -z-10"
      />
      <TopBar
        onSearchClick={() => setIsSearchOpen(true)}
        onShortcutsClick={() => setIsShortcutsOpen(true)}
      />
      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
        <Sidebar />
        <main ref={mainRef} className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <GlobalSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onAction={handleAction}
      />
      <ShortcutsSheet
        open={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
      />
      <UpdateCenterDialog />
      <ImportIntentController />
    </div>
  );
}
