import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SkillMarkdownRenderer } from "@/components/skill/SkillMarkdownRenderer";
import { RuleTargets } from "./RuleTargets";
import type { RuleDetail, RuleDraft, RuleTargetStatus, RuleTool } from "@/types/rules";
import { isRuleDraftDirty } from "@/stores/rulesStore";
import { cn } from "@/lib/utils";

export function RuleEditor({ detail, draft, saving, disabled, pendingTools, onEdit, onSave, onDelete, onToggle }: {
  detail: RuleDetail;
  draft?: RuleDraft;
  saving: boolean;
  disabled: boolean;
  pendingTools: Partial<Record<RuleTool, boolean>>;
  onEdit: (body: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onToggle: (target: RuleTargetStatus) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"body" | "preview" | "source">("body");
  const dirty = isRuleDraftDirty(draft);
  const editable = detail.compatibility === "supported" && !disabled;
  const body = draft?.body ?? detail.body;
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto" aria-label={t("rules.editorTitle")}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="break-all font-heading text-base font-semibold">{detail.name}
          </h2>
          <p role="status" className="mt-1 text-xs text-muted-foreground">{dirty ? t("rules.unsaved") : t("rules.saved")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" disabled={disabled || saving} onClick={onDelete}>
            <Trash2 aria-hidden />
            {t("common.delete")}
          </Button>
          <Button disabled={!editable || !dirty || saving} onClick={onSave}>
            <Save aria-hidden />{saving ? t("rules.saving") : t("common.save")}
          </Button>
        </div>
      </div>
      <div className="shrink-0 border-b border-border px-4 py-2">
        <div role="group" className="inline-flex flex-wrap gap-0.5 rounded-pill bg-accent p-0.5" aria-label={t("rules.viewMode")}>
          {(["body", "preview", "source"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={cn("focus-ring h-8 rounded-pill border px-3.5 text-sm transition-colors", mode === value ? "border-primary-stroke bg-primary-tint font-medium text-primary-text" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground")}>
              {t(`rules.modes.${value}`)}
            </button>
          ))}
        </div>
      </div>
      {draft && draft.revision !== detail.revision && <p className="shrink-0 border-b border-border bg-warning-tint px-4 py-2 text-xs text-warning-foreground">
        {t("rules.diskChanged")}
      </p>}
      {detail.compatibility !== "supported" && <p className="shrink-0 px-4 pt-3 text-xs text-warning-foreground">
        {t("rules.unsupportedHint")}
      </p>}
      <div className="min-h-56 flex-1 shrink-0 overflow-y-auto p-4">
        {mode === "body" ? (
          <Textarea aria-label={t("rules.bodyLabel")} value={body} disabled={!editable} onChange={(event) => onEdit(event.target.value)}
            onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (editable && dirty && !saving) onSave(); } }}
            className="h-full min-h-40 resize-none field-sizing-fixed font-mono text-sm leading-relaxed" />
        ) : mode === "preview" ? (
          <SkillMarkdownRenderer content={body} variant="compact" />
        ) : <pre aria-label={t("rules.sourceLabel")} className="whitespace-pre-wrap break-all rounded-inner bg-input-surface p-4 font-mono text-sm leading-relaxed">{detail.source}
        </pre>}
      </div>
      <RuleTargets targets={detail.targets} pending={pendingTools} disabled={disabled || saving || detail.compatibility !== "supported"} onToggle={onToggle} />
    </section>
  );
}
