import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Loader2, Server, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useTargetStore } from "@/stores/targetStore";
import { isRemoteLikeTarget, isWslTarget } from "@/lib/targetKind";
import { cn } from "@/lib/utils";
import type { TargetSummary } from "@/types";

/**
 * TopBar target switcher on the shared `ui/menu` (L3 `.glass-overlay`). The
 * open state is controlled so a failed switch keeps the menu open with the
 * store error visible; base-ui owns Escape, outside press, arrow keys and
 * focus return to the trigger.
 */
export function TargetQuickSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const targets = useTargetStore((s) => s.targets);
  const activeTarget = useTargetStore((s) => s.activeTarget);
  const switchingTargetId = useTargetStore((s) => s.switchingTargetId);
  const switchTarget = useTargetStore((s) => s.switchTarget);
  const error = useTargetStore((s) => s.error);
  const clearError = useTargetStore((s) => s.clearError);

  const [open, setOpen] = useState(false);

  function describeTarget(target: TargetSummary): string {
    if (target.kind === "local") return t("targets.localDescription");
    if (isWslTarget(target)) {
      return `${t("targets.kind.wsl")} - ${target.distribution || t("common.unknown")}`;
    }
    const auth =
      target.authMethod === "password"
        ? t("targets.authPassword")
        : t("targets.authKey");
    const host = `${target.username ?? ""}@${target.host ?? ""}:${target.port ?? 22}`;
    return `${auth} - ${host}`;
  }

  function triggerLabel(): string {
    if (isRemoteLikeTarget(activeTarget)) return activeTarget.label;
    return t("targets.local");
  }

  async function handleSelect(targetId: string) {
    if (targetId === activeTarget.id) {
      setOpen(false);
      return;
    }
    if (switchingTargetId) return;
    if (error) clearError();
    try {
      await switchTarget(targetId);
      setOpen(false);
    } catch {
      // store keeps the error; menu stays open so user can retry
    }
  }

  function handleManage() {
    setOpen(false);
    navigate("/settings");
  }

  const isActiveRemote = isRemoteLikeTarget(activeTarget);

  return (
    <Menu open={open} onOpenChange={setOpen} modal={false}>
      <MenuTrigger
        aria-label={t("targets.quickSwitch.trigger")}
        title={
          activeTarget.kind === "ssh"
            ? `${activeTarget.username ?? ""}@${activeTarget.host ?? ""}`
            : isWslTarget(activeTarget)
              ? activeTarget.distribution ?? activeTarget.label
              : t("targets.local")
        }
        className={cn(
          buttonVariants({ variant: "glass", size: "sm" }),
          "z-10 hidden max-w-44 sm:inline-flex",
          // Remote-like target: mint tint over the glass capsule fill plus a
          // mint stroke — the Server icon and label carry the state too.
          isActiveRemote &&
            "tint-primary border-primary-stroke text-primary-text",
        )}
      >
        <Server className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{triggerLabel()}</span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </MenuTrigger>

      <MenuContent align="end" className="w-72">
        {targets.map((target) => {
          const isActive = target.id === activeTarget.id || target.isActive;
          const isSwitching = switchingTargetId === target.id;
          const otherSwitching = Boolean(switchingTargetId) && !isSwitching;
          return (
            <MenuItem
              key={target.id}
              closeOnClick={false}
              disabled={isSwitching || otherSwitching}
              onClick={() => void handleSelect(target.id)}
              className={cn(
                "items-start gap-2 py-2",
                isActive && "tint-primary",
              )}
            >
              <Server
                className={cn(
                  "mt-0.5 size-3.5",
                  isActive ? "text-primary-text" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {target.kind === "local"
                      ? t("targets.local")
                      : target.label}
                  </span>
                  {isActive && (
                    <Badge size="sm" tone="primary">
                      {t("targets.active")}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate text-ui-meta text-muted-foreground">
                  {describeTarget(target)}
                </div>
              </div>
              <div className="flex items-center pl-1 pt-0.5">
                {isSwitching ? (
                  <Loader2
                    className="size-3.5 animate-spin text-primary-text"
                    aria-hidden="true"
                  />
                ) : !isActive ? (
                  <span className="text-ui-meta text-muted-foreground">
                    {t("targets.quickSwitch.useThis")}
                  </span>
                ) : null}
              </div>
            </MenuItem>
          );
        })}

        {targets.length <= 1 && (
          <div className="px-2.5 py-2 text-ui-meta text-muted-foreground">
            {t("targets.quickSwitch.empty")}
          </div>
        )}

        {error && (
          <div role="alert" className="px-2.5 pb-2 text-xs text-destructive-text">
            {error}
          </div>
        )}

        <MenuSeparator />
        <MenuItem
          onClick={handleManage}
          className="text-xs text-muted-foreground data-[highlighted]:text-foreground"
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
          {t("targets.quickSwitch.manage")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
