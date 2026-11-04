import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

const SSH_SETTINGS_PATH = "/settings/connections?section=remote-targets";

function shortFailureTitle(message: string, label: string): string | undefined {
  const trimmed = message.trim();
  if (
    !trimmed ||
    trimmed === label ||
    /[\r\n]/.test(trimmed) ||
    trimmed.length > 160
  ) {
    return undefined;
  }
  return trimmed;
}

export function SshUnreachableFlag({ message }: { message: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = t("targets.reachability.unreachable");
  const title = shortFailureTitle(message, label);

  return (
    <Button
      type="button"
      variant="glass"
      className="tint-destructive text-destructive-text"
      title={title}
      onClick={() => navigate(SSH_SETTINGS_PATH)}
      data-testid="ssh-unreachable-flag"
    >
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

export function CentralSshReachabilityPanel({
  phase,
  onRetry,
}: {
  phase: "pending" | "checking" | "unreachable";
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pending = phase === "pending";
  const checking = phase === "checking";

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center"
      data-testid={
        pending
          ? "central-target-pending"
          : checking
            ? "central-ssh-reachability-checking"
            : "central-ssh-reachability-unreachable"
      }
    >
      <p className="text-sm font-medium text-foreground">
        {pending
          ? t("central.loading")
          : checking
            ? t("targets.reachability.checking")
            : t("targets.reachability.unreachable")}
      </p>
      {pending ? null : (
        <p className="max-w-sm text-sm text-muted-foreground">
          {checking
            ? t("central.sshReachability.checking")
            : t("central.sshReachability.unreachable")}
        </p>
      )}
      {pending || checking ? null : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="glass"
            onClick={onRetry}
            data-testid="central-ssh-reachability-retry"
          >
            {t("central.sshReachability.retry")}
          </Button>
          <Button
            type="button"
            variant="glass"
            onClick={() => navigate(SSH_SETTINGS_PATH)}
            data-testid="central-ssh-reachability-settings"
          >
            {t("central.sshReachability.openSettings")}
          </Button>
        </div>
      )}
    </div>
  );
}
