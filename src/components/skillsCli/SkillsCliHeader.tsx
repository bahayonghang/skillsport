import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, Link2, Package, RefreshCw, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { formatBackendError } from "@/lib/backendError";
import { cn } from "@/lib/utils";
import type { SkillsCliCounts } from "@/pages/skillsCliViewModel";
import type { SkillsCliDoctorReport } from "@/types";

export interface SkillsCliHeaderProps {
  counts: SkillsCliCounts;
  doctor: SkillsCliDoctorReport | null;
  runtimeError: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isCheckingUpdates?: boolean;
  installAvailable: boolean;
  mutationLockReason?: string;
  onRefresh: () => void;
  onCheckUpdates: () => void;
  onCancelUpdate?: () => void;
  onOpenInstall: () => void;
  installButtonRef?: Ref<HTMLButtonElement>;
}

export function SkillsCliHeader({
  counts,
  doctor,
  runtimeError,
  isLoading,
  isRefreshing,
  isCheckingUpdates = false,
  installAvailable,
  mutationLockReason,
  onRefresh,
  onCheckUpdates,
  onCancelUpdate,
  onOpenInstall,
  installButtonRef,
}: SkillsCliHeaderProps) {
  const { t } = useTranslation();
  const runtimeLabel = isLoading && !doctor && !runtimeError
    ? t("skillsCli.doctorChecking")
    : doctor
      ? t("skillsCli.doctorOk", {
          version: doctor.nodeVersion,
          spec: doctor.npmSpec,
        })
      : runtimeError
        ? formatBackendError(runtimeError, t)
        : t("skillsCli.doctorUnknown");
  const installDisabled =
    !installAvailable || runtimeError !== null || Boolean(mutationLockReason);
  const updatesDisabled = Boolean(mutationLockReason);

  return (
    <header className="space-y-4 px-6 pt-6 pb-2">
      <PageHeader
        title={t("skillsCli.title")}
        meta={t("skillsCli.subtitle")}
        actions={
          <>
            <Button
              type="button"
              variant="glass"
              onClick={onRefresh}
              disabled={isLoading || isRefreshing}
              aria-label={t("skillsCli.refresh")}
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  isRefreshing && "animate-spin motion-reduce:animate-none",
                )}
              />
              {isRefreshing ? t("skillsCli.refreshing") : t("skillsCli.refresh")}
            </Button>
            <Button
              type="button"
              variant="glass"
              onClick={onCheckUpdates}
              disabled={updatesDisabled}
              title={mutationLockReason}
              aria-label={t("skillsCli.updates.checkUpdates")}
              data-testid="skills-cli-check-updates"
            >
              {isCheckingUpdates
                ? t("skillsCli.updates.checking")
                : t("skillsCli.updates.checkUpdates")}
            </Button>
            {isCheckingUpdates && onCancelUpdate ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancelUpdate}
                aria-label={t("skillsCli.updates.cancelCheck")}
                data-testid="skills-cli-cancel-update"
              >
                {t("skillsCli.updates.cancelCheck")}
              </Button>
            ) : null}
            <Button
              ref={installButtonRef}
              type="button"
              onClick={onOpenInstall}
              disabled={installDisabled}
              title={mutationLockReason}
              aria-label={t("skillsCli.installSkills")}
            >
              {t("skillsCli.installSkills")}
            </Button>
          </>
        }
      />
      {/* KPI row: StatTiles sit on a glass panel (tints are only measured on
          panel / overlay composites), runtime status as small muted text. */}
      <div className="glass-panel space-y-2 rounded-card p-3">
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          data-testid="skills-cli-counts"
        >
          <StatTile
            size="compact"
            tone="neutral"
            icon={<Package />}
            label={t("skillsCli.countInstalled")}
            value={counts.installed}
          />
          <StatTile
            size="compact"
            tone="primary"
            icon={<Link2 />}
            label={t("skillsCli.countLinked")}
            value={counts.linked}
          />
          <StatTile
            size="compact"
            tone="neutral"
            icon={<Unlink />}
            label={t("skillsCli.countUnlinked")}
            value={counts.unlinked}
          />
          <StatTile
            size="compact"
            tone="secondary"
            icon={<GitBranch />}
            label={t("skillsCli.countRepositories")}
            value={counts.repositories}
          />
        </div>
        <p
          className={cn(
            "px-1 text-xs",
            runtimeError ? "text-destructive-text" : "text-muted-foreground",
          )}
          data-testid="skills-cli-doctor"
          aria-label={t("skillsCli.runtimeStatus")}
        >
          {runtimeLabel}
        </p>
      </div>
    </header>
  );
}
