import type { RefObject } from "react";
import {
  ChevronLeft,
  Download,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Search,
  Store,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { GitHubRepoImportWizard } from "@/components/marketplace/GitHubRepoImportWizard";
import { MarketplaceSkillDetailDrawer } from "@/components/marketplace/MarketplaceSkillDetailDrawer";
import type { MarketplaceSkillDetail } from "@/components/marketplace/marketplaceSkillDetailTypes";
import { UnifiedSkillCard } from "@/components/skill/UnifiedSkillCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  ALL_TAGS,
  OFFICIAL_PUBLISHERS,
  TAG_LABELS,
  type OfficialPublisher,
  type SkillTag,
} from "@/data/officialSources";
import { cn } from "@/lib/utils";
import type {
  MarketplacePreviewSkill,
  MarketplacePreviewStatus,
  MarketplaceTabId,
  MarketplaceViewModel,
} from "@/pages/marketplaceViewModel";
import type { GitHubImportState } from "@/stores/marketplaceStore.types";
import type {
  BatchInstallResult,
  GitHubRepoImportResult,
  GitHubSkillImportSelection,
  SkillsShSkill,
} from "@/types";

interface PublisherCardProps {
  onClick: () => void;
  publisher: OfficialPublisher;
}

function PublisherCard({ publisher, onClick }: PublisherCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-panel glass-panel-hover focus-ring flex w-full cursor-pointer items-center gap-3 rounded-card p-3 text-left"
    >
      <div className="shrink-0 rounded-control bg-primary-tint p-2 text-primary-text">
        <Store className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{publisher.name}</div>
        <div className="text-xs text-muted-foreground">
          {publisher.totalSkills} skills · {publisher.repos.length} repo
          {publisher.repos.length > 1 ? "s" : ""}
        </div>
      </div>
      <ChevronLeft
        className="size-4 shrink-0 rotate-180 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

interface MarketplaceShellProps {
  activeTab: MarketplaceTabId;
  detailSkill: MarketplaceSkillDetail | null;
  detailTriggerRef: RefObject<HTMLElement | null>;
  githubImport: GitHubImportState;
  githubBranch: string;
  githubRepoUrl: string;
  installingIds: Set<string>;
  isGitHubImportOpen: boolean;
  isPreviewLoading: boolean;
  isSkillsShLoading: boolean;
  lang: string;
  onAfterImportSuccess: () => Promise<void>;
  onGitHubImport: (
    selections: GitHubSkillImportSelection[]
  ) => Promise<GitHubRepoImportResult>;
  onGitHubPreview: (
    branch: string
  ) => Promise<import("@/types").GitHubRepoPreview | null>;
  onInstallFromSource: (skillId: string) => Promise<void>;
  onInstallImportedSkill: (
    skillId: string,
    agentIds: string[],
    method: "symlink" | "copy"
  ) => Promise<BatchInstallResult>;
  onInstallPreviewSkill: (skill: MarketplacePreviewSkill) => Promise<void>;
  onInstallSkillsSh: (source: string, skillId: string) => Promise<void>;
  onOpenDetailSkill: (
    skill: MarketplaceSkillDetail,
    trigger?: EventTarget | null
  ) => void;
  onPreviewRepo: (
    repoFullName: string,
    repoUrl: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<void>;
  onResetGitHubImport: () => void;
  onSearchSkillsSh: (query: string) => Promise<SkillsShSkill[]>;
  previewInstallingIds: Set<string>;
  previewRepo: string | null;
  previewSkills: MarketplacePreviewSkill[];
  previewStatus: MarketplacePreviewStatus;
  publisherSearch: string;
  recommendedSearch: string;
  selectedPublisher: OfficialPublisher | null;
  selectedTag: SkillTag | null;
  setActiveTab: (tab: MarketplaceTabId) => void;
  setDetailSkill: (skill: MarketplaceSkillDetail | null) => void;
  setGithubBranch: (value: string) => void;
  setGithubRepoUrl: (value: string) => void;
  setIsGitHubImportOpen: (open: boolean) => void;
  setPublisherSearch: (value: string) => void;
  setRecommendedSearch: (value: string) => void;
  setSelectedPublisher: (publisher: OfficialPublisher | null) => void;
  setSelectedTag: (tag: SkillTag | null) => void;
  skillsShError: string | null;
  skillsShQuery: string;
  skillsShResults: SkillsShSkill[];
  viewModel: MarketplaceViewModel;
}

export function MarketplaceShell({
  activeTab,
  detailSkill,
  detailTriggerRef,
  githubImport,
  githubBranch,
  githubRepoUrl,
  installingIds,
  isGitHubImportOpen,
  isPreviewLoading,
  isSkillsShLoading,
  lang,
  onAfterImportSuccess,
  onGitHubImport,
  onGitHubPreview,
  onInstallFromSource,
  onInstallImportedSkill,
  onInstallPreviewSkill,
  onInstallSkillsSh,
  onOpenDetailSkill,
  onPreviewRepo,
  onResetGitHubImport,
  onSearchSkillsSh,
  previewInstallingIds,
  previewRepo,
  previewSkills,
  previewStatus,
  publisherSearch,
  recommendedSearch,
  selectedPublisher,
  selectedTag,
  setActiveTab,
  setDetailSkill,
  setGithubBranch,
  setGithubRepoUrl,
  setIsGitHubImportOpen,
  setPublisherSearch,
  setRecommendedSearch,
  setSelectedPublisher,
  setSelectedTag,
  skillsShError,
  skillsShQuery,
  skillsShResults,
  viewModel,
}: MarketplaceShellProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-4 px-6 pt-6 pb-2">
        <PageHeader
          title={t("marketplace.title")}
          meta={t("marketplace.desc")}
          actions={
            <Button onClick={() => setIsGitHubImportOpen(true)}>
              <Download className="size-4" />
              <span>{t("marketplace.githubImportCta")}</span>
            </Button>
          }
        />

        <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-pill bg-accent p-0.5">
          {viewModel.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedPublisher(null);
              }}
              className={cn(
                "focus-ring h-8 cursor-pointer rounded-pill border px-4 text-sm transition-colors",
                activeTab === tab.id
                  ? "border-primary-stroke bg-primary-tint font-medium text-primary-text"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === "recommended" && (
          <div className="space-y-4 px-6 pt-2 pb-6">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                aria-pressed={!selectedTag}
                onClick={() => setSelectedTag(null)}
                className={cn(
                  "focus-ring cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                  !selectedTag ? "border-primary-stroke bg-primary-tint text-primary-text font-medium" : "border-glass-stroke bg-popover text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                All
              </button>
              {ALL_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={selectedTag === tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={cn(
                    "focus-ring cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                    selectedTag === tag ? "border-primary-stroke bg-primary-tint text-primary-text font-medium" : "border-glass-stroke bg-popover text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {lang === "zh" ? TAG_LABELS[tag].zh : TAG_LABELS[tag].en}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t("marketplace.searchPlaceholder")}
                value={recommendedSearch}
                onChange={(event) => setRecommendedSearch(event.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>

            {viewModel.filteredRecommended.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {lang === "zh" ? "没有匹配的推荐技能" : "No matching recommended skills"}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {viewModel.filteredRecommended.map((skill) => {
                  const downloadUrl = `https://raw.githubusercontent.com/${skill.repoFullName}/main/${skill.name}/SKILL.md`;
                  return (
                    <UnifiedSkillCard
                      variant="marketplace"
                      key={skill.name}
                      name={skill.name}
                      description={skill.description}
                      publisher={skill.publisher}
                      tags={skill.tags.slice(0, 2).map((tag) => ({
                        key: tag,
                        label: lang === "zh" ? TAG_LABELS[tag].zh : TAG_LABELS[tag].en,
                      }))}
                      onDetail={(event) =>
                        onOpenDetailSkill(
                          {
                            id: skill.name,
                            name: skill.name,
                            description: skill.description,
                            downloadUrl,
                            publisher: skill.publisher,
                            sourceLabel: skill.publisher,
                            sourceUrl: `https://github.com/${skill.repoFullName}`,
                            installed: false,
                          },
                          event?.currentTarget ?? null
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "official" && !selectedPublisher && (
          <div className="space-y-4 px-6 pt-2 pb-6">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={lang === "zh" ? "搜索发布者..." : "Search publishers..."}
                  value={publisherSearch}
                  onChange={(event) => setPublisherSearch(event.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {OFFICIAL_PUBLISHERS.length} {lang === "zh" ? "个官方发布者" : "publishers"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {viewModel.filteredPublishers.map((publisher) => (
                <PublisherCard
                  key={publisher.slug}
                  publisher={publisher}
                  onClick={() => setSelectedPublisher(publisher)}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === "official" && selectedPublisher && (
          <div className="space-y-4 px-6 pt-2 pb-6">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="glass"
                size="icon-sm"
                onClick={() => setSelectedPublisher(null)}
                aria-label={t("marketplace.backToPublishers")}
                title={t("marketplace.backToPublishers")}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div>
                <h2 className="text-sm font-semibold">{selectedPublisher.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedPublisher.totalSkills} skills · {selectedPublisher.repos.length} repo
                  {selectedPublisher.repos.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {selectedPublisher.repos.map((repo) => {
                const isPreviewing = previewRepo === repo.fullName;
                return (
                  <div key={repo.fullName} className="glass-panel overflow-hidden rounded-card">
                    <button
                      onClick={() => onPreviewRepo(repo.fullName, repo.url)}
                      type="button"
                      aria-expanded={isPreviewing}
                      className={cn(
                        "focus-ring flex w-full cursor-pointer items-center gap-3 rounded-card p-4 text-left transition-colors",
                        isPreviewing ? "tint-primary" : "hover:bg-accent"
                      )}
                    >
                      <Folder
                        className={cn(
                          "size-4 shrink-0",
                          isPreviewing ? "text-primary-text" : "text-muted-foreground"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{repo.fullName}</span>
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="focus-ring shrink-0 rounded-control font-mono text-ui-meta text-primary-text hover:underline"
                          >
                            {repo.url}
                          </a>
                        </div>
                        <div className="text-xs text-muted-foreground">{repo.skillCount} skills</div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {isPreviewing ? "▾" : "▸"} {lang === "zh" ? "浏览 Skills" : "Browse Skills"}
                      </span>
                    </button>

                    {isPreviewing && (
                      <div className="border-t border-border">
                        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                          <span className="text-xs text-muted-foreground flex-1">
                            {isPreviewLoading
                              ? lang === "zh"
                                ? "正在获取..."
                                : "Fetching..."
                              : `${previewSkills.length} skills`}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onPreviewRepo(repo.fullName, repo.url, { forceRefresh: true });
                            }}
                            disabled={isPreviewLoading}
                            aria-label={lang === "zh" ? "刷新预览" : "Refresh preview"}
                            className="h-8 min-w-8 px-2 text-xs md:h-6 md:min-w-0"
                          >
                            <RefreshCw
                              className={cn(
                                "size-3",
                                isPreviewLoading && "animate-spin motion-reduce:animate-none"
                              )}
                            />
                          </Button>
                        </div>

                        {isPreviewLoading ? (
                          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
                            <Loader2 className="size-4 animate-spin" />
                            <span>
                              {lang === "zh"
                                ? "正在从 GitHub 获取 Skills..."
                                : "Fetching skills from GitHub..."}
                            </span>
                          </div>
                        ) : previewStatus.kind === "browser-fallback" || previewStatus.kind === "error" ? (
                          <div className="px-4 py-6 text-center">
                            <div className="text-sm font-medium text-foreground">
                              {previewStatus.title}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {previewStatus.detail}
                            </div>
                          </div>
                        ) : previewSkills.length === 0 ? (
                          <div className="text-center py-6 text-xs text-muted-foreground">
                            {lang === "zh" ? "未找到 Skills" : "No skills found"}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 p-3 max-h-80 overflow-y-auto">
                            {previewSkills.map((skill) => (
                              <div
                                key={skill.name}
                                className="flex items-start gap-2 rounded-inner bg-accent p-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium truncate">{skill.name}</div>
                                  {skill.description && (
                                    <div className="text-ui-meta text-muted-foreground line-clamp-1 mt-0.5">
                                      {skill.description}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onOpenDetailSkill(
                                        {
                                          id: skill.id,
                                          name: skill.name,
                                          description: skill.description,
                                          downloadUrl: skill.downloadUrl,
                                          publisher: repo.fullName,
                                          sourceLabel: selectedPublisher.name,
                                          sourceUrl: repo.url,
                                          installed: false,
                                          previewInstall:
                                            skill.sourceKind === "registry"
                                              ? {
                                                  sourceKind: "registry",
                                                  registrySkillId: skill.registrySkillId,
                                                }
                                              : {
                                                  sourceKind: "github",
                                                  repoUrl: skill.repoUrl,
                                                  sourcePath: skill.sourcePath,
                                                },
                                        },
                                        event.currentTarget
                                      );
                                    }}
                                    className="h-8 min-w-8 px-2 text-xs md:h-6 md:min-w-0 md:text-ui-meta"
                                  >
                                    <FileText className="size-3" />
                                    <span>Detail</span>
                                  </Button>
                                  <Button
                                    variant="glass"
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void onInstallPreviewSkill(skill);
                                    }}
                                    disabled={previewInstallingIds.has(skill.name)}
                                    className="h-8 min-w-8 px-2 text-xs md:h-6 md:min-w-0 md:text-ui-meta"
                                  >
                                    {previewInstallingIds.has(skill.name) ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Download className="size-3" />
                                    )}
                                    <span>{t("marketplace.install")}</span>
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "skillssh" && (
          <div className="space-y-4 px-6 pt-2 pb-6">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const input = form.elements.namedItem("skills-sh-query");
                const query = input instanceof HTMLInputElement ? input.value : skillsShQuery;
                void onSearchSkillsSh(query);
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  name="skills-sh-query"
                  defaultValue={skillsShQuery}
                  placeholder={t("marketplace.skillsShSearchPlaceholder")}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <Button type="submit" size="sm" disabled={isSkillsShLoading}>
                {isSkillsShLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Search className="size-3.5" />
                )}
                {t("marketplace.skillsShSearchButton")}
              </Button>
            </form>

            {skillsShError ? (
              <div
                role="alert"
                className="glass-panel tint-destructive rounded-card p-3 text-sm text-destructive-text"
              >
                {skillsShError}
              </div>
            ) : null}

            {isSkillsShLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("marketplace.skillsShSearching")}
              </div>
            ) : skillsShResults.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {skillsShQuery.trim()
                  ? t("marketplace.skillsShSearchEmpty")
                  : t("marketplace.skillsShSearchPrompt")}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {skillsShResults.map((skill) => {
                  const detailSkill: MarketplaceSkillDetail = {
                    id: `skills.sh:${skill.source}:${skill.skill_id}`,
                    name: skill.name,
                    description: `${skill.source}/${skill.skill_id}`,
                    downloadUrl: `https://github.com/${skill.source}`,
                    publisher: skill.source,
                    sourceLabel: "skills.sh",
                    sourceUrl: `https://github.com/${skill.source}`,
                    installed: false,
                    source: skill.source,
                    skillId: skill.skill_id,
                    remoteKind: "skills_sh",
                    installs: skill.installs,
                    stars: skill.stars ?? null,
                  };
                  const installKey = `skills.sh:${skill.source}:${skill.skill_id}`;
                  return (
                    <UnifiedSkillCard
                      variant="marketplace"
                      key={installKey}
                      name={skill.name}
                      description={detailSkill.description}
                      publisher={[
                        t("marketplace.skillsShInstalls", { count: skill.installs }),
                        typeof skill.stars === "number"
                          ? t("marketplace.skillsShStars", { count: skill.stars })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      onDetail={(event) =>
                        onOpenDetailSkill(detailSkill, event?.currentTarget ?? null)
                      }
                      onInstall={() => void onInstallSkillsSh(skill.source, skill.skill_id)}
                      isLoading={installingIds.has(installKey)}
                      installLabel={t("marketplace.skillsShAddToCentral")}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {detailSkill && (
        <MarketplaceSkillDetailDrawer
          open={!!detailSkill}
          onOpenChange={(open) => {
            if (!open) setDetailSkill(null);
          }}
          skill={detailSkill}
          onInstall={() => {
            if (detailSkill.remoteKind === "skills_sh" && detailSkill.source && detailSkill.skillId) {
              void onInstallSkillsSh(detailSkill.source, detailSkill.skillId);
              return;
            }
            if (detailSkill.previewInstall) {
              void onInstallPreviewSkill({
                id: detailSkill.id,
                name: detailSkill.name,
                downloadUrl: detailSkill.downloadUrl,
                ...detailSkill.previewInstall,
              });
              return;
            }
            if (detailSkill.id.startsWith("skill-")) {
              void onInstallFromSource(detailSkill.id);
            }
          }}
          isInstalling={
            installingIds.has(detailSkill.id) ||
            (detailSkill.remoteKind === "skills_sh" &&
              !!detailSkill.source &&
              !!detailSkill.skillId &&
              installingIds.has(`skills.sh:${detailSkill.source}:${detailSkill.skillId}`)) ||
            previewInstallingIds.has(detailSkill.name)
          }
          onAfterCloseFocus={() => {
            detailTriggerRef.current?.focus();
            detailTriggerRef.current = null;
          }}
          returnFocusRef={detailTriggerRef}
        />
      )}

      <GitHubRepoImportWizard
        open={isGitHubImportOpen}
        onOpenChange={setIsGitHubImportOpen}
        repoUrl={githubRepoUrl}
        onRepoUrlChange={setGithubRepoUrl}
        branch={githubBranch}
        onBranchChange={setGithubBranch}
        preview={githubImport.preview}
        previewError={githubImport.error}
        isPreviewLoading={githubImport.isPreviewLoading}
        isImporting={githubImport.isImporting}
        importResult={githubImport.importResult}
        onPreview={onGitHubPreview}
        onImport={onGitHubImport}
        availableAgents={viewModel.availableInstallAgents}
        installableSkills={viewModel.installableImportedSkills}
        onInstallImportedSkill={onInstallImportedSkill}
        onAfterImportSuccess={onAfterImportSuccess}
        onReset={onResetGitHubImport}
        launcherLabel={t("marketplace.title")}
      />
    </div>
  );
}
