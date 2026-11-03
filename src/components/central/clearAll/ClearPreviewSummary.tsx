import { Blocks, FolderGit2, Link2, Unlink } from "lucide-react";
import type { TFunction } from "i18next";

import { StatTile } from "@/components/ui/stat-tile";
import type { ClearCentralPreview } from "@/types/centralClear";

export function ClearPreviewSummary({
  t,
  preview,
}: {
  t: TFunction;
  preview: ClearCentralPreview;
}) {
  const agentLinks = preview.agentSummaries.reduce(
    (sum, summary) => sum + summary.linkCount,
    0,
  );
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      data-testid="central-clear-all-summary"
    >
      <StatTile
        size="compact"
        tone="primary"
        icon={<Blocks />}
        label={t("central.clearAll.statSkills")}
        value={preview.skillIds.length}
      />
      <StatTile
        size="compact"
        tone="secondary"
        icon={<Link2 />}
        label={t("central.clearAll.statAgentLinks")}
        value={agentLinks}
      />
      <StatTile
        size="compact"
        tone="neutral"
        icon={<FolderGit2 />}
        label={t("central.clearAll.statProjectLinks")}
        value={preview.projectLinkCount}
      />
      <StatTile
        size="compact"
        tone="neutral"
        icon={<Unlink />}
        label={t("central.clearAll.statOrphanLinks")}
        value={preview.orphanLinkCount}
      />
    </div>
  );
}
