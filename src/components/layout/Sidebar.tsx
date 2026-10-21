import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Loader2,
  Blocks,
  Folder,
  FolderOpen,
  LayoutDashboard,
  Layers,
  Pin,
  ScrollText,
  Settings,
  Store,
  ChevronsLeft,
  ChevronsRight,
  Moon,
  Sun,
  BarChart3,
  Terminal,
  FileText,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { usePlatformStore } from "@/stores/platformStore";
import { DEFAULT_PLATFORM_CATEGORY_VISIBILITY } from "@/lib/platformVisibility";
import {
  getPlatformTargetGroups,
  getPlatformTargetLabel,
  isUniversalPlatformTarget,
} from "@/lib/platformTargetGroups";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useThemeStore } from "@/stores/themeStore";
import { markAppPerformance } from "@/lib/performance";
import { SidebarSection } from "@/components/layout/SidebarSection";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { formatPathForDisplay } from "@/lib/path";
import { sortSidebarProjects } from "@/lib/sidebarProjectOrder";
import {
  readSidebarWorkspaceSections,
  writeSidebarWorkspaceSections,
  type SidebarProjectSort,
  type SidebarWorkspaceSections,
} from "@/lib/sidebarWorkspacePrefs";
import { useProjectsStore } from "@/stores/projectsStore";

const EXPANDED_SIDEBAR_WIDTH = 208;
const COLLAPSED_SIDEBAR_WIDTH = 56;
const MIN_SIDEBAR_WIDTH = 168;
const MAX_SIDEBAR_WIDTH = 360;

// ─── Nav Item ────────────────────────────────────────────────────────────────

