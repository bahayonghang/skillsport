import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { ActivityHeatmap } from "@/components/usage/ActivityHeatmap";
import { PlatformFilterBar } from "@/components/usage/PlatformFilterBar";
import { ProviderHealthList } from "@/components/usage/ProviderHealthList";
import { RecentCallsFeed } from "@/components/usage/RecentCallsFeed";
import { SkillUsageDetailPanel } from "@/components/usage/SkillUsageDetailPanel";
import { SkillUsageTable } from "@/components/usage/SkillUsageTable";
import { UsageMetricStrip } from "@/components/usage/UsageMetricStrip";
import { UsageFilterButton } from "@/components/usage/UsageFilterControls";
import { useTargetStore } from "@/stores/targetStore";
import { useUsageStore } from "@/stores/usageStore";
import type {
  DayCount,
  RecentSkillCall,
  SkillUsageDetail,
  SkillUsageSummary,
} from "@/types/usage";

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

const initialUsageActions = {
  refresh: useUsageStore.getState().refresh,
  loadDetail: useUsageStore.getState().loadDetail,
  subscribeTargetChanged: useUsageStore.getState().subscribeTargetChanged,
  subscribeScanCompleted: useUsageStore.getState().subscribeScanCompleted,
};

const skills: SkillUsageSummary[] = [
  {
    skill: "git-commit",
    count: 10,
    projects: 2,
    sessions: 5,
    lastUsedMs: 3_000,
    matchStatus: "matched",
    resolvedSkillId: "git-commit",
    staticTokenEstimate: 420,
    staticByteCount: 1_600,
  },
  {
    skill: "review",
    count: 25,
    projects: 1,
    sessions: 8,
    lastUsedMs: 2_000,
    matchStatus: "ambiguous",
    resolvedSkillId: null,
    staticTokenEstimate: null,
    staticByteCount: null,
  },
  {
    skill: "facts",
    count: 5,
    projects: 3,
    sessions: 2,
    lastUsedMs: 5_000,
    matchStatus: "unmatched",
    resolvedSkillId: null,
    staticTokenEstimate: null,
    staticByteCount: null,
  },
];

const recent: RecentSkillCall[] = [
  {
    skill: "git-commit",
    timestampMs: Date.now() - 60_000,
    project: "C:/Users/demo/repo-a",
    sessionId: "s1",
    source: "Codex CLI",
    matchStatus: "matched",
    resolvedSkillId: "git-commit",
  },
  {
    skill: "review",
    timestampMs: Date.now() - 3_600_000,
    project: "/home/demo/repo-b",
    sessionId: "s2",
    source: "Claude Code",
    matchStatus: "ambiguous",
    resolvedSkillId: null,
  },
];

beforeEach(() => {
  useUsageStore.setState({
    overview: null,
    recent: [],
    providers: [],
    detail: null,
    unused: null,
    unusedLoading: false,
    unusedError: null,
    scope: null,
    selectedSource: null,
    selectedSkill: null,
    loading: false,
    refreshing: false,
    detailLoading: false,
    error: null,
    refreshError: null,
    usedCachedData: false,
    lastRefreshMs: null,
    backgroundScanning: false,
    ...initialUsageActions,
  });
  useTargetStore.setState({
    targets: [{ id: "local", kind: "local", label: "Local", isActive: true }],
    activeTarget: {
      id: "local",
      kind: "local",
      label: "Local",
      isActive: true,
    },
  });
});

describe("UsageMetricStrip", () => {
  it("renders a compact four-metric strip with an explicit all-history range", () => {
    render(
      wrap(
        <UsageMetricStrip
          kpis={{
            totalCalls: 1_234,
            uniqueSkills: 7,
            uniqueProjects: 3,
            uniqueSources: 2,
            uniqueSessions: 5,
          }}
        />,
      ),
    );

    expect(screen.getByText(/1,234|1234/)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /全部已记录|All recorded/ }),
    ).toBeInTheDocument();
    expect(document.querySelector("[class*='gradient']")).toBeNull();
  });
});

