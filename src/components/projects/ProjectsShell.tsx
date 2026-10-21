import { useMemo, useState } from "react";
import {
  Folder,
  Loader2,
  PackagePlus,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { UnifiedSkillCard } from "@/components/skill/UnifiedSkillCard";
import { useSkillExplanationSummaries } from "@/hooks/useSkillExplanationSummaries";
import { formatPathForDisplay } from "@/lib/path";
import { groupProjectSkillsByPlatform } from "@/lib/projectSkillPlatformGroups";
import {
  getPlatformTargetLabel,
  getPlatformTargetMemberIds,
  getPlatformTargetTitleHint,
  hasProjectSkillPattern,
  type PlatformTarget,
} from "@/lib/platformTargetGroups";
import { cn } from "@/lib/utils";
import type { Project, ProjectSkill } from "@/types";

interface ProjectsShellProps {
  projects: Project[];
  currentProjectId: string | null;
  skills: ProjectSkill[];
  platformTargets: PlatformTarget[];
  isAddingProject: boolean;
  scanningProjectIds: Set<string>;
  uninstallingKeys: Set<string>;
  projectSearch: string;
  onProjectSearchChange: (value: string) => void;
  onSelectProject: (id: string) => void;
  onAddProject: () => void | Promise<void>;
  onRescanProject: (id: string) => void | Promise<void>;
  onOpenInstallDialog: () => void;
  onUninstallSkill: (skill: ProjectSkill) => void | Promise<void>;
  onTogglePin: (project: Project) => void | Promise<void>;
  onRequestRename: (project: Project) => void;
  onRequestRemove: (project: Project) => void;
}

function getProjectPlatformDisplayName(
  target: PlatformTarget | null,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (!target) {
    return t("projects.otherPlatforms");
  }

  return getPlatformTargetLabel(target, t, "short");
}

function getProjectPlatformTitle(
  target: PlatformTarget | null,
  fallback: string,
): string {
  if (!target) return fallback;
  return getPlatformTargetTitleHint(target);
}

interface ProjectCliSidebarItem {
  id: string;
  target: PlatformTarget | null;
  label: string;
  title: string;
  count: number;
  disabled: boolean;
  rawAgentIds: string[];
}

function getSkillCountForTarget(
  skills: readonly ProjectSkill[],
  target: PlatformTarget,
): number {
  const memberIds = new Set(getPlatformTargetMemberIds(target));
  return skills.filter((skill) => memberIds.has(skill.agentId)).length;
}

function getSkillCountForRawAgentIds(
  skills: readonly ProjectSkill[],
  rawAgentIds: readonly string[],
): number {
  const memberIds = new Set(rawAgentIds);
  return skills.filter((skill) => memberIds.has(skill.agentId)).length;
}

function midEllipsis(input: string, max = 56): string {
  if (input.length <= max) return input;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${input.slice(0, head)}…${input.slice(input.length - tail)}`;
}

function ProjectList({
  projects,
  currentProjectId,
  scanningProjectIds,
  projectSearch,
  onProjectSearchChange,
  onSelectProject,
  onTogglePin,
  onRequestRename,
  onRequestRemove,
}: Pick<
  ProjectsShellProps,
  | "projects"
  | "currentProjectId"
  | "scanningProjectIds"
  | "projectSearch"
  | "onProjectSearchChange"
  | "onSelectProject"
  | "onTogglePin"
  | "onRequestRename"
  | "onRequestRemove"
>) {
  const { t } = useTranslation();

  const filtered = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    const sorted = [...projects].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    );
  }, [projects, projectSearch]);

  return (
    <div className="glass-panel mb-4 ml-4 flex w-52 shrink-0 flex-col overflow-hidden rounded-card sm:ml-6 lg:w-64">
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t("projects.searchPlaceholder")}
            value={projectSearch}
            onChange={(event) => onProjectSearchChange(event.target.value)}
            aria-label={t("projects.searchPlaceholder")}
            className="h-8 rounded-full pr-7 pl-7 text-xs md:text-xs"
          />
          {projectSearch.length > 0 && (
            <button
              type="button"
              onClick={() => onProjectSearchChange("")}
              aria-label={t("projects.clearSearch")}
              title={t("projects.clearSearch")}
              className="focus-ring absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="scrollbar-subtle flex-1 overflow-y-auto px-1.5 py-1.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              {projectSearch
                ? t("projects.noMatch", { query: projectSearch })
                : t("projects.emptyHint")}
            </p>
          </div>
        ) : (
          filtered.map((project) => {
            const isActive = currentProjectId === project.id;
            const isScanning = scanningProjectIds.has(project.id);
            return (
              <div
                key={project.id}
                className={cn(
                  "group mb-0.5 flex w-full items-center gap-1 rounded-full border text-left transition-colors has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-ring has-[button:focus-visible]:outline-solid",
                  isActive
                    ? "border-primary-stroke bg-primary-tint font-medium text-primary-text"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <button
                  onClick={() => onSelectProject(project.id)}
                  title={formatPathForDisplay(project.path)}
                  aria-current={isActive ? "true" : undefined}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-left outline-none"
                >
                  <Folder
                    className={cn(
                      "size-3.5 shrink-0",
                      isActive ? "text-primary-text" : "text-muted-foreground",
                    )}
                  />
                  <span className="text-sm truncate flex-1">
                    {project.name}
                  </span>
                  {project.pinned && (
                    <Pin className="size-3 shrink-0 text-warning-foreground" aria-hidden />
                  )}
                  {isScanning ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                  ) : (
                    <Badge size="sm" tone={isActive ? "primary" : "neutral"} className="tabular-nums">
                      {project.skillCount}
                    </Badge>
                  )}
                </button>
                <div className="hidden group-hover:flex items-center gap-0.5 pr-1">
                  <button
                    type="button"
                    onClick={() => onTogglePin(project)}
                    aria-label={
                      project.pinned
                        ? t("projects.menuUnpin")
                        : t("projects.menuPin")
                    }
                    title={
                      project.pinned
                        ? t("projects.menuUnpin")
                        : t("projects.menuPin")
                    }
                    className="focus-ring cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {project.pinned ? (
                      <PinOff className="size-3" />
                    ) : (
                      <Pin className="size-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestRename(project)}
                    aria-label={t("projects.menuRename")}
                    title={t("projects.menuRename")}
                    className="focus-ring cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestRemove(project)}
                    aria-label={t("projects.menuRemove")}
                    title={t("projects.menuRemove")}
                    className="focus-ring cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-destructive-tint hover:text-destructive-text"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface ProjectCliSidebarProps {
  items: ProjectCliSidebarItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function ProjectCliSidebar({
  items,
  selectedId,
  onSelect,
}: ProjectCliSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="glass-panel mb-4 ml-3 flex w-40 shrink-0 flex-col overflow-hidden rounded-card lg:w-44">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("projects.cliSidebarTitle")}
        </p>
      </div>
      <nav
        aria-label={t("projects.cliSidebarAria")}
        className="flex-1 overflow-y-auto p-1.5 space-y-1"
      >
        {items.map((item) => {
          const isActive = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              disabled={item.disabled}
              title={item.title}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "focus-ring flex w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-left text-xs transition-colors",
                isActive
                  ? "border-primary-stroke bg-primary-tint text-primary-text"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                item.disabled &&
                  "cursor-not-allowed opacity-50 hover:border-transparent hover:bg-transparent",
              )}
            >
              {item.target ? (
                <PlatformIcon
                  agentId={item.target.id}
                  className="size-3.5 shrink-0"
                />
              ) : (
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <Badge size="sm" tone={isActive ? "primary" : "neutral"} className="tabular-nums">
                {item.count}
              </Badge>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

interface SkillPanelProps {
  project: Project | null;
  skills: ProjectSkill[];
  platformTargets: PlatformTarget[];
  platformGroups: ReturnType<typeof groupProjectSkillsByPlatform>;
  selectedCliId: string;
  isScanning: boolean;
  uninstallingKeys: Set<string>;
  onRescan: () => void | Promise<void>;
  onOpenInstallDialog: () => void;
  onUninstallSkill: (skill: ProjectSkill) => void | Promise<void>;
}

function SkillPanel({
  project,
  skills,
  platformTargets,
  platformGroups,
  selectedCliId,
  isScanning,
  uninstallingKeys,
  onRescan,
  onOpenInstallDialog,
  onUninstallSkill,
}: SkillPanelProps) {
  const { t } = useTranslation();
  const selectedGroup =
    platformGroups.find((group) => group.id === selectedCliId) ?? null;
  const selectedTarget =
    platformTargets.find((target) => target.id === selectedCliId) ?? null;
  const selectedPlatformName = selectedGroup
    ? getProjectPlatformDisplayName(selectedGroup.target, t)
    : selectedTarget
      ? getProjectPlatformDisplayName(selectedTarget, t)
      : t("projects.otherPlatforms");
  const visibleGroups = useMemo(
    () => (selectedGroup ? [selectedGroup] : []),
    [selectedGroup],
  );
  const centralSkillIds = useMemo(
    () =>
      visibleGroups.flatMap((group) =>
        group.skills
          .filter((skill) => skill.sourceOrigin === "central")
          .map((skill) => skill.skillId),
      ),
    [visibleGroups],
  );
  const aiSummaries = useSkillExplanationSummaries(centralSkillIds, "zh");

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Folder className="mr-2 size-5" aria-hidden />
        {t("projects.noSelection")}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 sm:px-6">
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="text-sm font-semibold truncate">{project.name}</h2>
          <div
            className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground"
            title={formatPathForDisplay(project.path)}
          >
            <Folder className="size-3 shrink-0" aria-hidden />
            <span className="min-w-0 truncate font-mono">
              {midEllipsis(formatPathForDisplay(project.path))}
            </span>
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={onOpenInstallDialog}
          disabled={isScanning}
        >
          <PackagePlus className="size-3.5 mr-1" />
          {t("projects.installFromCentral")}
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={onRescan}
          disabled={isScanning}
        >
          {isScanning ? (
            <Loader2 className="size-3.5 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5 mr-1" />
          )}
          {t("projects.rescan")}
        </Button>
      </div>

      <div className="scrollbar-subtle flex-1 overflow-auto px-4 pb-6 sm:px-6">
        {isScanning && skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("projects.scanning")}
            </p>
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
            <Folder className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {t("projects.noSkills")}
            </p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              {t("projects.noSkillsHint")}
            </p>
            <Button variant="glass" size="sm" onClick={onOpenInstallDialog}>
              <PackagePlus className="size-3.5 mr-1" />
              {t("projects.installFromCentral")}
            </Button>
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
            <Folder className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {t("projects.noSkillsForCli", { cli: selectedPlatformName })}
            </p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              {t("projects.noSkillsForCliHint", { cli: selectedPlatformName })}
            </p>
            <Button variant="glass" size="sm" onClick={onOpenInstallDialog}>
              <PackagePlus className="size-3.5 mr-1" />
              {t("projects.installFromCentral")}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {visibleGroups.map((group) => {
              const platformName = getProjectPlatformDisplayName(
                group.target,
                t,
              );
              const title = getProjectPlatformTitle(group.target, platformName);
              const headingId = `project-platform-${group.id}`;
              return (
                <section
                  key={group.id}
                  aria-labelledby={headingId}
                  className="space-y-3"
                >
                  <div
                    className="glass-panel flex items-center gap-2 rounded-full px-3.5 py-2"
                    title={title}
                  >
                    {group.target ? (
                      <PlatformIcon
                        agentId={group.target.id}
                        className="size-4 shrink-0"
                      />
                    ) : (
                      <Folder className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <h3
                      id={headingId}
                      className="min-w-0 flex-1 truncate text-sm font-semibold"
                    >
                      {platformName}
                    </h3>
                    <Badge size="sm" className="tabular-nums">
                      {t("projects.platformSkillCount", {
                        count: group.skills.length,
                      })}
                    </Badge>
                  </div>

                  <div className="grid gap-5">
                    {group.skills.map((skill) => {
                      const key = `${skill.agentId}:${skill.skillId}`;
                      const isLoading = uninstallingKeys.has(key);
                      const linkSource =
                        skill.linkType === "symlink" ? "symlink" : "copy";
                      const sourceOrigin =
                        skill.sourceOrigin === "central"
                          ? "central"
                          : "project";
                      const badgeName = group.target
                        ? platformName
                        : skill.agentDisplayName;
                      const badgeId = group.target?.id ?? skill.agentId;
                      return (
                        <UnifiedSkillCard
                          variant="project"
                          key={key}
                          name={skill.name}
                          description={skill.description ?? undefined}
                          aiSummary={
                            skill.sourceOrigin === "central"
                              ? aiSummaries[skill.skillId]
                              : undefined
                          }
                          sourceType={linkSource}
                          originBadge={{
                            kind: sourceOrigin,
                            label: t(`projects.sourceOrigin.${sourceOrigin}`),
                          }}
                          platformBadge={{
                            id: badgeId,
                            name: badgeName,
                          }}
                          onUninstallFromPlatform={() =>
                            onUninstallSkill(skill)
                          }
                          uninstallFromLabel={t("projects.uninstallFromAgent", {
                            agent: badgeName,
                          })}
                          isLoading={isLoading}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectsShell({
  projects,
  currentProjectId,
  skills,
  platformTargets,
  isAddingProject,
  scanningProjectIds,
  uninstallingKeys,
  projectSearch,
  onProjectSearchChange,
  onSelectProject,
  onAddProject,
  onRescanProject,
  onOpenInstallDialog,
  onUninstallSkill,
  onTogglePin,
  onRequestRename,
  onRequestRemove,
}: ProjectsShellProps) {
  const { t } = useTranslation();
  const currentProject =
    projects.find((p) => p.id === currentProjectId) ?? null;
  const isCurrentScanning = currentProject
    ? scanningProjectIds.has(currentProject.id)
    : false;
  const [selectedCliIdByProject, setSelectedCliIdByProject] = useState<
    Record<string, string>
  >({});
  const platformGroups = useMemo(
    () => groupProjectSkillsByPlatform(skills, platformTargets),
    [skills, platformTargets],
  );
  const cliSidebarItems = useMemo<ProjectCliSidebarItem[]>(() => {
    const items: ProjectCliSidebarItem[] = [];

    for (const target of platformTargets) {
      if (!hasProjectSkillPattern(target)) {
        continue;
      }

      const label = getProjectPlatformDisplayName(target, t);
      items.push({
        id: target.id,
        target,
        label,
        title: getProjectPlatformTitle(target, label),
        count: getSkillCountForTarget(skills, target),
        disabled: false,
        rawAgentIds: getPlatformTargetMemberIds(target),
      });
    }

    for (const group of platformGroups) {
      if (group.target || items.some((item) => item.id === group.id)) {
        continue;
      }

      const label = getProjectPlatformDisplayName(group.target, t);
      items.push({
        id: group.id,
        target: null,
        label,
        title: group.rawAgentIds.join(", "),
        count: getSkillCountForRawAgentIds(skills, group.rawAgentIds),
        disabled: false,
        rawAgentIds: group.rawAgentIds,
      });
    }

    return items;
  }, [platformGroups, platformTargets, skills, t]);

  const selectedCliId = currentProject
    ? cliSidebarItems.some(
        (item) => item.id === selectedCliIdByProject[currentProject.id],
      )
      ? selectedCliIdByProject[currentProject.id]
      : (cliSidebarItems[0]?.id ?? "")
    : "";

  const handleSelectCli = (id: string) => {
    if (!currentProject) return;
    setSelectedCliIdByProject((previous) => ({
      ...previous,
      [currentProject.id]: id,
    }));
  };

  if (projects.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <PageHeader
            title={t("projects.title")}
            meta={t("projects.subtitle")}
            actions={
            <Button
              variant="default"
              size="sm"
              onClick={onAddProject}
              disabled={isAddingProject}
            >
              {isAddingProject ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Plus className="size-3.5 mr-1" />
              )}
              {t("projects.addProject")}
            </Button>
            }
          />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
          <div className="rounded-full bg-accent p-4">
            <Folder className="size-12 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            {t("projects.emptyTitle")}
          </p>
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            {t("projects.emptyHint")}
          </p>
          <Button
            variant="glass"
            size="sm"
            onClick={onAddProject}
            disabled={isAddingProject}
          >
            <Plus className="size-3.5 mr-1" />
            {t("projects.addFirstProject")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
        <PageHeader
          title={t("projects.title")}
          meta={t("projects.foundSummary", { count: projects.length })}
          actions={
            <Button
              variant="default"
              size="sm"
              onClick={onAddProject}
              disabled={isAddingProject}
            >
              {isAddingProject ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Plus className="size-3.5 mr-1" />
              )}
              {t("projects.addProject")}
            </Button>
          }
        />
      </div>

      <div className="flex flex-1 min-h-0">
        <ProjectList
          projects={projects}
          currentProjectId={currentProjectId}
          scanningProjectIds={scanningProjectIds}
          projectSearch={projectSearch}
          onProjectSearchChange={onProjectSearchChange}
          onSelectProject={onSelectProject}
          onTogglePin={onTogglePin}
          onRequestRename={onRequestRename}
          onRequestRemove={onRequestRemove}
        />
        {currentProject && (
          <ProjectCliSidebar
            items={cliSidebarItems}
            selectedId={selectedCliId}
            onSelect={handleSelectCli}
          />
        )}
        <SkillPanel
          project={currentProject}
          skills={skills}
          platformTargets={platformTargets}
          platformGroups={platformGroups}
          selectedCliId={selectedCliId}
          isScanning={isCurrentScanning}
          uninstallingKeys={uninstallingKeys}
          onRescan={() => {
            if (currentProject) {
              return onRescanProject(currentProject.id);
            }
          }}
          onOpenInstallDialog={onOpenInstallDialog}
          onUninstallSkill={onUninstallSkill}
        />
      </div>
    </div>
  );
}
