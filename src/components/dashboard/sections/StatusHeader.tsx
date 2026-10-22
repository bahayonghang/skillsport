import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Store,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

interface StatusHeaderProps {
  onNavigate: (path: string) => void;
  scanState: string;
  scanStateLabel: string;
  lastScanLabel: string;
  centralTotal: number;
  sourceRepositoryCount: number;
  enabledTargetsCount: number;
  visibleTargetsCount: number;
  quickMigratePath: string;
  quickMigrateDescription: string;
}

// The header sits directly on the canvas, where tints are outside the
// contrast matrix — so the scan state is semantic text + icon, not a capsule
// (mint / lavender / rose text on the canvas worst point are all >= 4.75:1).
function scanStateVisual(scanState: string): {
  className: string;
  icon: ReactNode;
} {
  switch (scanState) {
    case "error":
      return {
        className: "text-destructive-text",
        icon: <AlertCircle className="size-3.5" />,
      };
    case "refreshing":
    case "loading":
      return {
        className: "text-info-foreground",
        icon: <Loader2 className="size-3.5 animate-spin" />,
      };
    default:
      return {
        className: "text-success-foreground",
        icon: <CheckCircle2 className="size-3.5" />,
      };
  }
}

/**
 * Dashboard page header (DESIGN.md Layout → PageHeader): bold page title on
 * the canvas; scan state (icon + text) + last scan + one-line summary as small muted
 * meta; page actions on the right (one mint primary, the rest glass).
 */
export function StatusHeader({
  onNavigate,
  scanState,
  scanStateLabel,
  lastScanLabel,
  centralTotal,
  sourceRepositoryCount,
  enabledTargetsCount,
  visibleTargetsCount,
  quickMigratePath,
  quickMigrateDescription,
}: StatusHeaderProps) {
  const { t } = useTranslation();
  const state = scanStateVisual(scanState);

  return (
    <PageHeader
      title={t("sidebar.dashboard")}
      meta={
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 font-medium",
              state.className,
            )}
          >
            <span aria-hidden="true" className="inline-flex">
              {state.icon}
            </span>
            {scanStateLabel}
          </span>
          <span className="shrink-0">
            {t("dashboard.statusHeader.lastScan", { time: lastScanLabel })}
          </span>
          <span aria-hidden="true">·</span>
          <span className="min-w-0">
            {t("dashboard.statusHeader.summary", {
              central: centralTotal,
              sources: sourceRepositoryCount,
              agents: enabledTargetsCount,
              agentsTotal: visibleTargetsCount,
            })}
          </span>
        </span>
      }
      actions={
        <>
          <Button size="sm" onClick={() => onNavigate("/central")}>
            <ArrowUpRight className="size-4" />
            {t("dashboard.hero.ctaBrowse")}
          </Button>
          <Button
            size="sm"
            variant="glass"
            data-testid="dashboard-action-marketplace"
            onClick={() => onNavigate("/marketplace")}
          >
            <Store className="size-4" />
            {t("dashboard.hero.ctaMarketplace")}
          </Button>
          <Button
            size="sm"
            variant="glass"
            title={quickMigrateDescription}
            data-testid="dashboard-action-quick-migrate"
            onClick={() => onNavigate(quickMigratePath)}
          >
            <UploadCloud className="size-4" />
            {t("dashboard.hero.ctaQuickMigrate")}
          </Button>
        </>
      }
    />
  );
}
