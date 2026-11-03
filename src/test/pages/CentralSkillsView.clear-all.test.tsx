import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderHook, screen, within } from "@testing-library/react";
import type { TFunction } from "i18next";

import {
  cleanupCentralSkillsViewTestState,
  renderCentralSkillsView,
  resetCentralSkillsViewTestState,
} from "./centralSkillsViewTestSupport";
import { centralClearFixturePreview } from "@/fixtures/centralClear";
import { defaultCentralViewState } from "@/lib/centralViewState";
import { useCentralPaletteActions } from "@/pages/centralPaletteActions";

const ASYNC_UI_TIMEOUT_MS = 5_000;

function clearAllOverrides(overrides: Record<string, unknown> = {}) {
  return {
    clearJob: null,
    previewClearCentral: vi.fn().mockResolvedValue(centralClearFixturePreview("orphanOnly")),
    clearCentral: vi.fn(),
    cancelClearCentral: vi.fn(),
    resetClearJob: vi.fn(),
    ...overrides,
  };
}

describe("CentralSkillsView clear-all entry points", () => {
  beforeEach(() => {
    resetCentralSkillsViewTestState();
    window.localStorage.clear();
  });

  afterEach(cleanupCentralSkillsViewTestState);

  it("opens the preview from the danger item at the bottom of the ⋯ menu", async () => {
    const overrides = clearAllOverrides();
    renderCentralSkillsView({ centralOverrides: overrides });
    fireEvent.click(screen.getByTestId("central-toolbar-more"));
    const menu = await screen.findByTestId("central-toolbar-more-menu");
    const item = within(menu).getByTestId("central-clear-all-open");
    expect(item).toHaveTextContent("一键清理中央仓库…");
    expect(item).toHaveAttribute("data-variant", "destructive");
    const menuItems = within(menu).getAllByRole("menuitem");
    expect(menuItems[menuItems.length - 1]).toBe(item);

    fireEvent.click(item);
    const dialog = await screen.findByRole(
      "alertdialog",
      {},
      { timeout: ASYNC_UI_TIMEOUT_MS },
    );
    expect(overrides.previewClearCentral).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText("一键清理中央仓库 · 本地")).toBeInTheDocument();
  });

  it("disables the menu item with a busy label while a clear job runs", async () => {
    renderCentralSkillsView({
      centralOverrides: clearAllOverrides({
        clearJob: { jobId: "j", phase: "skills", status: "running", completed: 1, total: 5 },
      }),
    });
    fireEvent.click(screen.getByTestId("central-toolbar-more"));
    const item = await screen.findByTestId("central-clear-all-open");
    expect(item).toHaveTextContent("清理中…");
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the empty-state residue check when Central is empty without filters", async () => {
    const overrides = clearAllOverrides({ skills: [] });
    renderCentralSkillsView({ centralOverrides: overrides });
    const button = screen.getByTestId("central-clear-all-empty-open");
    expect(button).toHaveTextContent("检查残留安装");
    fireEvent.click(button);
    await screen.findByRole("alertdialog", {}, { timeout: ASYNC_UI_TIMEOUT_MS });
    expect(overrides.previewClearCentral).toHaveBeenCalledTimes(1);
  });

  it("hides the empty-state residue check when a filter is active", () => {
    window.history.replaceState({}, "", "/?q=pdf");
    renderCentralSkillsView({ centralOverrides: clearAllOverrides({ skills: [] }) });
    expect(screen.queryByTestId("central-clear-all-empty-open")).not.toBeInTheDocument();
  });
});

describe("useCentralPaletteActions clear-central", () => {
  const t = ((key: string) =>
    key === "central.clearAll.paletteKeywords" ? "清理 清空 重置 clear reset" : key) as TFunction;

  it("adds a searchable clear-central action only when a handler is given", () => {
    const onClearCentral = vi.fn();
    const base = {
      t,
      viewState: defaultCentralViewState(),
      setViewState: vi.fn(),
      canSaveCurrent: false,
      onSaveCurrentView: vi.fn(),
      onCreateTagGroup: vi.fn(),
    };
    const { result } = renderHook(() => useCentralPaletteActions({ ...base, onClearCentral }));
    const action = result.current.actions.find((item) => item.id === "clear-central");
    expect(action?.label).toBe("central.clearAll.paletteAction");
    expect(action?.keywords).toEqual(["清理", "清空", "重置", "clear", "reset"]);
    action?.onSelect();
    expect(onClearCentral).toHaveBeenCalledTimes(1);

    const { result: without } = renderHook(() => useCentralPaletteActions(base));
    expect(without.current.actions.some((item) => item.id === "clear-central")).toBe(false);
  });
});
