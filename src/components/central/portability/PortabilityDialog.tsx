import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { targetDisplayLabel } from "@/lib/portabilityViewModel";
import { cn } from "@/lib/utils";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { useTargetStore } from "@/stores/targetStore";
import { ExportPanel } from "./ExportPanel";
import { ImportPanel } from "./ImportPanel";
import { JobProgress, TargetBadge } from "./portabilityParts";

type TabId = "export" | "import";

export function PortabilityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const activeTarget = useTargetStore((state) => state.activeTarget);
  const job = useCentralSkillsStore((state) => state.portabilityJob);
  const loadSummary = useCentralSkillsStore((state) => state.loadPortabilityExportSummary);
  const cancelJob = useCentralSkillsStore((state) => state.cancelPortabilityJob);
  const resetDialog = useCentralSkillsStore((state) => state.resetPortabilityDialog);
  const [tab, setTab] = useState<TabId>(() => (job.kind && job.kind !== "export" ? "import" : "export"));
  const [summaryError, setSummaryError] = useState<unknown>(null);

  const busy = job.status === "running" || job.status === "cancelling";
  const targetLabel = targetDisplayLabel(activeTarget, t);

  useEffect(() => {
    if (!open) return;
    setSummaryError(null);
    loadSummary().catch(setSummaryError);
  }, [open, loadSummary, activeTarget.id]);

  function handleOpenChange(next: boolean) {
    if (!next) resetDialog();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-testid="central-portability-dialog">
        <DialogHeader>
          <DialogTitle>{t("central.portabilityTitle")}</DialogTitle>
          <DialogDescription>{t("central.bundle.desc")}</DialogDescription>
          <TargetBadge
            label={
              tab === "export"
                ? t("central.portabilityExportTarget")
                : t("central.portabilityImportTarget")
            }
            target={targetLabel}
          />
          <DialogClose />
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="inline-flex rounded-control border border-border bg-accent p-1" role="tablist">
            {(["export", "import"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-testid={`central-portability-${id}-tab`}
                className={cn(
                  "focus-ring inline-flex items-center gap-2 rounded-control px-3 py-1.5 text-sm",
                  tab === id ? "bg-popover" : "text-muted-foreground",
                )}
                onClick={() => setTab(id)}
              >
                {id === "export" ? <Download className="size-4" /> : <Upload className="size-4" />}
                {id === "export" ? t("central.portabilityExportTab") : t("central.portabilityImportTab")}
              </button>
            ))}
          </div>

          {busy ? <JobProgress job={job} onCancel={() => void cancelJob().catch(() => {})} /> : null}

          {tab === "export" ? (
            <ExportPanel targetLabel={activeTarget.label} summaryError={summaryError} busy={busy} />
          ) : (
            <ImportPanel busy={busy} activeTargetKind={activeTarget.kind} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
