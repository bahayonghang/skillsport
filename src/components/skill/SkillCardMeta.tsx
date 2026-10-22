import type { ReactNode } from "react";
import {
  AlertTriangle,
  Copy,
  Download,
  Folder,
  Globe,
  Info,
  Unlink2,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { PlatformIcon } from "@/components/platform/PlatformIcon";
import {
  PluginSourceChip,
  ProjectSourceBadge,
  ReadOnlyBadge,
  SourceChip,
  SourceIndicator,
} from "@/components/skill/SkillCardBadges";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { CentralSkillUpdateState, ClaudeSourceKind } from "@/types";

export interface SkillCardMetaProps {
  originKind?: ClaudeSourceKind;
  isReadOnly?: boolean;
  sourceType?: "symlink" | "copy" | "native";
  installOrigin?: "central" | "standalone" | "skillsCli";
  originBadge?: { kind: "central" | "project" | string; label: string };
  usageBadge?: number;
  isCentral?: boolean;
  platformBadge?: { id: string; name: string };
  projectBadge?: string;
  publisher?: string;
  updateStatus?: CentralSkillUpdateState & { isUpdating?: boolean };
  inventoryFlags?: { hasDuplicate: boolean; isOrphan: boolean } | undefined;
  inventorySkillId?: string;
  tags?: { key: string; label: string }[];
}

/**
 * Update status → Badge semantics (DESIGN.md Signature: UnifiedSkillCard):
 * update available / remote change = lavender (secondary); remote missing =
 * amber; failure = rose; anything else = neutral. Each carries an icon so the
 * state never relies on colour alone.
 */
function updateStatusBadge(status: CentralSkillUpdateState["status"]): {
  tone: BadgeTone;
  icon: ReactNode;
} {
  switch (status) {
    case "update_available":
      return { tone: "secondary", icon: <Download /> };
    case "error":
      return { tone: "destructive", icon: <XCircle /> };
    case "remote_missing":
      return { tone: "warning", icon: <AlertTriangle /> };
    default:
      return { tone: "neutral", icon: <Info /> };
  }
}

/**
 * Skill 卡片的 meta 行：徽章、publisher、tags 等次级信息，
 * 固定单行 nowrap 展示（溢出裁切），保证卡片整体高度是可预测的契约值——
 * 虚拟化网格按固定行高绝对定位，meta 折行会把卡片撑出行边界。
 */
export function SkillCardMeta({
  originKind,
  isReadOnly,
  sourceType,
  installOrigin,
  originBadge,
  usageBadge,
  isCentral,
  platformBadge,
  projectBadge,
  publisher,
  updateStatus,
  inventoryFlags,
  inventorySkillId,
  tags,
}: SkillCardMetaProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden empty:hidden">
      {originKind === "plugin" ? (
        <PluginSourceChip />
      ) : sourceType ? (
        <SourceIndicator sourceType={sourceType} origin={installOrigin} />
      ) : null}
      {isReadOnly && originKind !== "plugin" && <ReadOnlyBadge />}
      {originBadge && <ProjectSourceBadge originBadge={originBadge} />}

      {typeof usageBadge === "number" && usageBadge > 0 && (
        <Badge
          tone="neutral"
          size="sm"
          data-testid="usage-badge"
          title={t("skillUsage.badge.tooltip", {
            count: usageBadge,
            days: 30,
            defaultValue: `${usageBadge} calls in last 30 days`,
          })}
          className="tabular-nums"
        >
          <span>
            {t("skillUsage.badge.countShort", { count: usageBadge })}
          </span>
          <span aria-hidden="true"> · </span>
          <span>{t("skillUsage.badge.periodShort", { days: 30 })}</span>
        </Badge>
      )}

      {isCentral && (
        <Badge tone="primary" size="sm" icon={<Globe />}>
          {t("common.alreadyCentral")}
        </Badge>
      )}

      {platformBadge && (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <PlatformIcon agentId={platformBadge.id} className="size-3" />
          {platformBadge.name}
        </span>
      )}

      {projectBadge && (
        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Folder className="size-3 shrink-0" />
          <span className="truncate">{projectBadge}</span>
        </span>
      )}

      {publisher && <SourceChip label={publisher} />}

      {updateStatus && updateStatus.status !== "up_to_date" && (
        <Badge
          size="sm"
          {...updateStatusBadge(updateStatus.status)}
          title={updateStatus.error ?? undefined}
        >
          {t(`central.updateStatus.${updateStatus.status}`)}
        </Badge>
      )}

      {inventoryFlags?.hasDuplicate && (
        <Badge
          tone="warning"
          size="sm"
          icon={<Copy />}
          data-testid={
            inventorySkillId
              ? `skill-card-duplicate-badge-${inventorySkillId}`
              : undefined
          }
        >
          {t("central.updateCenter.badges.duplicate")}
        </Badge>
      )}
      {inventoryFlags?.isOrphan && (
        <Badge
          tone="warning"
          size="sm"
          icon={<Unlink2 />}
          data-testid={
            inventorySkillId
              ? `skill-card-orphan-badge-${inventorySkillId}`
              : undefined
          }
        >
          {t("central.updateCenter.badges.orphan")}
        </Badge>
      )}

      {tags && tags.length > 0 && (
        <div className="flex items-center gap-1">
          {tags.slice(0, 2).map((tag) => (
            <Badge key={tag.key} tone="neutral" size="sm" className="font-normal">
              {tag.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
