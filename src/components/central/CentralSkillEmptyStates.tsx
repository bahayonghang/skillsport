import { Blocks, FolderOpen, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { BROWSER_PLATFORM_PATHS, getPlatformSkillFilePath } from "@/lib/platformPathPolicy";

export function CentralSkillEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
      <div className="rounded-full bg-accent p-4">
        <Blocks className="size-12 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground font-medium">{message}</p>
    </div>
  );
}

export function CentralSkillFirstVisitEmptyState() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const exampleSkillPath = getPlatformSkillFilePath(
    BROWSER_PLATFORM_PATHS,
    "central",
    "my-skill"
  );

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-16 text-center px-8">
      <div className="rounded-full bg-primary-tint p-5">
        <Blocks className="size-14 text-primary-text" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{t("empty.welcomeTitle")}</h2>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          {t("empty.welcomeDesc")}
        </p>
      </div>
      <div className="flex flex-col gap-3 items-center">
        <div className="glass-panel flex max-w-xs items-center gap-2 rounded-inner px-4 py-3 text-left text-xs text-muted-foreground">
          <FolderOpen className="size-4 shrink-0 text-primary-text" />
          <span>
            {t("empty.createHint")}{" "}
            <code className="font-mono">{exampleSkillPath}</code>
          </span>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate("/settings")}
          className="gap-2"
        >
          <Settings className="size-4" />
          {t("empty.goToSettings")}
        </Button>
      </div>
    </div>
  );
}
