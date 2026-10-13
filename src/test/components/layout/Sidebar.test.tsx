import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { useProjectsStore } from "@/stores/projectsStore";
import { SIDEBAR_WORKSPACE_SECTIONS_KEY } from "@/lib/sidebarWorkspacePrefs";
import type { Project } from "@/types";

vi.mock("@/stores/platformStore", () => ({
  usePlatformStore: vi.fn(),
}));

import { usePlatformStore } from "@/stores/platformStore";

const mockAgents = [
  {
    id: "claude-code",
    display_name: "Claude Code",
    category: "coding",
    global_skills_dir: "~/.claude/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "codex",
    display_name: "Codex CLI",
    category: "coding",
    global_skills_dir: "~/.agents/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "cursor",
    display_name: "Cursor",
    category: "coding",
    global_skills_dir: "~/.cursor/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "openclaw",
    display_name: "OpenClaw",
    category: "lobster",
    global_skills_dir: "~/.openclaw/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
  {
    id: "central",
    display_name: "Central Skills",
    category: "central",
    global_skills_dir: "~/.skillsmanage/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
];

function buildPlatformStoreState(overrides = {}) {
  return {
    agents: mockAgents,
    skillsByAgent: {
      "claude-code": 5,
      codex: 7,
      cursor: 3,
      central: 10,
    },
    collectionCount: 2,
    categoryVisibility: {
      coding: true,
      lobster: true,
    },
    lastScanAt: "2026-04-23T01:00:00Z",
    scanState: "idle",
    isLoading: false,
    isRefreshing: false,
    error: null,
    initialize: vi.fn(),
    hydrateShell: vi.fn(),
    refreshScanInBackground: vi.fn(),
    rescan: vi.fn(),
    refreshCounts: vi.fn(),
    resetForTargetChange: vi.fn(),
    setCategoryVisibility: vi.fn(),
    setAgentEnabled: vi.fn(),
    applyScanSummary: vi.fn(),
    setCollectionCount: vi.fn(),
    addCustomAgent: vi.fn(),
    updateCustomAgent: vi.fn(),
    removeCustomAgent: vi.fn(),
    ...overrides,
  };
}

function renderSidebar(initialPath = "/central") {
  vi.mocked(usePlatformStore).mockImplementation((selector?: unknown) => {
    const state = buildPlatformStoreState();
    if (typeof selector === "function") return selector(state);
    return state;
  });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
      <LocationProbe />
    </MemoryRouter>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function sampleProject(overrides: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    path: `D:/work/${overrides.name}`,
    pinned: false,
    addedAt: "2026-01-01T00:00:00Z",
    lastScannedAt: null,
    skillCount: 0,
    ...overrides,
  };
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.removeItem(SIDEBAR_WORKSPACE_SECTIONS_KEY);
    useProjectsStore.setState({
      projects: [],
      scanningProjectIds: new Set(),
    });
  });

  it("renders expanded sidebar by default", () => {
    const { container } = renderSidebar();
    const nav = container.querySelector("nav");
    expect(nav).toHaveStyle({ width: "208px" });
  });

  it("places Rules after Central and navigates in expanded and collapsed states", () => {
    const { container } = renderSidebar();
    const buttons = Array.from(container.querySelectorAll("nav button"));
    const central = screen.getByRole("button", { name: /中央技能库/ });
    const rules = screen.getByRole("button", { name: "规则管理" });
    expect(buttons.indexOf(rules)).toBe(buttons.indexOf(central) + 1);
    fireEvent.click(rules);
    expect(screen.getByTestId("location")).toHaveTextContent("/rules");
    fireEvent.click(screen.getByRole("button", { name: "折叠侧边栏" }));
    expect(screen.getByRole("button", { name: "规则管理" })).toBeInTheDocument();
  });

  it("defaults to collapsed sidebar on narrow viewports", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    try {
      const { container } = renderSidebar();
      const nav = container.querySelector("nav");
      expect(nav).toHaveStyle({ width: "56px" });
      expect(screen.getByRole("button", { name: /Dashboard/ })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
      });
    }
  });

  it("supports keyboard resizing from the right edge", () => {
    const { container } = renderSidebar();
    const nav = container.querySelector("nav");

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });

    expect(nav).toHaveStyle({ width: "224px" });
  });

  it("renders central, projects, collections, and platform entries", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: /中央技能库/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^项目$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /技能集合/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /操作日志/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claude Code/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Universal/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /收起全局工作区/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /OpenClaw/ })).not.toBeInTheDocument();
    expect(screen.queryByText("龙虾类")).not.toBeInTheDocument();
  });

  it("renders Skill Usage entry below Operation Logs and routes to /usage", () => {
    renderSidebar();
    const usageButton = screen.getByRole("button", { name: /技能使用/ });
    expect(usageButton).toBeInTheDocument();
    fireEvent.click(usageButton);
    expect(screen.getByTestId("location")).toHaveTextContent("/usage");
  });

  it("highlights Skill Usage when on /usage", () => {
    renderSidebar("/usage");
    const usageButton = screen.getByRole("button", { name: /技能使用/ });
    expect(usageButton.className).toContain("bg-sidebar-primary");
    expect(usageButton).toHaveAttribute("aria-current", "page");
  });

  it("shows a blocking loading row only during shell hydration", () => {
    vi.mocked(usePlatformStore).mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({ isLoading: true });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText("扫描中...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claude Code/ })).not.toBeInTheDocument();
  });

  it("renders Settings as a fixed sidebar destination", () => {
    const { container } = renderSidebar();
    const settingsButton = screen.getByRole("button", { name: /设置/ });

    expect(settingsButton).toBeInTheDocument();
    expect(settingsButton.closest("nav")).toBe(container.querySelector("nav"));
  });

  it("highlights Settings when on settings subpages", () => {
    renderSidebar("/settings/connections");
    const settingsButton = screen.getByRole("button", { name: /设置/ });
    const centralButton = screen.getByRole("button", { name: /中央技能库/ });

    expect(settingsButton.className).toContain("bg-sidebar-primary");
    expect(settingsButton.className).toContain("font-semibold");
    expect(settingsButton).toHaveAttribute("aria-current", "page");
    expect(centralButton.className).not.toContain("bg-sidebar-primary");
    expect(centralButton).not.toHaveAttribute("aria-current");
  });

  it("keeps platform entries visible during background refresh", () => {
    vi.mocked(usePlatformStore).mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({
        isRefreshing: true,
        scanState: "refreshing",
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /Claude Code/ })).toBeInTheDocument();
    expect(screen.getAllByText("扫描中...").length).toBeGreaterThan(0);
  });

  it("highlights the active route", () => {
    renderSidebar("/platform/claude-code");
    const claudeButton = screen.getByRole("button", { name: /Claude Code/ });
    expect(claudeButton.className).toContain("bg-sidebar-primary");
    expect(claudeButton).toHaveAttribute("aria-current", "page");
  });

  it("highlights Central Skills when on /central", () => {
    renderSidebar("/central");
    const centralButton = screen.getByRole("button", { name: /中央技能库/ });
    expect(centralButton.className).toContain("bg-sidebar-primary");
  });

  it("routes Universal to its platform page", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: /Universal/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/platform/universal-agents");
  });

  it("highlights Universal without highlighting Central", () => {
    renderSidebar("/platform/universal-agents");
    const universalButton = screen.getByRole("button", { name: /Universal/ });
    const centralButton = screen.getByRole("button", { name: /中央技能库/ });

    expect(universalButton.className).toContain("bg-sidebar-primary");
    expect(centralButton.className).not.toContain("bg-sidebar-primary");
  });

  it("uses the Universal representative count instead of the Central count", () => {
    renderSidebar();
    const universalButton = screen.getByRole("button", { name: /Universal/ });

    expect(within(universalButton).getByText("7")).toBeInTheDocument();
    expect(within(universalButton).queryByText("10")).not.toBeInTheDocument();
  });

  it("keeps lobster platforms out of the sidebar when the lobster group is enabled", () => {
    vi.mocked(usePlatformStore).mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({
        categoryVisibility: {
          coding: true,
          lobster: true,
        },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /Claude Code/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /OpenClaw/ })).not.toBeInTheDocument();
    expect(screen.queryByText("龙虾类")).not.toBeInTheDocument();
  });

  it("hides lobster platforms when the lobster group is disabled", () => {
    vi.mocked(usePlatformStore).mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({
        categoryVisibility: {
          coding: true,
          lobster: false,
        },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /Claude Code/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /OpenClaw/ })).not.toBeInTheDocument();
  });

  it("keeps enabled global platform entries visible when saved categories are all hidden", () => {
    vi.mocked(usePlatformStore).mockImplementation((selector?: unknown) => {
      const state = buildPlatformStoreState({
        categoryVisibility: {
          coding: false,
          lobster: false,
        },
      });
      if (typeof selector === "function") return selector(state);
      return state;
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /Claude Code/ })).toBeInTheDocument();
  });

  it("renders Dashboard as the first top-level destination", () => {
    renderSidebar();
    const dashboardButton = screen.getByRole("button", { name: /Dashboard/ });
    const centralButton = screen.getByRole("button", { name: /中央技能库/ });

    expect(dashboardButton).toBeInTheDocument();
    expect(
      dashboardButton.compareDocumentPosition(centralButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("highlights Dashboard when on /dashboard", () => {
    renderSidebar("/dashboard");
    const dashboardButton = screen.getByRole("button", { name: /Dashboard/ });
    const centralButton = screen.getByRole("button", { name: /中央技能库/ });

    expect(dashboardButton.className).toContain("bg-sidebar-primary");
    expect(centralButton.className).not.toContain("bg-sidebar-primary");
  });

  it("keeps Dashboard accessible when collapsed", () => {
    renderSidebar("/dashboard");
    fireEvent.click(screen.getByRole("button", { name: /折叠侧边栏/ }));

    expect(screen.getByRole("button", { name: /Dashboard/ })).toBeInTheDocument();
  });

  it("central and platform entries remain clickable", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: /中央技能库/ }));
    fireEvent.click(screen.getByRole("button", { name: /Claude Code/ }));
  });

  it("lists registered projects and opens the project route", () => {
    useProjectsStore.setState({
      projects: [
        sampleProject({
          id: "alpha",
          name: "Alpha",
          path: "D:/work/Alpha",
          skillCount: 0,
          pinned: true,
        }),
      ],
      scanningProjectIds: new Set(),
    });

    renderSidebar();

    const projectButton = screen.getByRole("button", { name: "Alpha" });
    expect(projectButton).toHaveAttribute("title", "D:\\work\\Alpha");
    expect(within(projectButton).getByText("0")).toBeInTheDocument();
    expect(within(projectButton).getByTitle("置顶")).toBeInTheDocument();
    fireEvent.click(projectButton);
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/alpha");
  });

  it("collapses project rows and restores that choice after remount", () => {
    useProjectsStore.setState({
      projects: [sampleProject({ id: "alpha", name: "Alpha" })],
      scanningProjectIds: new Set(),
    });

    const first = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "收起项目工作区" }));
    expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
    first.unmount();

    renderSidebar();
    expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开项目工作区" }));
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
  });

  it.each([
    { label: "名称", value: "name", order: ["Pinned", "Alpha", "Beta", "Coda"] },
    { label: "技能数", value: "skillCount", order: ["Pinned", "Coda", "Beta", "Alpha"] },
    { label: "最近扫描", value: "recent", order: ["Pinned", "Beta", "Alpha", "Coda"] },
  ])("sorts by $value and restores the selection after remount", async ({ label, value, order }) => {
    const user = userEvent.setup();
    useProjectsStore.setState({
      projects: [
        sampleProject({ id: "alpha", name: "Alpha", skillCount: 1, lastScannedAt: "2026-02-01T00:00:00Z" }),
        sampleProject({ id: "beta", name: "Beta", skillCount: 2, lastScannedAt: "2026-03-01T00:00:00Z" }),
        sampleProject({ id: "coda", name: "Coda", skillCount: 4 }),
        sampleProject({ id: "pinned", name: "Pinned", pinned: true }),
      ],
      scanningProjectIds: new Set(),
    });

    const projectNames = () => screen.getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter((name) => order.includes(name ?? ""));
    const view = renderSidebar();
    await user.click(screen.getByRole("button", { name: "项目排序" }));
    let menu = await screen.findByRole("menu", { name: "项目排序" }, { timeout: 5_000 });
    expect(within(menu).getByRole("menuitemradio", { name: "名称" })).toHaveAttribute("aria-checked", "true");
    if (value === "name") {
      await user.click(within(menu).getByRole("menuitemradio", { name: "技能数" }));
      await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: "项目排序" }));
      menu = await screen.findByRole("menu", { name: "项目排序" }, { timeout: 5_000 });
    }
    await user.click(within(menu).getByRole("menuitemradio", { name: label }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(projectNames()).toEqual(order);
    expect(screen.getByRole("button", { name: "收起项目工作区" })).toHaveAttribute("aria-expanded", "true");
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_WORKSPACE_SECTIONS_KEY)!)).toMatchObject({ projectSort: value });

    view.unmount();
    renderSidebar();
    expect(projectNames()).toEqual(order);
    expect(screen.getByRole("button", { name: "项目排序" })).toHaveAccessibleDescription(`当前排序：${label}`);
    await user.click(screen.getByRole("button", { name: "项目排序" }));
    const restoredMenu = await screen.findByRole("menu", { name: "项目排序" }, { timeout: 5_000 });
    expect(within(restoredMenu).getByRole("menuitemradio", { name: label })).toHaveAttribute("aria-checked", "true");
  });

  it("supports keyboard selection and Escape returns focus without collapsing the section", async () => {
    const user = userEvent.setup();
    useProjectsStore.setState({ projects: [sampleProject({ id: "alpha", name: "Alpha" })] });
    renderSidebar();
    const trigger = screen.getByRole("button", { name: "项目排序" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: "项目排序" }, { timeout: 5_000 });
    await waitFor(() => expect(within(menu).getByRole("menuitemradio", { name: "名称" })).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAccessibleDescription("当前排序：技能数");
    await user.keyboard(" ");
    await screen.findByRole("menu", { name: "项目排序" }, { timeout: 5_000 });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("button", { name: "收起项目工作区" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
  });

  it.each(["收起项目工作区", "折叠侧边栏"])("removes an open sort menu when clicking %s", async (name) => {
    const user = userEvent.setup();
    useProjectsStore.setState({ projects: [sampleProject({ id: "alpha", name: "Alpha" })] });
    renderSidebar();
    await user.click(screen.getByRole("button", { name: "项目排序" }));
    await screen.findByRole("menu", { name: "项目排序" }, { timeout: 5_000 });
    await user.click(screen.getByRole("button", { name }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "项目排序" })).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBeVisible();
  });

  it("still shows project icons when the sidebar rail is collapsed", () => {
    window.localStorage.setItem(
      SIDEBAR_WORKSPACE_SECTIONS_KEY,
      JSON.stringify({
        globalWorkspace: false,
        projectWorkspace: false,
        projectSort: "name",
      }),
    );
    useProjectsStore.setState({
      projects: [sampleProject({ id: "alpha", name: "Alpha" })],
      scanningProjectIds: new Set(),
    });

    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "折叠侧边栏" }));

    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claude Code/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "项目排序" })).not.toBeInTheDocument();
  });
});
