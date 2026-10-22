import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { StartupRecoveryView } from "./StartupRecoveryView";
import { showMainWindowWhenReady } from "@/lib/ipc";
import { useStartupStore } from "@/stores/startupStore";

function StartupLoadingView() {
  const { t } = useTranslation();

  return (
    <main className="glass-canvas flex min-h-screen items-center justify-center px-6 text-foreground">
      {/* Mirrors the static index.html splash card (.startup-card) so the
          hand-off from the pre-JS splash to React is visually continuous. */}
      <div
        role="status"
        aria-live="polite"
        className="glass-panel grid w-[min(22rem,calc(100vw-3rem))] justify-items-center gap-5 rounded-shell p-8"
      >
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-9 w-2.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          <span className="h-12 w-2.5 animate-pulse rounded-full bg-secondary-accent [animation-delay:120ms] motion-reduce:animate-none" />
          <span className="h-9 w-2.5 animate-pulse rounded-full bg-primary [animation-delay:240ms] motion-reduce:animate-none" />
        </div>
        <p className="font-display text-xl font-semibold tracking-tight text-foreground">{t("app.name")}</p>
        <p className="inline-flex items-center rounded-pill bg-primary-tint px-3 py-1 text-xs font-medium text-primary-text">
          {t("startup.loading")}
        </p>
      </div>
    </main>
  );
}

export function StartupGate({ children }: { children: ReactNode }) {
  const status = useStartupStore((state) => state.status);
  const loadStatus = useStartupStore((state) => state.loadStatus);

  useEffect(() => {
    let cancelled = false;
    void loadStatus().finally(() => {
      if (!cancelled) void showMainWindowWhenReady().catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  if (status?.phase === "ready") return children;
  if (status === null || status.phase === "checking") return <StartupLoadingView />;
  return <StartupRecoveryView status={status} />;
}