describe("UsageFilterButton", () => {
  it("preserves the minimum target width over the inherited desktop size variant", () => {
    render(<UsageFilterButton pressed={false}>All</UsageFilterButton>);
    const button = screen.getByRole("button", { name: "All" });
    expect(button).toHaveClass("min-w-[40px]", "md:min-w-[40px]");
    expect(button).not.toHaveClass("md:min-w-0");
  });

  it("keeps the selected fill on dark hover over the inherited ghost variant", () => {
    render(<UsageFilterButton pressed>All</UsageFilterButton>);
    const button = screen.getByRole("button", { name: "All" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("hover:bg-primary", "dark:hover:bg-primary");
    expect(button).not.toHaveClass("dark:hover:bg-muted/50");
  });
});

describe("platform and provider controls", () => {
  const providers = [
    {
      providerId: "claude-code",
      displayName: "Claude Code",
      available: true,
      callCount: 42,
      scannedAtMs: Date.now(),
    },
    {
      providerId: "antigravity",
      displayName: "Antigravity",
      available: false,
      callCount: 0,
      scannedAtMs: 0,
    },
  ];

  it("disables sources without calls and keeps provider zero distinct from unavailable", () => {
    const onSelect = vi.fn();
    render(
      wrap(
        <>
          <PlatformFilterBar
            providers={providers}
            selected={null}
            onSelect={onSelect}
          />
          <ProviderHealthList providers={providers} />
        </>,
      ),
    );

    expect(screen.getByTestId("platform-pill-claude-code")).toBeEnabled();
    expect(screen.getByTestId("platform-pill-antigravity")).toBeDisabled();
    expect(screen.getByTestId("platform-pill-all")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("platform-pill-claude-code")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("platform-pill-antigravity")).toHaveAttribute("title");
    expect(screen.getByTestId("provider-row-antigravity").textContent).toMatch(
      /未检测到|not detected/,
    );
  });

  it("exposes the selected platform to keyboard and assistive users", () => {
    const onSelect = vi.fn();
    render(
      <PlatformFilterBar
        providers={providers}
        selected="Claude Code"
        onSelect={onSelect}
      />,
    );
    const selected = screen.getByTestId("platform-pill-claude-code");
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("platform-pill-all")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("platform-pill-all"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("keeps the secondary provider action reachable at every font scale", () => {
    const onSelect = vi.fn();
    render(
      <ProviderHealthList
        providers={providers}
        activeSource="Claude Code"
        onSelect={onSelect}
      />,
    );
    const button = within(screen.getByTestId("provider-row-claude-code")).getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("min-h-[40px]", "focus-visible:ring-2");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("Claude Code");
  });
});

describe("SkillUsageTable", () => {
  it("shows stable decision columns and defaults to count descending", () => {
    render(
      wrap(
        <SkillUsageTable
          skills={skills}
          selectedSkill={null}
          onSelect={vi.fn()}
        />,
      ),
    );
    const rows = screen.getAllByTestId(/^usage-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "usage-row-review");
    expect(rows[1]).toHaveAttribute("data-testid", "usage-row-git-commit");
    expect(document.body.textContent).toMatch(
      /无法唯一映射|Not uniquely mapped/,
    );
    expect(document.body.textContent).toMatch(/420/);
  });

  it("uses explicit sort options and row selection for usage detail", () => {
    const onSelect = vi.fn();
    render(
      wrap(
        <SkillUsageTable
          skills={skills}
          selectedSkill="review"
          onSelect={onSelect}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /按名称|name/i }));
    expect(screen.getAllByTestId(/^usage-row-/)[0]).toHaveAttribute(
      "data-testid",
      "usage-row-facts",
    );
    const reviewButton = screen
      .getByTestId("usage-row-review")
      .querySelector("button")!;
    fireEvent.click(reviewButton);
    expect(onSelect).toHaveBeenCalledWith("review", reviewButton, expect.any(Function));
    expect(reviewButton).toHaveAttribute("aria-pressed", "true");
  });

  it("exposes navigation only for uniquely matched rows", () => {
    function Probe() {
      return <span data-testid="location">{useLocation().pathname}</span>;
    }
    render(
      <MemoryRouter initialEntries={["/usage"]}>
        <Routes>
          <Route
            path="/usage"
            element={<SkillUsageTable skills={skills} onSelect={vi.fn()} />}
          />
          <Route path="/skill/:id" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getAllByRole("button", { name: /打开技能|Open skill/ }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: /打开技能 git-commit|Open skill git-commit/,
      }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/skill/git-commit",
    );
  });

  it("filters installed and unlinked rows locally and updates the count", () => {
    render(wrap(<SkillUsageTable skills={skills} onSelect={vi.fn()} />));

    const filterGroup = screen.getByRole("group", {
      name: /按安装状态筛选|Filter by install state/,
    });
    const installed = within(filterGroup).getByRole("button", {
      name: /已安装|Installed/,
    });
    const unlinked = within(filterGroup).getByRole("button", {
      name: /未关联|Unlinked/,
    });
    const all = within(filterGroup).getByRole("button", {
      name: /^全部$|^All$/,
    });

    fireEvent.click(installed);
    expect(screen.getByTestId("usage-row-git-commit")).toBeInTheDocument();
    expect(screen.queryByTestId("usage-row-review")).not.toBeInTheDocument();
    expect(screen.queryByTestId("usage-row-facts")).not.toBeInTheDocument();
    expect(document.body.textContent).toMatch(/1\s*\/\s*3/);

    fireEvent.click(unlinked);
    expect(screen.queryByTestId("usage-row-git-commit")).not.toBeInTheDocument();
    expect(screen.getByTestId("usage-row-review")).toBeInTheDocument();
    expect(screen.getByTestId("usage-row-facts")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/2\s*\/\s*3/);

    fireEvent.click(all);
    expect(screen.getAllByTestId(/^usage-row-/)).toHaveLength(3);
  });

  it("shows a distinct empty state when the install filter has no matches", () => {
    render(
      wrap(<SkillUsageTable skills={[skills[2]]} onSelect={vi.fn()} />),
    );

    const filterGroup = screen.getByRole("group", {
      name: /按安装状态筛选|Filter by install state/,
    });
    fireEvent.click(
      within(filterGroup).getByRole("button", {
        name: /已安装|Installed/,
      }),
    );

    expect(
      screen.getByText(/没有符合筛选条件的技能|No skills match this filter/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/切回.*全部|Switch back to.*All/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("usage-row-facts")).not.toBeInTheDocument();
  });

  it("keeps match text alongside semantic status dots", () => {
    render(wrap(<SkillUsageTable skills={skills} onSelect={vi.fn()} />));

    expect(
      screen
        .getByTestId("usage-row-git-commit")
        .querySelector('[class~="bg-success"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByTestId("usage-row-review")
        .querySelector('[class~="bg-warning"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByTestId("usage-row-facts")
        .querySelector('[class~="bg-muted-foreground/40"]'),
    ).not.toBeNull();
    expect(document.body.textContent).toMatch(/已匹配|Matched/);
    expect(document.body.textContent).toMatch(/无法唯一映射|Not uniquely mapped/);
    expect(document.body.textContent).toMatch(/未映射|Unmapped/);
  });
});

describe("ActivityHeatmap", () => {
  function buildDays(counts: number[]): DayCount[] {
    return counts.map((count, index) => ({
      date: new Date(Date.UTC(2024, 0, 1) + index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      count,
    }));
  }

  it("renders 112 focusable cells, quantile levels, months and a legend", () => {
    const days = buildDays([1, 2, 3, 4, 5, 100, ...new Array(106).fill(0)]);
    render(<ActivityHeatmap days={days} />);

    const cells = screen.getAllByRole("gridcell");
    expect(cells).toHaveLength(112);
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    cells[0].focus();
    fireEvent.keyDown(cells[0], { key: "ArrowRight" });
    expect(cells[7]).toHaveFocus();
    fireEvent.keyDown(cells[7], { key: "ArrowDown" });
    expect(cells[8]).toHaveFocus();
    fireEvent.keyDown(cells[8], { key: "ArrowUp" });
    expect(cells[7]).toHaveFocus();
    fireEvent.keyDown(cells[7], { key: "ArrowLeft" });
    expect(cells[0]).toHaveFocus();
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    expect(document.body.textContent).toMatch(/少|Less/);
    expect(document.body.textContent).toMatch(/多|More/);
    expect(cells[5]).toHaveAttribute("data-level", "5");
  });

  it("uses fixed cell tracks instead of aspect-square plus 1fr columns", () => {
    const days = buildDays([1, ...new Array(111).fill(0)]);
    const { rerender } = render(<ActivityHeatmap days={days} />);

    const grid = screen.getByTestId("heatmap-grid");
    expect(grid.className).toContain("auto-cols-[1rem]");
    expect(grid.className).not.toContain("auto-cols-fr");
    expect(grid.className).not.toContain("flex-1");

    const cell = screen.getAllByRole("gridcell")[0];
    expect(cell.className).toContain("size-4");
    expect(cell.className).not.toContain("aspect-square");
    expect(cell.className).not.toMatch(/(?:^|\s)w-full(?:\s|$)/);

    rerender(<ActivityHeatmap days={days} compact />);
    expect(screen.getByTestId("heatmap-grid").className).toContain(
      "auto-cols-[0.625rem]",
    );
    expect(screen.getAllByRole("gridcell")[0].className).toContain("size-2.5");
    expect(screen.getAllByRole("gridcell")[0].className).not.toContain(
      "aspect-square",
    );
  });

  it("allocates month labels their week spans and omits a single-week residual month", () => {
    const days = Array.from({ length: 112 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 6, 27) + index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      count: 0,
    }));
    render(<ActivityHeatmap days={days} />);
    const labels = screen.getByTestId("heatmap-months").querySelectorAll("span");
    expect(labels).toHaveLength(4);
    expect(labels[0].style.gridColumn).toBe("2 / span 5");
    expect(labels[1].style.gridColumn).toBe("7 / span 4");
    expect(labels[2].style.gridColumn).toBe("11 / span 4");
    expect(labels[3].style.gridColumn).toBe("15 / span 2");
    expect(screen.getAllByRole("gridcell")).toHaveLength(112);
    expect(screen.getByTestId("heatmap-cell-2026-07-27")).toHaveAttribute("data-level", "0");
    const plot = screen.getByTestId("heatmap-plot");
    expect(plot).toContainElement(screen.getByTestId("heatmap-grid"));
    expect(plot).toContainElement(screen.getByTestId("heatmap-legend"));
  });

  it("keeps every date across a year boundary and renders the activity empty state", () => {
    const days = Array.from({ length: 112 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 11, 28) + index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      count: 0,
    }));
    const { rerender } = render(<ActivityHeatmap days={days} compact />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(112);
    expect(screen.getByTestId("heatmap-cell-2027-01-01")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-months").firstElementChild).toHaveStyle({
      gridColumn: "2 / span 4",
    });
    rerender(<ActivityHeatmap days={[]} />);
    expect(screen.queryByRole("gridcell")).not.toBeInTheDocument();
    expect(document.body.textContent).toMatch(/活动|activity/i);
  });
});

describe("detail and recent actions", () => {
  const detail: SkillUsageDetail = {
    skill: "git-commit",
    count: 10,
    sessions: 5,
    firstUsedMs: Date.now() - 10 * 86_400_000,
    lastUsedMs: Date.now() - 60_000,
    byProject: [
      {
        project: "C:/Users/demo/repo-a",
        count: 10,
        sessions: 5,
        lastUsedMs: Date.now() - 60_000,
      },
    ],
    weekly: [],
    matchStatus: "matched",
    resolvedSkillId: "git-commit",
    staticTokenEstimate: 420,
    staticByteCount: 1_600,
  };

  it("selects recent rows without exposing full project paths", () => {
    const onSelect = vi.fn();
    render(wrap(<RecentCallsFeed calls={recent} onSelect={onSelect} />));
    expect(screen.getByText("repo-a")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("C:/Users/demo");
    fireEvent.click(screen.getByText("review"));
    expect(onSelect).toHaveBeenCalledWith(
      "review",
      expect.any(HTMLButtonElement),
    );
  });

  it("preserves repeated identical calls without duplicate keys and keeps existing triggers when a newer call arrives", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { rerender } = render(wrap(<RecentCallsFeed calls={[recent[0], recent[0]]} onSelect={vi.fn()} />));
      const original = within(screen.getByTestId("recent-feed")).getAllByRole("button", { name: /git-commit.*Codex CLI/ });
      expect(original).toHaveLength(2);
      rerender(wrap(<RecentCallsFeed calls={[recent[1], recent[0], recent[0]]} onSelect={vi.fn()} />));
      expect(within(screen.getByTestId("recent-feed")).getAllByRole("button", { name: /git-commit.*Codex CLI/ })).toEqual(original);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("renders project session counts, static estimate and close action", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <SkillUsageDetailPanel
          detail={detail}
          loading={false}
          onClose={onClose}
        />,
      ),
    );
    expect(screen.getByTestId("usage-detail-panel")).toHaveTextContent(
      "repo-a",
    );
    expect(screen.getByTestId("usage-detail-panel")).toHaveTextContent("420");
    fireEvent.click(screen.getByRole("button", { name: /关闭|Close usage/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can close a pending detail and replaces its skeleton after a failed request", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      wrap(<SkillUsageDetailPanel detail={null} loading onClose={onClose} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /关闭|Close usage/ }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      wrap(
        <SkillUsageDetailPanel
          detail={null}
          loading={false}
          error="detail failed"
          onClose={onClose}
        />,
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("detail failed");
    expect(screen.queryByTestId("usage-detail-loading")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /关闭|Close usage/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("SkillUsageView", () => {
  it("shows a reduced-motion-safe scanning skeleton before refresh starts", async () => {
    useUsageStore.setState({
      overview: null,
      refreshing: false,
      refresh: vi.fn(async () => null),
      subscribeTargetChanged: vi.fn(async () => () => undefined),
    });
    const { SkillUsageView } = await import("@/pages/SkillUsageView");
    render(wrap(<SkillUsageView />));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      /正在扫描各平台会话日志|Scanning session logs across platforms/,
    );
    expect(status.querySelector("svg")).toHaveClass(
      "motion-reduce:animate-none",
    );
    expect(screen.queryByText(/调用次数|Calls/)).not.toBeInTheDocument();
  });

  it("exits the scanning skeleton when an uncached refresh fails", async () => {
    useUsageStore.setState({
      overview: null,
      refreshing: false,
      error: "scan failed",
      refresh: vi.fn(async () => null),
      subscribeTargetChanged: vi.fn(async () => () => undefined),
    });
    const { SkillUsageView } = await import("@/pages/SkillUsageView");
    render(wrap(<SkillUsageView />));

    expect(screen.getByRole("alert")).toHaveTextContent("scan failed");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it("shows a failed source request while preserving the previous ranking", async () => {
    useUsageStore.setState({
      overview: {
        kpis: {
          totalCalls: 40,
          uniqueSkills: 3,
          uniqueProjects: 2,
          uniqueSources: 2,
          uniqueSessions: 12,
        },
        topSkills: skills,
        heatmap: [],
        lastScanMs: Date.now(),
      },
      selectedSource: "Claude Code",
      error: "source failed",
      refresh: vi.fn(async () => null),
      subscribeTargetChanged: vi.fn(async () => () => undefined),
    });
    const { SkillUsageView } = await import("@/pages/SkillUsageView");
    render(wrap(<SkillUsageView />));
    expect(screen.getByRole("alert")).toHaveTextContent("source failed");
    expect(screen.getAllByTestId(/^usage-row-/)).toHaveLength(3);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /刷新|Refresh now/ })).toBeEnabled();
  });

  it("restores row focus when a failed detail is closed", async () => {
    useUsageStore.setState({
      overview: {
        kpis: {
          totalCalls: 40,
          uniqueSkills: 3,
          uniqueProjects: 2,
          uniqueSources: 2,
          uniqueSessions: 12,
        },
        topSkills: skills,
        heatmap: [],
        lastScanMs: Date.now(),
      },
      refresh: vi.fn(async () => null),
      subscribeTargetChanged: vi.fn(async () => () => undefined),
      loadDetail: vi.fn(async (skill) => {
        useUsageStore.setState({
          selectedSkill: skill,
          detail: null,
          detailLoading: false,
          error: "detail failed",
        });
      }),
    });
    const { SkillUsageView } = await import("@/pages/SkillUsageView");
    render(wrap(<SkillUsageView />));
    const rowButton = within(screen.getByTestId("usage-row-review")).getByRole("button");
    fireEvent.click(rowButton);
    expect(screen.getByTestId("usage-detail-error")).toHaveTextContent("detail failed");
    fireEvent.click(screen.getByRole("button", { name: /关闭|Close usage/ }));
    await waitFor(() => expect(rowButton).toHaveFocus());
    expect(screen.queryByTestId("usage-detail-error")).not.toBeInTheDocument();
  });

  it.each([true, false])("keeps a recent detail trigger mounted and restores its focus after closing: pending=%s", async (pending) => {
    useUsageStore.setState({
      overview: {
        kpis: { totalCalls: 40, uniqueSkills: 3, uniqueProjects: 2, uniqueSources: 2, uniqueSessions: 12 },
        topSkills: skills, heatmap: [], lastScanMs: Date.now(),
      },
      recent,
      refresh: vi.fn(async () => null),
      subscribeTargetChanged: vi.fn(async () => () => undefined),
      loadDetail: vi.fn(async (skill) => {
        useUsageStore.setState({
          selectedSkill: skill, detail: null, detailLoading: pending,
          error: pending ? null : "detail failed",
        });
      }),
    });
    const { SkillUsageView } = await import("@/pages/SkillUsageView");
    render(wrap(<SkillUsageView />));
    const rowButton = within(screen.getByTestId(`recent-row-${recent[0].skill}-${recent[0].timestampMs}`))
      .getByRole("button", { name: /git-commit.*Codex CLI/ });
    rowButton.focus();
    fireEvent.click(rowButton);
    expect(rowButton.isConnected).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /关闭|Close usage/ }));
    await waitFor(() => expect(rowButton).toHaveFocus());
  });

  it("shows remote cached state and keeps provider health secondary", async () => {
    useTargetStore.setState({
      targets: [
        { id: "ssh-prod", kind: "ssh", label: "alice@prod", isActive: true },
      ],
      activeTarget: {
        id: "ssh-prod",
        kind: "ssh",
        label: "alice@prod",
        isActive: true,
      },
    });
    useUsageStore.setState({
      overview: {
        kpis: {
          totalCalls: 40,
          uniqueSkills: 3,
          uniqueProjects: 2,
          uniqueSources: 2,
          uniqueSessions: 12,
        },
        topSkills: skills,
        heatmap: [],
        lastScanMs: Date.now(),
      },
      recent,
      providers: [],
      scope: {
        targetId: "ssh-prod",
        label: "alice@prod",
        isRemote: true,
        remoteReachable: false,
      },
      lastRefreshMs: Date.now(),
      usedCachedData: true,
      refreshError: "timeout",
    });
    const { SkillUsageView } = await import("@/pages/SkillUsageView");
    render(wrap(<SkillUsageView />));

    expect(screen.getByTestId("scope-badge")).toHaveAttribute(
      "data-scope-kind",
      "remote",
    );
    expect(screen.getByTestId("remote-unreachable-banner").textContent).toMatch(
      /上次|last successful/i,
    );
    expect(
      screen.getByText(/数据源状态|Provider health/).closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("shows a background-scan hint in the header while a rescan runs", async () => {
    useUsageStore.setState({
      overview: {
        kpis: {
          totalCalls: 40,
          uniqueSkills: 3,
          uniqueProjects: 2,
          uniqueSources: 2,
          uniqueSessions: 12,
        },
        topSkills: skills,
        heatmap: [],
        lastScanMs: Date.now(),
      },
      recent: [],
      providers: [],
      scope: {
        targetId: "local",
        label: "Local",
        isRemote: false,
        remoteReachable: false,
      },
      lastRefreshMs: Date.now(),
      backgroundScanning: true,
      refresh: vi.fn(async () => null),
      subscribeTargetChanged: vi.fn(async () => () => undefined),
      subscribeScanCompleted: vi.fn(async () => () => undefined),
    });
    const { SkillUsageView } = await import("@/pages/SkillUsageView");
    render(wrap(<SkillUsageView />));

    expect(screen.getByTestId("background-scan-hint")).toHaveTextContent(
      /正在后台重新扫描|Refreshing in the background/,
    );
    // 缓存页保持可见，无骨架屏回退
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps top-skills height independent of the heatmap and isolates both cards", async () => {
    useUsageStore.setState({
      overview: {
        kpis: {
          totalCalls: 40,
          uniqueSkills: 3,
          uniqueProjects: 2,
          uniqueSources: 2,
          uniqueSessions: 12,
        },
        topSkills: skills,
        heatmap: [],
        lastScanMs: Date.now(),
      },
      recent,
      providers: [],
    });
    const { SkillUsageView } = await import("@/pages/SkillUsageView");
    render(wrap(<SkillUsageView />));

    const topSkills = screen
      .getByRole("heading", { name: /技能频次|Top skills/ })
      .closest("section");
    const heatmap = screen
      .getByRole("heading", { name: /16 周|16-week/ })
      .closest("section");
    const unused = screen
      .getByRole("heading", { name: /未使用|Unused/ })
      .closest("section");

    expect(topSkills?.className).toContain("contain-layout");
    expect(topSkills?.className).not.toContain("row-span");
    expect(heatmap?.className).toContain("contain-layout");
    expect(unused?.className).not.toContain("contain-layout");
    expect(
      screen.getByRole("region", { name: /全部已记录|All recorded/ }).closest("header"),
    ).toBeInTheDocument();
  });
});
