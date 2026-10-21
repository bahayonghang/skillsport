import { Folder, FolderOpen, Globe, Link2, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { ClaudeSourceKind } from "@/types";

// Skill-card source / origin capsules (DESIGN.md pill-status). Every chip is a
// <Badge>: 12% semantic tint + semantic text + leading line icon, so the origin
// never relies on colour alone. Central / Skills CLI links = lavender (info,
// "secondary data"), plugin = amber (locked / read-only source), standalone and
// read-only = neutral.

export function SourceChip({ label }: { label: string }) {
  // Publisher / repo id is a machine-readable value → mono (DESIGN.md Sans-Body).
  return (
    <span
      title={label}
      className="inline-flex h-5 max-w-full shrink-0 items-center rounded-pill bg-accent px-2 font-mono text-ui-meta leading-none text-muted-foreground"
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

export function SourceIndicator({
  sourceType,
  origin,
}: {
  sourceType: string;
  origin?: "central" | "standalone" | "skillsCli";
}) {
  const { t, i18n } = useTranslation();
  const resolved =
    origin ?? (sourceType === "symlink" ? "central" : "standalone");
  const isCli = resolved === "skillsCli";
  const isCentral = resolved === "central";
  const isNative = sourceType === "native";
  const primaryLabel = isCli
    ? t("platform.sourceSkillsCli")
    : isCentral
      ? t("platform.sourceCentral")
      : t("platform.sourceStandalone");
  const secondaryLabel = isCli
    ? t("platform.sourceSymlinkLabel")
    : isCentral
      ? t("platform.sourceSymlinkLabel")
      : isNative
        ? t("platform.sourceNativeLabel", {
            defaultValue: i18n.language.startsWith("zh") ? "原生" : "native",
          })
        : t("platform.sourceCopyLabel");

  return (
    <Badge
      tone={isCli || isCentral ? "info" : "neutral"}
      size="sm"
      icon={isCli || isCentral ? <Link2 /> : <FolderOpen />}
      title={`${primaryLabel} — ${secondaryLabel}`}
    >
      {primaryLabel}
    </Badge>
  );
}

export function PluginSourceChip() {
  const { t, i18n } = useTranslation();

  return (
    <Badge tone="warning" size="sm" icon={<Lock />}>
      {t("platform.originPlugin", {
        defaultValue: i18n.language.startsWith("zh")
          ? "插件来源"
          : "Plugin source",
      })}
    </Badge>
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
    <Badge
      tone={isPlugin ? "warning" : "info"}
      size="sm"
      icon={isPlugin ? <Lock /> : <Folder />}
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
    </Badge>
  );
}

export function ReadOnlyBadge() {
  const { t, i18n } = useTranslation();

  return (
    <Badge tone="neutral" size="sm" icon={<Lock />}>
      {t("platform.readOnly", {
        defaultValue: i18n.language.startsWith("zh") ? "只读" : "Read-only",
      })}
    </Badge>
  );
}

export function ProjectSourceBadge({
  originBadge,
}: {
  originBadge: { kind: "central" | "project" | string; label: string };
}) {
  const isCentral = originBadge.kind === "central";

  return (
    <Badge
      tone={isCentral ? "info" : "neutral"}
      size="sm"
      icon={isCentral ? <Globe /> : <Folder />}
    >
      {originBadge.label}
    </Badge>
  );
}
