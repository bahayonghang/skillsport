import type { TFunction } from "i18next";

import { Checkbox } from "@/components/ui/checkbox";
import type { ClearCentralAgentRef } from "@/lib/centralClearAll";
import type { ClearCentralAgentSummary } from "@/types/centralClear";

/** Per-agent aggregate rows; never one row per skill. */
export function ClearAgentTable({
  t,
  summaries,
  agents,
  removeCopyAgentIds,
  disabled,
  onToggleCopy,
}: {
  t: TFunction;
  summaries: readonly ClearCentralAgentSummary[];
  agents: readonly ClearCentralAgentRef[];
  removeCopyAgentIds: readonly string[];
  disabled: boolean;
  onToggleCopy: (agentId: string, checked: boolean) => void;
}) {
  const rows = summaries.filter(
    (row) => row.linkCount + row.copyCount + row.orphanLinkCount > 0,
  );
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="central-clear-all-no-agents">
        {t("central.clearAll.noAgentRows")}
      </p>
    );
  }
  const nameById = new Map(agents.map((agent) => [agent.id, agent.display_name]));
  const selected = new Set(removeCopyAgentIds);

  return (
    <div className="glass-panel max-h-56 overflow-auto rounded-card">
      <table className="w-full text-xs" data-testid="central-clear-all-agent-table">
        <caption className="sr-only">{t("central.clearAll.agentTableCaption")}</caption>
        <thead className="text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("central.clearAll.agentColumn")}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t("central.clearAll.linkColumn")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("central.clearAll.copyColumn")}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t("central.clearAll.orphanColumn")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = nameById.get(row.agentId) ?? row.agentId;
            return (
              <tr
                key={row.agentId}
                className="border-t border-border"
                data-testid={`central-clear-all-agent-${row.agentId}`}
              >
                <th scope="row" className="max-w-40 truncate px-3 py-1.5 text-left font-medium">
                  {name}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.linkCount}</td>
                <td className="px-3 py-1.5">
                  {row.copyCount > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{row.copyCount}</span>
                      <Checkbox
                        checked={selected.has(row.agentId)}
                        disabled={disabled}
                        onCheckedChange={(value) => onToggleCopy(row.agentId, !!value)}
                        aria-label={t("central.clearAll.copyRemoveAria", { agent: name })}
                      />
                      <span className="text-muted-foreground" aria-hidden>
                        {t("central.clearAll.copyRemoveLabel")}
                      </span>
                    </div>
                  ) : (
                    <span className="tabular-nums">0</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.orphanLinkCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
