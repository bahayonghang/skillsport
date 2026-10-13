import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { SkillUsageTable } from "@/components/usage/SkillUsageTable";
import { applyFontScale, getAppliedFontScale } from "@/lib/displayFont";
import type { SkillUsageSummary } from "@/types/usage";

let cardWidth = 900;

function rows(count: number): SkillUsageSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    skill: `skill-${String(index).padStart(5, "0")}`,
    count: count - index, projects: 1, sessions: 1, lastUsedMs: 1700000000000 + index,
    matchStatus: index % 2 === 0 ? "matched" : "unmatched",
    resolvedSkillId: index % 2 === 0 ? `id-${index}` : null,
    staticTokenEstimate: null, staticByteCount: null,
  }));
}

function selector(name: string) {
  return within(screen.getByTestId(`usage-row-${name}`)).getByRole("button", { pressed: false });
}

beforeEach(() => {
  cardWidth = 900;
  applyFontScale(1);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => cardWidth * getAppliedFontScale());
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 416 * getAppliedFontScale());
});

afterEach(() => {
  vi.restoreAllMocks();
  applyFontScale(1);
});

describe("SkillUsageTable bounded window", () => {
  it("bounds 10k rows in a real viewport and preserves valid list semantics and full result count", () => {
    render(<MemoryRouter><SkillUsageTable skills={rows(10000)} onSelect={vi.fn()} /></MemoryRouter>);
    const viewport = screen.getByTestId("usage-ranking-viewport");
    expect(viewport).toHaveAttribute("data-virtualized", "true");
    expect(viewport).toHaveClass("h-[26rem]");
    const items = within(viewport).getAllByRole("listitem");
    expect(items.length).toBeLessThanOrEqual(30);
    expect(items[0]).toHaveAttribute("aria-setsize", "10000");
    expect(items[0].tagName).toBe("LI");
    expect(items[0].parentElement?.tagName).toBe("UL");
    expect(viewport.querySelector("li li")).toBeNull();
    expect(viewport.querySelectorAll('button[data-usage-action="select"][tabindex="0"]')).toHaveLength(1);
  });

  it.each([
    [true, 0.875, 41], [true, 1, 41], [true, 1.125, 46],
    [false, 0.875, 52], [false, 1, 59], [false, 1.125, 67],
  ])("uses the applied scale for fixed row geometry: full=%s scale=%s", (full, scale, height) => {
    cardWidth = full ? 900 : 500;
    applyFontScale(Number(scale));
    render(<MemoryRouter><SkillUsageTable skills={rows(1000)} onSelect={vi.fn()} /></MemoryRouter>);
    expect(screen.getAllByRole("listitem")[0]).toHaveStyle({ height: `${height}px` });
    expect(screen.getAllByRole("listitem").length).toBeLessThanOrEqual(30);
    act(() => applyFontScale(1));
    expect(screen.getAllByRole("listitem")[0]).toHaveStyle({ height: full ? "41px" : "59px" });
  });

  it("reaches first and last results with arrows, Home and End, while retaining a separate open action", async () => {
    const onSelect = vi.fn();
    render(<MemoryRouter><SkillUsageTable skills={rows(10000)} onSelect={onSelect} /></MemoryRouter>);
    const first = selector("skill-00000");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    await waitFor(() => expect(selector("skill-00001")).toHaveFocus());
    fireEvent.keyDown(selector("skill-00001"), { key: "End" });
    await waitFor(() => expect(selector("skill-09999")).toHaveFocus());
    expect(screen.getByTestId("usage-ranking-viewport").scrollTop).toBeGreaterThan(0);
    fireEvent.keyDown(selector("skill-09999"), { key: "Home" });
    await waitFor(() => expect(selector("skill-00000")).toHaveFocus());
    expect(screen.getByTestId("usage-ranking-viewport").scrollTop).toBe(0);
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("skill-00000", selector("skill-00000"), expect.any(Function));
    expect(within(screen.getByTestId("usage-row-skill-00000")).getByLabelText(/打开技能|Open skill/)).toBeInTheDocument();
  });

  it("tabs through every result and exits after the last, including off-window rows", async () => {
    const data = rows(65).map((row) => ({ ...row, resolvedSkillId: null }));
    render(<MemoryRouter><SkillUsageTable skills={data} onSelect={vi.fn()} /><button>After ranking</button></MemoryRouter>);
    selector("skill-00000").focus();
    for (let index = 1; index < data.length; index += 1) {
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      await waitFor(() => expect(selector(data[index].skill)).toHaveFocus());
    }
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "After ranking" })).toHaveFocus();
  }, 15000);

  it("keeps matched row open actions in the Tab order in both directions", async () => {
    render(<MemoryRouter><SkillUsageTable skills={rows(1000)} onSelect={vi.fn()} /></MemoryRouter>);
    const first = selector("skill-00000");
    const open = within(screen.getByTestId("usage-row-skill-00000")).getByLabelText(/打开技能|Open skill/);
    first.focus();
    await userEvent.tab();
    expect(open).toHaveFocus();
    await userEvent.tab();
    await waitFor(() => expect(selector("skill-00001")).toHaveFocus());
    await userEvent.tab({ shift: true });
    await waitFor(() => expect(open).toHaveFocus());
    await userEvent.tab({ shift: true });
    expect(first).toHaveFocus();
  });

  it("retains the detail origin after selection clears, restores it after scrolling, and uses its latest sort index", async () => {
    const data = rows(1000);
    const onSelect = vi.fn();
    const { rerender } = render(<MemoryRouter><SkillUsageTable skills={data} onSelect={onSelect} /></MemoryRouter>);
    fireEvent.keyDown(selector("skill-00000"), { key: "End" });
    await waitFor(() => expect(selector("skill-00999")).toHaveFocus());
    fireEvent.click(selector("skill-00999"));
    const restore = onSelect.mock.calls[0][2] as () => void;
    const viewport = screen.getByTestId("usage-ranking-viewport");
    viewport.scrollTop = 0;
    fireEvent.scroll(viewport);
    rerender(<MemoryRouter><SkillUsageTable skills={data} selectedSkill={null} onSelect={onSelect} /></MemoryRouter>);
    expect(screen.getByTestId("usage-row-skill-00999")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeLessThanOrEqual(31);
    act(() => restore());
    await waitFor(() => expect(selector("skill-00999")).toHaveFocus());
    expect(viewport.scrollTop).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^按最近$|^recent$/i }));
    act(() => restore());
    await waitFor(() => expect(selector("skill-00999")).toHaveFocus());
    expect(selector("skill-00999")).toHaveAttribute("data-usage-index", "0");
    expect(viewport.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /^已安装$|^Installed$/i }));
    act(() => restore());
    expect(screen.getByRole("group", { name: /技能频次|Top skills/ })).toHaveFocus();
    expect(screen.queryByTestId("usage-row-skill-00999")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-setsize", "500");
  });

  it("keeps ordinary small lists fully reachable without virtualization", () => {
    render(<MemoryRouter><SkillUsageTable skills={rows(5)} onSelect={vi.fn()} /></MemoryRouter>);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByTestId("usage-ranking-viewport")).toHaveAttribute("data-virtualized", "false");
    expect(selector("skill-00004")).not.toHaveAttribute("tabindex", "-1");
  });

  it("keeps the focused row mounted when pointer scrolling moves its window away", async () => {
    render(<MemoryRouter><SkillUsageTable skills={rows(1000)} onSelect={vi.fn()} /></MemoryRouter>);
    selector("skill-00000").focus();
    fireEvent.keyDown(selector("skill-00000"), { key: "ArrowDown" });
    await waitFor(() => expect(selector("skill-00001")).toHaveFocus());
    const viewport = screen.getByTestId("usage-ranking-viewport");
    viewport.scrollTop = 40000;
    fireEvent.scroll(viewport);
    expect(selector("skill-00001")).toHaveFocus();
    expect(screen.getAllByRole("listitem").length).toBeLessThanOrEqual(31);
    fireEvent.keyDown(selector("skill-00001"), { key: "ArrowDown" });
    await waitFor(() => expect(selector("skill-00002")).toHaveFocus());
  });
});