// DESIGN.md Components → nav-item-active. Default: transparent, ink-muted
// text + line icon, pill, 32px. Hover: surface-hover wash. Active: 12% mint
// tint over the sidebar + 1px mint stroke + mint text, weight 600 and
// aria-current — no gradient fill, glow or left-edge bar. Focus uses the
// shared outline ring; the scroll area keeps 8px padding so the 2px offset
// ring is never clipped. Collapsed rail: 40px circles, icon only, accessible
// name kept through aria-label + title.
function NavItem({
  label,
  ariaLabel,
  title,
  isActive = false,
  onClick,
  icon,
  expanded,
  count,
  showZeroCount = false,
  countPending = false,
  detail,
}: {
  label: string;
  /** Accessible name when it should say more than the visible label. */
  ariaLabel?: string;
  title?: string;
  isActive?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  expanded: boolean;
  count?: number;
  showZeroCount?: boolean;
  countPending?: boolean;
  detail?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? ariaLabel ?? label}
      aria-label={ariaLabel ?? label}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "focus-ring flex items-center rounded-full border text-sm transition-[scale,background-color,color,border-color] duration-150 active:scale-[0.96] motion-reduce:active:scale-100 cursor-pointer [&_svg]:shrink-0",
        isActive
          ? "tint-primary border-primary-stroke font-semibold text-primary-text"
          : "border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        expanded ? "h-8 w-full gap-2.5 px-3" : "mx-auto size-10 justify-center",
      )}
    >
      <span className="inline-flex shrink-0" aria-hidden="true">
        {icon}
      </span>
      {expanded && (
        <>
          <span className="truncate flex-1 text-left">{label}</span>
          {detail}
          {countPending ? (
            <Loader2
              className="size-3.5 shrink-0 animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {!countPending &&
          count !== undefined &&
          (showZeroCount || count > 0) ? (
            // Neutral badge on an active (mint-tinted) row drops to 4.49:1
            // in glass-dark, so the active row switches to the mint badge
            // (mint-text over 2× mint tint on sidebar: 4.63 light / 5.22 dark).
            <Badge
              size="sm"
              tone={isActive ? "primary" : "neutral"}
              className="tabular-nums"
            >
              {count}
            </Badge>
          ) : null}
        </>
      )}
    </button>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const agents = usePlatformStore((s) => s.agents);
  const skillsByAgent = usePlatformStore((s) => s.skillsByAgent);
  const collectionCount = usePlatformStore((s) => s.collectionCount);
  const isLoading = usePlatformStore((s) => s.isLoading);
  const isRefreshing = usePlatformStore((s) => s.isRefreshing);
  const scanState = usePlatformStore((s) => s.scanState);
  const categoryVisibility =
    usePlatformStore((s) => s.categoryVisibility) ??
    DEFAULT_PLATFORM_CATEGORY_VISIBILITY;
  const flavor = useThemeStore((s) => s.flavor);
  const toggleFlavor = useThemeStore((s) => s.toggleFlavor);
  const projects = useProjectsStore((s) => s.projects);
  const scanningProjectIds = useProjectsStore((s) => s.scanningProjectIds);
  const [workspaceSections, setWorkspaceSections] =
    useState<SidebarWorkspaceSections>(() => readSidebarWorkspaceSections());

  const [expanded, setExpanded] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );
  const {
    width: sidebarWidth,
    startResize,
    handleResizeKeyDown,
  } = useResizableWidth({
    defaultWidth: EXPANDED_SIDEBAR_WIDTH,
    minWidth: MIN_SIDEBAR_WIDTH,
    maxWidth: MAX_SIDEBAR_WIDTH,
  });
  const resolvedSidebarWidth = expanded
    ? sidebarWidth
    : COLLAPSED_SIDEBAR_WIDTH;

  useEffect(() => {
    if (!isLoading && agents.length > 0) {
      markAppPerformance("sidebar_ready");
    }
  }, [agents.length, isLoading]);

  const platformAgents = getPlatformTargetGroups(agents, categoryVisibility);
  const codingAgents = platformAgents.filter((a) => a.category !== "lobster");
  const orderedProjects = sortSidebarProjects(
    projects,
    workspaceSections.projectSort,
  );

  function updateWorkspaceSections(next: SidebarWorkspaceSections) {
    setWorkspaceSections(next);
    writeSidebarWorkspaceSections(next);
  }

  function setProjectSort(projectSort: SidebarProjectSort) {
    updateWorkspaceSections({ ...workspaceSections, projectSort });
  }

  const isDashboardActive = pathname === "/dashboard" || pathname === "/";
  const isCollectionActive = pathname === "/collections";
  const isLogsActive = pathname === "/logs";
  const isSettingsActive = pathname.startsWith("/settings");

  function platformRoute(agent: (typeof platformAgents)[number]) {
    return `/platform/${agent.id}`;
  }

  function platformCount(agent: (typeof platformAgents)[number]) {
    if (!isUniversalPlatformTarget(agent)) {
      return skillsByAgent[agent.id];
    }

    const primaryCount = skillsByAgent[agent.install_agent_id];
    if (primaryCount !== undefined) {
      return primaryCount;
    }

    const memberCounts = agent.member_agents
      .map((member) => skillsByAgent[member.id])
      .filter((count): count is number => count !== undefined);

    return memberCounts.length > 0 ? Math.max(...memberCounts) : undefined;
  }

  function handleCollectionClick() {
    navigate("/collections");
  }

  const isDark = flavor === "glass-dark";
  const themeLabel = isDark ? t("sidebar.lightMode") : t("sidebar.darkMode");
  const themeAriaLabel = isDark
    ? t("sidebar.themeToggleLight")
    : t("sidebar.themeToggleDark");
  const collapseAriaLabel = expanded
    ? t("sidebar.collapseSidebar")
    : t("sidebar.expandSidebar");

  // L2 floating panel (DESIGN.md Layout → 外壳): sidebar fill + glass stroke +
  // shadow-glass, rounded-shell, no real blur (a fixed canvas sits beneath).
  // The width style is the panel width (168–360 expanded / 56 collapsed); the
  // 12px window gap belongs to AppShell.
  return (
    <nav
      className="glass-panel relative flex flex-col shrink-0 h-full rounded-shell bg-sidebar text-sidebar-foreground"
      style={{ width: resolvedSidebarWidth }}
      aria-label={t("sidebar.mainNav")}
    >
      {/* Scrollable nav items. The padding keeps the 2px-offset focus outline
          inside the scroll box (overflow would clip it). Collapsed, the 56px
          panel leaves 54px inside its border: px-1.5 gives the 40px circles a
          42px track, so the rail hides its scrollbar (scrollbar-subtle's
          stable gutter would shrink the track below 40px and push the circles
          off-centre into a horizontal overflow). */}
      <div
        className={cn(
          "flex-1 overflow-y-auto space-y-0.5",
          expanded
            ? "scrollbar-subtle p-2"
            : "overflow-x-hidden px-1.5 py-2 [scrollbar-width:none]",
        )}
      >
        {/* Dashboard */}
        <NavItem
          label={t("sidebar.dashboard")}
          isActive={isDashboardActive}
          onClick={() => navigate("/dashboard")}
          icon={<LayoutDashboard className="size-5" />}
          expanded={expanded}
        />

        {/* Central Skills */}
        <NavItem
          label={t("sidebar.centralSkills")}
          isActive={pathname === "/central"}
          onClick={() => navigate("/central")}
          icon={<Blocks className="size-5" />}
          expanded={expanded}
          count={skillsByAgent["central"]}
        />
        <NavItem
          label={t("sidebar.rules")}
          isActive={pathname === "/rules"}
          onClick={() => navigate("/rules")}
          icon={<FileText className="size-5" />}
          expanded={expanded}
        />

        <NavItem
          label={t("sidebar.skillsCli")}
          isActive={pathname === "/skills-cli"}
          onClick={() => navigate("/skills-cli")}
          icon={<Terminal className="size-5" />}
          expanded={expanded}
        />

        {/* Projects (project-level skill management) */}
        <NavItem
          label={t("sidebar.projects")}
          isActive={pathname.startsWith("/projects")}
          onClick={() => navigate("/projects")}
          icon={<FolderOpen className="size-5" />}
          expanded={expanded}
        />

        <NavItem
          label={t("sidebar.obsidian")}
          isActive={pathname.startsWith("/obsidian")}
          onClick={() => navigate("/obsidian")}
          icon={<Blocks className="size-5" />}
          expanded={expanded}
        />

        {/* Marketplace */}
        <NavItem
          label={t("marketplace.title")}
          isActive={pathname === "/marketplace"}
          onClick={() => navigate("/marketplace")}
          icon={<Store className="size-5" />}
          expanded={expanded}
        />

        {/* Collections */}
        <NavItem
          label={t("sidebar.collections")}
          isActive={isCollectionActive}
          onClick={handleCollectionClick}
          icon={<Layers className="size-5" />}
          expanded={expanded}
          count={collectionCount}
        />

        {/* Operation Logs */}
        <NavItem
          label={t("logs.title")}
          isActive={isLogsActive}
          onClick={() => navigate("/logs")}
          icon={<ScrollText className="size-5" />}
          expanded={expanded}
        />

        {/* Skill Usage — skilled-style aggregated call stats across AI tools */}
        <NavItem
          label={t("sidebar.skillUsage")}
          isActive={pathname === "/usage"}
          onClick={() => navigate("/usage")}
          icon={<BarChart3 className="size-5" />}
          expanded={expanded}
        />

        {/* Divider */}
        <div className="border-t border-sidebar-border my-2 mx-1" aria-hidden="true" />

        {/* Platform icons */}
        {isLoading ? (
          <div
            className={cn(
              "flex items-center py-2 text-muted-foreground text-sm",
              expanded ? "gap-2.5 px-3" : "justify-center",
            )}
          >
            <Loader2 className="size-4 animate-spin shrink-0" />
            {expanded && <span>{t("sidebar.scanning")}</span>}
          </div>
        ) : codingAgents.length > 0 ? (
          expanded ? (
            <SidebarSection
              label={t("sidebar.globalWorkspace")}
              open={workspaceSections.globalWorkspace}
              onToggle={() =>
                updateWorkspaceSections({
                  ...workspaceSections,
                  globalWorkspace: !workspaceSections.globalWorkspace,
                })
              }
            >
              {codingAgents.map((agent) => (
                <NavItem
                  key={agent.id}
                  label={getPlatformTargetLabel(agent, t, "short")}
                  isActive={pathname === platformRoute(agent)}
                  onClick={() => navigate(platformRoute(agent))}
                  icon={<PlatformIcon agentId={agent.id} className="size-5" />}
                  expanded={expanded}
                  count={platformCount(agent)}
                />
              ))}
            </SidebarSection>
          ) : (
            <>
              <div className="border-t border-sidebar-border my-1.5 mx-1" aria-hidden="true" />
              {codingAgents.map((agent) => (
                <NavItem
                  key={agent.id}
                  label={getPlatformTargetLabel(agent, t, "short")}
                  isActive={pathname === platformRoute(agent)}
                  onClick={() => navigate(platformRoute(agent))}
                  icon={<PlatformIcon agentId={agent.id} className="size-5" />}
                  expanded={expanded}
                  count={platformCount(agent)}
                />
              ))}
            </>
          )
        ) : null}

        {orderedProjects.length > 0 &&
          (expanded ? (
            <SidebarSection
              label={t("sidebar.projectWorkspace")}
              open={workspaceSections.projectWorkspace}
              onToggle={() =>
                updateWorkspaceSections({
                  ...workspaceSections,
                  projectWorkspace: !workspaceSections.projectWorkspace,
                })
              }
              sort={{
                value: workspaceSections.projectSort,
                onChange: setProjectSort,
              }}
            >
              {orderedProjects.map((project) => (
                <NavItem
                  key={project.id}
                  label={project.name}
                  title={formatPathForDisplay(project.path)}
                  isActive={
                    pathname === `/projects/${encodeURIComponent(project.id)}`
                  }
                  onClick={() =>
                    navigate(`/projects/${encodeURIComponent(project.id)}`)
                  }
                  icon={<Folder className="size-5" />}
                  expanded={expanded}
                  count={project.skillCount}
                  showZeroCount
                  countPending={scanningProjectIds.has(project.id)}
                  detail={
                    project.pinned ? (
                      <span title={t("projects.menuPin")} className="inline-flex shrink-0">
                        <Pin className="size-3 text-warning" aria-hidden="true" />
                      </span>
                    ) : undefined
                  }
                />
              ))}
            </SidebarSection>
          ) : (
            <>
              <div className="border-t border-sidebar-border my-1.5 mx-1" aria-hidden="true" />
              {orderedProjects.map((project) => (
                <NavItem
                  key={project.id}
                  label={project.name}
                  title={formatPathForDisplay(project.path)}
                  isActive={
                    pathname === `/projects/${encodeURIComponent(project.id)}`
                  }
                  onClick={() =>
                    navigate(`/projects/${encodeURIComponent(project.id)}`)
                  }
                  icon={<Folder className="size-5" />}
                  expanded={expanded}
                  count={project.skillCount}
                  showZeroCount
                />
              ))}
            </>
          ))}

        {!isLoading && (isRefreshing || scanState === "refreshing") && (
          <div
            className={cn(
              "flex items-center py-2 text-muted-foreground text-sm",
              expanded ? "gap-2.5 px-3" : "justify-center",
            )}
          >
            <Loader2 className="size-4 animate-spin shrink-0" />
            {expanded && <span>{t("sidebar.scanning")}</span>}
          </div>
        )}
      </div>

      {/* Footer: Settings, divider, then the two secondary entries from the
          reference (DESIGN.md nav-item: 明暗切换 + 收起). This is the app's only
          light/dark toggle (C5 D-S3). */}
      <div
        className={cn(
          "border-t border-sidebar-border space-y-0.5",
          expanded ? "p-2" : "px-1.5 py-2",
        )}
      >
        <NavItem
          label={t("sidebar.settings")}
          isActive={isSettingsActive}
          onClick={() => navigate("/settings")}
          icon={<Settings className="size-5" />}
          expanded={expanded}
        />
        <div className="border-t border-sidebar-border my-1.5 mx-1" aria-hidden="true" />
        <NavItem
          label={themeLabel}
          ariaLabel={themeAriaLabel}
          onClick={() => toggleFlavor()}
          icon={
            isDark ? <Sun className="size-5" /> : <Moon className="size-5" />
          }
          expanded={expanded}
        />
        <NavItem
          label={t("sidebar.collapse")}
          ariaLabel={collapseAriaLabel}
          onClick={() => setExpanded((e) => !e)}
          icon={
            expanded ? (
              <ChevronsLeft className="size-5" />
            ) : (
              <ChevronsRight className="size-5" />
            )
          }
          expanded={expanded}
        />
      </div>

      {expanded && (
        // D-S5: an 8px hit strip centred on the 12px gap between the panel and
        // <main> (panel border 1px + 6px to the gap midline − 4px half strip).
        // Idle it is invisible; hover / keyboard focus show a 2px mint line.
        // Keyboard resizing (ArrowLeft / ArrowRight) is unchanged.
        <div
          role="separator"
          aria-label={t("sidebar.resizeSidebar")}
          aria-orientation="vertical"
          aria-valuenow={sidebarWidth}
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={handleResizeKeyDown}
          className="group/resize focus-ring absolute -right-[11px] top-3 bottom-3 z-20 w-2 cursor-col-resize rounded-full"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors duration-150 group-hover/resize:bg-primary/40 group-focus-visible/resize:bg-primary"
          />
        </div>
      )}
    </nav>
  );
}
