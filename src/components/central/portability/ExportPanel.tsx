import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Folder, FolderGit2, Layers, Loader2, Tags } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { BUNDLE_FILE_EXTENSION, defaultBundleFileName, formatBytes } from "@/lib/portabilityViewModel";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { ErrorNotice } from "./portabilityParts";

export function ExportPanel({
  targetLabel,
  summaryError,
  busy,
}: {
  targetLabel: string;
  summaryError: unknown;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const summary = useCentralSkillsStore((state) => state.portability.exportSummary);
  const lastExport = useCentralSkillsStore((state) => state.portability.lastExport);
  const job = useCentralSkillsStore((state) => state.portabilityJob);
  const exportPortableBundle = useCentralSkillsStore((state) => state.exportPortableBundle);
  const [error, setError] = useState<unknown>(null);

  const exportFailed = job.kind === "export" && (job.status === "failed" || job.status === "cancelled");

  async function handleExport() {
    setError(null);
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: defaultBundleFileName(targetLabel),
      filters: [{ name: "SkillPort", extensions: [BUNDLE_FILE_EXTENSION] }],
    });
    if (!path) return;
    try {
      await exportPortableBundle(path);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="space-y-4" data-testid="central-portability-export-panel">
      {summaryError ? <ErrorNotice error={summaryError} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          size="compact"
          icon={<Layers className="size-3.5" />}
          label={t("central.bundle.export.skills")}
          value={summary?.skills}
          loading={!summary && !summaryError}
          hint={
            summary
              ? t("central.bundle.export.githubHint", { count: summary.skillsWithGithubSource })
              : undefined
          }
        />
        <StatTile
          size="compact"
          tone="secondary"
          icon={<Tags className="size-3.5" />}
          label={t("central.bundle.export.organization")}
          value={summary ? summary.tags + summary.tagGroups + summary.savedViews : undefined}
          loading={!summary && !summaryError}
          hint={
            summary
              ? t("central.bundle.export.organizationHint", {
                  tags: summary.tags,
                  groups: summary.tagGroups,
                  views: summary.savedViews,
                })
              : undefined
          }
        />
        <StatTile
          size="compact"
          tone="neutral"
          icon={<FolderGit2 className="size-3.5" />}
          label={t("central.bundle.export.registries")}
          value={summary?.registries}
          loading={!summary && !summaryError}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("central.bundle.export.desc")}</p>

      {error && !exportFailed ? <ErrorNotice error={error} /> : null}
      {exportFailed && job.status === "failed" ? <ErrorNotice error={job.error ?? error} /> : null}
      {exportFailed && job.status === "cancelled" ? (
        <p className="text-sm text-muted-foreground">{t("central.bundle.export.cancelled")}</p>
      ) : null}

      {lastExport && job.kind === "export" && job.status === "completed" ? (
        <div
          className="space-y-2 rounded-control border border-border bg-primary-tint p-3 text-sm"
          data-testid="central-portability-export-done"
        >
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 text-primary-text" />
            {t("central.bundle.export.done", {
              count: lastExport.skillsExported,
              size: formatBytes(lastExport.bundleBytes),
            })}
          </div>
          {lastExport.skippedSkills.length > 0 ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 text-warning-foreground">
                <AlertTriangle className="size-3.5" />
                {t("central.bundle.export.skipped", { count: lastExport.skippedSkills.length })}
              </div>
              <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                {lastExport.skippedSkills.map((skill) => (
                  <li key={skill.id} className="truncate">
                    {skill.name} · {t(`central.bundle.skipReason.${skill.reason}`)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          data-testid="central-portability-export-save"
          onClick={() => void handleExport()}
          disabled={busy || !summary || summary.skills === 0}
        >
          {busy && job.kind === "export" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {t("central.bundle.export.action")}
        </Button>
      </div>
      {summary && summary.skills === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Folder className="size-3.5" />
          {t("central.bundle.export.empty")}
        </p>
      ) : null}
    </div>
  );
}
