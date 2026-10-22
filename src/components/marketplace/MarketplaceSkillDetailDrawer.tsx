import type { RefObject } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SkillDetailModalShell } from "@/components/skill/SkillDetailModalShell";
import { SkillDetailFileTree } from "@/components/skill/SkillDetailFileTree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isTauriRuntime } from "@/lib/ipc";
import { MarketplaceSkillDetailContent } from "./MarketplaceSkillDetailContent";
import { MarketplaceSkillDetailSummary } from "./MarketplaceSkillDetailSummary";
import type { MarketplaceSkillDetail } from "./marketplaceSkillDetailTypes";
import { useMarketplaceSkillDetailViewModel } from "./marketplaceSkillDetailViewModel";

export type { MarketplaceSkillDetail } from "./marketplaceSkillDetailTypes";

interface MarketplaceSkillDetailDrawerProps {
  open: boolean;
  skill: MarketplaceSkillDetail | null;
  onOpenChange: (open: boolean) => void;
  onInstall: () => void;
  isInstalling: boolean;
  onAfterCloseFocus?: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function MarketplaceSkillDetailDrawer({
  open,
  skill,
  onOpenChange,
  onInstall,
  isInstalling,
  onAfterCloseFocus,
  returnFocusRef,
}: MarketplaceSkillDetailDrawerProps) {
  const { t } = useTranslation();
  const browserMode = !isTauriRuntime();
  const titleId = skill ? `marketplace-detail-title-${skill.id}` : undefined;
  const isSkillsShDetail = skill?.remoteKind === "skills_sh";
  const installLabel = isSkillsShDetail
    ? skill?.installed
      ? t("marketplace.skillsShAddedToCentral")
      : isInstalling
        ? t("marketplace.skillsShAddingToCentral")
        : t("marketplace.skillsShAddToCentral")
    : skill?.installed
      ? t("marketplace.installed")
      : t("marketplace.install");
  const {
    content,
    contentError,
    displayContent,
    explanation,
    explanationError,
    fileTree,
    handleExplain,
    isExplaining,
    isFileTreeLoading,
    isLoadingContent,
    openFileTreePath,
    retryContent,
    resolvedDownloadUrl,
    selectedFilePath,
    setViewMode,
    viewMode,
  } = useMarketplaceSkillDetailViewModel({
    open,
    skill,
    onAfterCloseFocus,
  });

  return (
    <SkillDetailModalShell
      open={open}
      onOpenChange={onOpenChange}
      returnFocusRef={returnFocusRef}
      titleId={titleId}
      headerActions={
        skill ? (
          <Button onClick={onInstall} disabled={isInstalling || skill.installed} size="sm">
            {isInstalling ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : skill.installed ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <FileText className="size-3.5" />
            )}
            <span>{installLabel}</span>
          </Button>
        ) : undefined
      }
    >
      {skill ? (
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-6 py-3 flex items-center gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 id={titleId} className="text-lg font-semibold truncate">
                  {skill.name}
                </h1>
                {skill.installed ? (
                  <Badge tone="success" icon={<CheckCircle2 />}>
                    {t("marketplace.installed")}
                  </Badge>
                ) : null}
              </div>
              {skill.description ? (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {skill.description}
                </p>
              ) : null}
            </div>
            <Badge icon={<FileText />}>{t("detail.preview")}</Badge>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="flex h-full flex-col md:flex-row" data-testid="skill-detail-two-column-layout">
              <div className="scrollbar-subtle flex-1 min-w-0 overflow-auto p-6 space-y-4">
                <MarketplaceSkillDetailSummary
                  skill={skill}
                  downloadUrl={resolvedDownloadUrl}
                />
                <MarketplaceSkillDetailContent
                  browserMode={browserMode}
                  content={content}
                  contentError={contentError}
                  displayContent={displayContent}
                  explanation={explanation}
                  explanationError={explanationError}
                  isExplaining={isExplaining}
                  isLoadingContent={isLoadingContent}
                  onExplain={handleExplain}
                  onRetryContent={retryContent}
                  onViewModeChange={setViewMode}
                  variant="drawer"
                  viewMode={viewMode}
                />
              </div>

              <aside
                data-testid="skill-detail-right-sidebar"
                className="w-full shrink-0 border-t border-border overflow-y-auto p-4 space-y-5 md:w-64 md:border-t-0 md:border-l"
              >
                <section>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    {t("detail.metadata")}
                  </div>
                  <div className="space-y-2.5">
                    {skill.remoteKind === "skills_sh" ? (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">
                          {t("marketplace.skillsShInstallSource")}
                        </div>
                        <div className="break-all font-mono text-ui-meta leading-relaxed text-foreground">
                          {skill.source}/{skill.skillId}
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">
                        {t("marketplace.previewSourceLabel")}
                      </div>
                      <div className="inline-flex items-center gap-1 break-all text-sm leading-relaxed text-foreground">
                        <Store className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{skill.sourceLabel ?? skill.publisher ?? t("marketplace.previewUnknownSource")}</span>
                      </div>
                    </div>
                    {skill.publisher ? (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">
                          {t("marketplace.previewPublisher")}
                        </div>
                        <div className="inline-flex items-center gap-1 break-all font-mono text-ui-meta leading-relaxed text-foreground">
                          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
                          <span>{skill.publisher}</span>
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">
                        {t("marketplace.previewRuntime")}
                      </div>
                      <div className="inline-flex items-center gap-1 break-all text-sm leading-relaxed text-foreground">
                        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{browserMode ? t("marketplace.previewModeBrowser") : t("marketplace.previewModeDesktop")}</span>
                      </div>
                    </div>
                  </div>
                </section>

                {skill.remoteKind === "skills_sh" ? (
                  <section>
                    <SkillDetailFileTree
                      entries={fileTree}
                      isLoading={isFileTreeLoading}
                      onOpenPath={openFileTreePath}
                    />
                    {selectedFilePath ? (
                      <div className="mt-2 break-all font-mono text-ui-meta text-muted-foreground">
                        {selectedFilePath}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <section>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    {t("detail.installStatus")}
                  </div>
                  <Button onClick={onInstall} disabled={isInstalling || skill.installed} className="w-full">
                    {isInstalling ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : skill.installed ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <FileText className="size-3.5" />
                    )}
                    <span>{installLabel}</span>
                  </Button>
                </section>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </SkillDetailModalShell>
  );
}
