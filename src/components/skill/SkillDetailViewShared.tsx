import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Check, Code, FileText, Lock } from "lucide-react";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { cn } from "@/lib/utils";
import {
  getPlatformTargetLabel,
  getPlatformTargetMemberNames,
} from "@/lib/platformTargetGroups";
import type { AgentWithStatus, ClaudeSourceKind } from "@/types";
import type { PreviewTab } from "./skillDetailViewTypes";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-xs font-semibold text-muted-foreground">
      {children}
    </div>
  );
}

export function MetadataRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="flex min-w-0 items-start gap-1.5 break-all font-mono text-xs leading-relaxed text-foreground">
        {icon}
        <span className="min-w-0 break-all">{value}</span>
      </div>
    </div>
  );
}

export function SourceOriginBadge({
  originKind,
}: {
  originKind: ClaudeSourceKind;
}) {
  const { t, i18n } = useTranslation();
  const isPlugin = originKind === "plugin";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
        isPlugin
          ? "bg-warning-tint text-warning-foreground ring-warning/20"
          : "bg-info/10 text-info-foreground ring-info/20",
      )}
    >
      {isPlugin
        ? t("platform.originPlugin", {
            defaultValue: i18n.language.startsWith("zh")
              ? "插件来源"
              : "Plugin source",
          })
        : t("platform.originUser", {
            defaultValue: i18n.language.startsWith("zh")
              ? "用户来源"
              : "User source",
          })}
    </span>
  );
}

export function ReadOnlySourceBadge() {
  const { t, i18n } = useTranslation();

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Lock className="size-3 shrink-0" />
      {t("detail.readOnlySource", {
        defaultValue: i18n.language.startsWith("zh")
          ? "只读来源"
          : "Read-only source",
      })}
    </span>
  );
}

interface PlatformToggleIconProps {
  agent: AgentWithStatus;
  skillName: string;
  isInstalled: boolean;
  isLoading: boolean;
  isLocked: boolean;
  onToggle: () => void;
}

export function PlatformToggleIcon({
  agent,
  skillName,
  isInstalled,
  isLoading,
  isLocked,
  onToggle,
}: PlatformToggleIconProps) {
  const { t } = useTranslation();
  const displayName = getPlatformTargetLabel(agent, t, "short");
  const memberNames = getPlatformTargetMemberNames(agent).join(", ");
  const title = isLocked
    ? `${displayName} - ${t("platformTargets.alwaysIncluded")} - ${memberNames}`
    : `${displayName}${isInstalled ? ` - ${t("central.linked")}` : ""}`;

  return (
    <button
      className={cn(
        "relative cursor-pointer rounded-control p-1.5 transition-colors focus-ring",
        isLocked
          ? "cursor-default text-primary-text"
          : isInstalled
            ? "text-primary-text hover:bg-primary/15"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        isLoading && "pointer-events-none animate-pulse",
      )}
      title={title}
      data-install-state={isLocked ? "locked" : isInstalled ? "installed" : "uninstalled"}
      aria-pressed={isInstalled}
      aria-busy={isLoading}
      aria-label={
        isLocked
          ? title
          : t("central.toggleInstallLabel", {
              platform: displayName,
              skill: skillName,
            })
      }
      disabled={isLoading || isLocked}
      onClick={onToggle}
    >
      <PlatformIcon agentId={agent.id} className="size-4 shrink-0" size={16} />
      {isLocked ? (
        <Lock
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-popover text-primary-text"
        />
      ) : isInstalled ? (
        <Check
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-popover text-success-foreground"
        />
      ) : null}
    </button>
  );
}

interface TabToggleProps {
  activeTab: PreviewTab;
  onChange: (tab: PreviewTab) => void;
}

export function TabToggle({ activeTab, onChange }: TabToggleProps) {
  const { t } = useTranslation();

  return (
    <div role="tablist" className="flex shrink-0 gap-0.5 rounded-full bg-accent p-0.5">
      <button
        role="tab"
        aria-selected={activeTab === "markdown"}
        onClick={() => onChange("markdown")}
        className={cn(
          "focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          activeTab === "markdown"
            ? "bg-popover text-foreground ring-1 ring-glass-hairline"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <FileText className="size-3.5" />
        {t("detail.markdown")}
      </button>
      <button
        role="tab"
        aria-selected={activeTab === "raw"}
        onClick={() => onChange("raw")}
        className={cn(
          "focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          activeTab === "raw"
            ? "bg-popover text-foreground ring-1 ring-glass-hairline"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Code className="size-3.5" />
        {t("detail.rawSource")}
      </button>
      <button
        role="tab"
        aria-selected={activeTab === "explanation"}
        onClick={() => onChange("explanation")}
        className={cn(
          "focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          activeTab === "explanation"
            ? "bg-popover text-foreground ring-1 ring-glass-hairline"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Bot className="size-3.5" />
        {t("detail.aiExplanation")}
      </button>
    </div>
  );
}

export const inspectorCardClassName =
  "min-w-0 space-y-3 overflow-x-hidden rounded-inner bg-accent p-3";
export const inspectorFieldLabelClassName =
  "text-xs font-medium text-muted-foreground";
export const inspectorSelectClassName =
  "w-full min-w-0 rounded-control border border-input bg-input-surface px-2 py-1.5 text-xs focus-visible:border-ring focus-ring";
export const inspectorActionButtonClassName = "w-full justify-center";
