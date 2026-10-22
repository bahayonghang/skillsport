import { KeyRound, Loader2, ShieldCheck, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitHubPatState, SecretStorageState } from "@/types";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SecretValueInput } from "@/components/settings/SecretValueInput";
import { SettingsSection } from "@/components/settings/SettingsSection";

type GitHubPatMessage = {
  type: "success" | "error";
  text: string;
  detail?: string | null;
} | null;

interface GitHubPatSettingsSectionProps {
  githubPatState: GitHubPatState;
  githubPatInput: string;
  githubPatMessage: GitHubPatMessage;
  isLoadingGitHubPat: boolean;
  isSavingGitHubPat: boolean;
  isTestingGitHubPat: boolean;
  onClear: () => void;
  onInputChange: (value: string) => void;
  onSave: () => void;
  onTest: () => void;
}

export function GitHubPatSettingsSection({
  githubPatState,
  githubPatInput,
  githubPatMessage,
  isLoadingGitHubPat,
  isSavingGitHubPat,
  isTestingGitHubPat,
  onClear,
  onInputChange,
  onSave,
  onTest,
}: GitHubPatSettingsSectionProps) {
  const { t } = useTranslation();
  const storageLabel =
    githubPatState.configured || githubPatState.storageState === "unreadable"
      ? t(`settings.githubPatStorageState.${githubPatState.storageState}`)
      : t("settings.githubPatNotConfigured");
  const storageTone = githubPatStorageTone(githubPatState.storageState);
  const effectiveMessage = githubPatMessage;

  return (
    <SettingsSection
      sectionId="github-pat"
      title={t("settings.githubPatTitle")}
      description={t("settings.githubPatDesc")}
      icon={<KeyRound className="size-5 shrink-0 text-muted-foreground" />}
    >
      <div className="space-y-4">
        <div className="rounded-inner bg-accent p-3">
          <SecretValueInput
            id="github-pat"
            label={t("settings.githubPatLabel")}
            value={githubPatInput}
            configured={githubPatState.configured}
            disabled={isLoadingGitHubPat || isSavingGitHubPat}
            placeholder={t("settings.githubPatPlaceholder")}
            savedHiddenHint={t("settings.githubPatConfiguredNoReveal")}
            inputReplacementHint={t("settings.githubPatWillReplace")}
            onChange={onInputChange}
          />
        </div>

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <span className="inline-flex">
            <Badge tone={storageTone} icon={<ShieldCheck />}>
              {storageLabel}
            </Badge>
          </span>
          <span className="inline-flex">
            <Badge tone="secondary" icon={<Zap />}>
              {t("settings.githubPatRateLimitChip")}
            </Badge>
          </span>
          <span className="rounded-control bg-accent px-3 py-2 sm:col-span-2">
            {t("settings.githubPatDirectOnly")}
          </span>
          <span className="rounded-control bg-accent px-3 py-2">
            {t("settings.githubPatRateLimitHint")}
          </span>
          <span className="rounded-control bg-accent px-3 py-2">
            {t("settings.githubPatAppWideHint")}
          </span>
          {githubPatState.error ? (
            <span className="rounded-control bg-warning-tint px-3 py-2 text-warning-foreground sm:col-span-2">
              {t("settings.githubPatMigrationWarning")}
            </span>
          ) : null}
        </div>

        {effectiveMessage ? (
          <p
            className={
              effectiveMessage.type === "error"
                ? "text-sm text-destructive-text"
                : "text-sm text-success-foreground"
            }
            role="status"
          >
            {effectiveMessage.text}
            {effectiveMessage.detail ? (
              <span className="mt-1 block text-xs opacity-80">
                {effectiveMessage.detail}
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={onSave}
            disabled={
              isLoadingGitHubPat || isSavingGitHubPat || !githubPatInput.trim()
            }
          >
            {isSavingGitHubPat ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            <span>{t("common.save")}</span>
          </Button>
          <Button
            variant="glass"
            onClick={onClear}
            disabled={
              isLoadingGitHubPat ||
              isSavingGitHubPat ||
              !githubPatState.configured
            }
          >
            <span>{t("settings.githubPatClear")}</span>
          </Button>
          <Button
            variant="glass"
            onClick={onTest}
            disabled={
              isLoadingGitHubPat ||
              isSavingGitHubPat ||
              isTestingGitHubPat ||
              !githubPatState.configured ||
              Boolean(githubPatInput.trim())
            }
          >
            {isTestingGitHubPat ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            <span>{t("settings.githubPatTest")}</span>
          </Button>
          {isLoadingGitHubPat ? (
            <span className="text-xs text-muted-foreground">
              {t("settings.loading")}
            </span>
          ) : null}
        </div>
      </div>
    </SettingsSection>
  );
}

function githubPatStorageTone(state: SecretStorageState): BadgeTone {
  switch (state) {
    case "stored":
      return "success";
    case "session":
      return "warning";
    case "unreadable":
      return "destructive";
    case "missing":
    default:
      return "neutral";
  }
}
