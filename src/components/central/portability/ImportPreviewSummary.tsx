import { AlertTriangle, FileArchive } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { STATUS_TONE, type DecisionCounts } from "@/lib/portabilityViewModel";
import type {
  PortableBundleImportPreview,
  PortableBundleMetadataCounts,
  PortableBundleSkillStatus,
} from "@/types";

const STATUS_ORDER: PortableBundleSkillStatus[] = [
  "new",
  "changed",
  "exists_unmanaged",
  "identical",
  "invalid",
];

const METADATA_KEYS = ["registries", "tagGroups", "tags", "savedViews"] as const;

function fileName(path: string | null) {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function ImportPreviewSummary({
  preview,
  path,
  counts,
  activeTargetKind,
}: {
  preview: PortableBundleImportPreview;
  path: string | null;
  counts: DecisionCounts;
  activeTargetKind: string;
}) {
  const { t } = useTranslation();
  const created = new Date(preview.createdAt);
  const createdLabel = Number.isNaN(created.getTime())
    ? preview.createdAt
    : created.toLocaleString();
  const crossKind = preview.originTargetKind !== activeTargetKind;

  return (
    <div className="space-y-3" data-testid="central-portability-preview-summary">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <FileArchive className="size-3.5 shrink-0" />
          <span className="truncate">{fileName(path)}</span>
        </span>
        <span>
          {t("central.bundle.import.origin", {
            kind: t(`central.bundle.targetKind.${preview.originTargetKind}`, {
              defaultValue: preview.originTargetKind,
            }),
            date: createdLabel,
            version: preview.appVersion,
          })}
        </span>
      </div>
      {crossKind ? (
        <p className="text-xs text-muted-foreground">{t("central.bundle.import.crossTarget")}</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {STATUS_ORDER.filter((status) => counts.byStatus[status] > 0).map((status) => (
          <Badge key={status} tone={STATUS_TONE[status]} data-testid={`central-portability-count-${status}`}>
            {t(`central.bundle.status.${status}`)} · {counts.byStatus[status]}
          </Badge>
        ))}
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-4">
        {METADATA_KEYS.map((key) => {
          const value: PortableBundleMetadataCounts = preview.metadata[key];
          return (
            <div key={key} className="rounded-inner bg-accent px-2.5 py-2">
              <div className="text-muted-foreground">{t(`central.bundle.metadata.${key}`)}</div>
              <div className="mt-0.5 tabular-nums text-foreground">
                {t("central.bundle.metadata.counts", {
                  add: value.add,
                  update: value.update,
                  exists: value.exists,
                })}
              </div>
            </div>
          );
        })}
      </div>

      {preview.bundleSkippedSkills.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
          <AlertTriangle className="size-3.5" />
          {t("central.bundle.import.bundleSkipped", { count: preview.bundleSkippedSkills.length })}
        </p>
      ) : null}
    </div>
  );
}
