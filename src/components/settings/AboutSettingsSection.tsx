import {
  Activity,
  CheckCircle2,
  CircleDot,
  Code2,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Globe,
  Info,
  Loader2,
  PackageCheck,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import {
  formatAppUpdateBytes,
  getAppUpdateProgressPercent,
  useAppUpdateStore,
  type AppUpdateStatus,
} from "@/stores/appUpdateStore";
import { cn } from "@/lib/utils";
import { statusSoftClass } from "@/lib/statusTone";

interface AboutSettingsSectionProps {
  appVersion: string;
  dbPathDisplay: string;
  repoUrl: string;
}

const HELP_RESOURCES = [
  {
    key: "readme",
    href: "https://github.com/bahayonghang/skillsport#readme",
  },
  {
    key: "readmeZh",
    href: "https://github.com/bahayonghang/skillsport/blob/main/README_CN.md",
  },
  {
    key: "releases",
    href: "https://github.com/bahayonghang/skillsport/releases",
  },
  {
    key: "issues",
    href: "https://github.com/bahayonghang/skillsport/issues",
  },
] as const;

const STACK_ITEMS = [
  "Rust",
  "Tauri 2",
  "React 19",
  "TypeScript 6",
  "Tailwind CSS 4",
  "SQLite/sqlx",
  "Zustand",
  "i18next",
];

export function AboutSettingsSection({
  appVersion,
  dbPathDisplay,
  repoUrl,
}: AboutSettingsSectionProps) {
  const { t } = useTranslation();
  const status = useAppUpdateStore((state) => state.status);
  const currentVersion = useAppUpdateStore((state) => state.currentVersion);
  const latestVersion = useAppUpdateStore((state) => state.latestVersion);
  const releaseNotes = useAppUpdateStore((state) => state.releaseNotes);
  const progress = useAppUpdateStore((state) => state.progress);
  const error = useAppUpdateStore((state) => state.error);
  const checkForUpdate = useAppUpdateStore((state) => state.checkForUpdate);
  const installUpdate = useAppUpdateStore((state) => state.installUpdate);
  const progressPercent = getAppUpdateProgressPercent(progress);
  const statusLabel = t(`settings.aboutCockpit.updateStatus.${status}`);
  const isChecking = status === "checking";
  const isDownloading = status === "downloading";
  const isInstalling = status === "installing";
  const canInstall = status === "available";
  const hasUpdate = Boolean(latestVersion);

  return (
    <Card
      variant="glass"
      className="gap-5 rounded-shell p-5 text-foreground sm:p-6"
      data-testid="about-cockpit"
    >
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary" icon={<CircleDot />}>
              {t("settings.aboutCockpit.eyebrow")}
            </Badge>
            <StatusChip status={status} label={statusLabel} />
          </div>
          <div>
            <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              SkillPort
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("settings.aboutCockpit.heroDesc")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <MetaPill
              icon={<PackageCheck />}
              label={t("settings.appVersion")}
              value={`v${appVersion}`}
            />
            <MetaPill
              icon={<ShieldCheck />}
              label={t("settings.aboutCockpit.channel")}
              value={t("settings.aboutCockpit.stable")}
            />
            <MetaPill
              icon={<Server />}
              label={t("settings.aboutCockpit.platform")}
              value={t("settings.aboutCockpit.windowsX64")}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-md">
          <StatTile
            size="compact"
            tone="neutral"
            icon={<PackageCheck />}
            label={t("settings.aboutCockpit.currentVersion")}
            value={`v${currentVersion || appVersion}`}
          />
          <StatTile
            size="compact"
            tone={latestVersion ? "primary" : "neutral"}
            icon={<Download />}
            label={t("settings.aboutCockpit.latestVersion")}
            value={
              latestVersion
                ? `v${latestVersion}`
                : t("settings.aboutCockpit.pendingCheck")
            }
          />
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="group focus-ring col-span-full flex min-w-0 items-center justify-between gap-3 rounded-inner bg-accent px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-primary-tint hover:text-primary-text"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Globe
                className="size-4 shrink-0 text-primary-text"
                aria-hidden="true"
              />
              <span className="truncate font-mono text-ui-meta">{repoUrl}</span>
            </span>
            <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <ReleaseUpdateCard
          canInstall={canInstall}
          error={error}
          hasUpdate={hasUpdate}
          isChecking={isChecking}
          isDownloading={isDownloading}
          isInstalling={isInstalling}
          progressPercent={progressPercent}
          releaseNotes={releaseNotes}
          status={status}
          statusLabel={statusLabel}
          downloadedLabel={formatAppUpdateBytes(progress.downloaded)}
          totalLabel={formatAppUpdateBytes(progress.total)}
          latestVersion={latestVersion}
          onCheck={() => {
            void checkForUpdate();
          }}
          onInstall={() => {
            void installUpdate();
          }}
        />

        <DiagnosticCard dbPathDisplay={dbPathDisplay} repoUrl={repoUrl} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <TechStackCard />
        <HelpResourcesCard />
      </div>
    </Card>
  );
}

function ReleaseUpdateCard({
  canInstall,
  error,
  hasUpdate,
  isChecking,
  isDownloading,
  isInstalling,
  progressPercent,
  releaseNotes,
  status,
  statusLabel,
  downloadedLabel,
  totalLabel,
  latestVersion,
  onCheck,
  onInstall,
}: {
  canInstall: boolean;
  error: string | null;
  hasUpdate: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  progressPercent: number;
  releaseNotes: string | null;
  status: AppUpdateStatus;
  statusLabel: string;
  downloadedLabel: string;
  totalLabel: string;
  latestVersion: string | null;
  onCheck: () => void;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  const progressLabel = t("settings.aboutCockpit.downloadProgress", {
    downloaded: downloadedLabel,
    total: totalLabel,
    percent: progressPercent,
  });

  return (
    <CockpitCard
      icon={<Download />}
      title={t("settings.aboutCockpit.updateTitle")}
      description={t("settings.aboutCockpit.updateDesc")}
      data-testid="about-update-card"
    >
      <div className="space-y-4">
        {/* Wrap by available width, not the viewport: the card is narrow in
            the two-column cockpit, so the actions drop below the state. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">
              {t("settings.aboutCockpit.updateState")}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusChip status={status} label={statusLabel} />
              {latestVersion ? (
                <Badge tone="success" icon={<CheckCircle2 />}>
                  {t("settings.aboutCockpit.newVersion", {
                    version: latestVersion,
                  })}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="glass"
              disabled={isChecking || isDownloading || isInstalling}
              onClick={onCheck}
            >
              {isChecking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              {isChecking
                ? t("settings.aboutCockpit.checking")
                : t("settings.aboutCockpit.checkUpdate")}
            </Button>
            <Button
              type="button"
              disabled={!canInstall || isDownloading || isInstalling}
              onClick={onInstall}
            >
              {isDownloading || isInstalling ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {isInstalling
                ? t("settings.aboutCockpit.installing")
                : t("settings.aboutCockpit.downloadInstall")}
            </Button>
          </div>
        </div>

        <div className="rounded-control bg-input-surface p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{t("settings.aboutCockpit.artifact")}</span>
            <span>{progressLabel}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-accent"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label={t("settings.aboutCockpit.progressAria")}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {status === "upToDate" ? (
          <InlineState tone="success" icon={<CheckCircle2 />}>
            {t("settings.aboutCockpit.upToDateMessage")}
          </InlineState>
        ) : null}
        {status === "unsupported" ? (
          <InlineState tone="warning" icon={<Info />}>
            {t("settings.aboutCockpit.unsupportedMessage")}
          </InlineState>
        ) : null}
        {error ? (
          <InlineState tone="error" icon={<Info />}>
            {error}
          </InlineState>
        ) : null}
        {hasUpdate && releaseNotes ? (
          <div className="rounded-control bg-input-surface p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {t("settings.aboutCockpit.releaseNotes")}
            </div>
            <p className="max-h-28 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {releaseNotes}
            </p>
          </div>
        ) : null}
      </div>
    </CockpitCard>
  );
}

function DiagnosticCard({
  dbPathDisplay,
  repoUrl,
}: {
  dbPathDisplay: string;
  repoUrl: string;
}) {
  const { t } = useTranslation();
  return (
    <CockpitCard
      icon={<Gauge />}
      title={t("settings.aboutCockpit.diagnosticsTitle")}
      description={t("settings.aboutCockpit.diagnosticsDesc")}
    >
      <div className="space-y-3">
        <DiagnosticRow
          icon={<Database />}
          label={t("settings.dbPath")}
          value={dbPathDisplay}
          mono
        />
        <DiagnosticRow
          icon={<Globe />}
          label={t("settings.repoUrl")}
          value={repoUrl}
          href={repoUrl}
          mono
        />
        <DiagnosticRow
          icon={<Cpu />}
          label={t("settings.aboutCockpit.buildTarget")}
          value={t("settings.aboutCockpit.windowsSupport")}
        />
        <DiagnosticRow
          icon={<ShieldCheck />}
          label={t("settings.aboutCockpit.channel")}
          value={t("settings.aboutCockpit.signingNote")}
        />
      </div>
    </CockpitCard>
  );
}

function TechStackCard() {
  const { t } = useTranslation();
  return (
    <CockpitCard
      icon={<Code2 />}
      title={t("settings.aboutCockpit.stackTitle")}
      description={t("settings.aboutCockpit.stackDesc")}
    >
      <div className="flex flex-wrap gap-2">
        {STACK_ITEMS.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-2 rounded-full bg-input-surface px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <Sparkles className="size-3 text-primary-text" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </CockpitCard>
  );
}

function HelpResourcesCard() {
  const { t } = useTranslation();
  const icons = [FileText, FileText, PackageCheck, Globe];

  return (
    <CockpitCard
      icon={<TerminalSquare />}
      title={t("settings.aboutCockpit.resourcesTitle")}
      description={t("settings.aboutCockpit.resourcesDesc")}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {HELP_RESOURCES.map((resource, index) => {
          const Icon = icons[index] ?? FileText;
          return (
            <a
              key={resource.key}
              href={resource.href}
              target="_blank"
              rel="noreferrer"
              className="group focus-ring rounded-control bg-input-surface p-4 text-sm transition-colors hover:bg-primary-tint"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <Icon
                    className="size-4 text-primary-text"
                    aria-hidden="true"
                  />
                  {t(`settings.aboutCockpit.resources.${resource.key}.title`)}
                </span>
                <ExternalLink
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t(`settings.aboutCockpit.resources.${resource.key}.desc`)}
              </p>
            </a>
          );
        })}
      </div>
    </CockpitCard>
  );
}

function CockpitCard({
  icon,
  title,
  description,
  children,
  "data-testid": testId,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  return (
    <section className="rounded-inner bg-accent p-5" data-testid={testId}>
      <div className="mb-4 flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-tint text-primary-text [&_svg]:size-5"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <h4 className="font-heading text-base font-semibold text-foreground">
            {title}
          </h4>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function MetaPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-foreground">
      <span
        className="[&_svg]:size-3.5 [&_svg]:text-primary-text"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function DiagnosticRow({
  icon,
  label,
  value,
  href,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  /** Machine-readable values (paths, URLs) render monospace; prose does not. */
  mono?: boolean;
}) {
  const content = href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring break-all rounded-control text-primary-text hover:underline"
    >
      {value}
    </a>
  ) : (
    <span className="break-all">{value}</span>
  );

  return (
    <div className="flex items-start gap-3 rounded-control bg-input-surface p-3">
      <span
        className="mt-0.5 text-primary-text [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-1 text-foreground",
            mono ? "font-mono text-ui-meta" : "text-sm",
          )}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

function InlineState({
  tone,
  icon,
  children,
}: {
  tone: "success" | "warning" | "error";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-control px-3 py-2 text-sm",
        statusSoftClass[tone],
      )}
    >
      <span className="mt-0.5 [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

const UPDATE_STATUS_TONE: Partial<Record<AppUpdateStatus, BadgeTone>> = {
  available: "success",
  upToDate: "info",
  unsupported: "warning",
  error: "destructive",
};

function StatusChip({
  status,
  label,
}: {
  status: AppUpdateStatus;
  label: string;
}) {
  const busy =
    status === "checking" ||
    status === "downloading" ||
    status === "installing";
  return (
    <Badge
      tone={UPDATE_STATUS_TONE[status] ?? "neutral"}
      icon={
        busy ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Activity />
        )
      }
    >
      {label}
    </Badge>
  );
}
