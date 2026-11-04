import { render, screen } from "@testing-library/react";
import { chooseSelectOption } from "@/test/support/selectOption";
import { describe, expect, it, vi } from "vitest";

import { UpdateCenterToolbar } from "@/components/central/updateCenter/UpdateCenterToolbar";
import type { UpdateCenterTab } from "@/stores/updateCenterStore";

const TAB_ORDER: readonly UpdateCenterTab[] = [
  "updatable",
  "added",
  "missing",
  "failed",
  "unsupported",
  "duplicates",
  "deletedPlatformCopies",
  "orphans",
];

const EMPTY_COUNTS: Record<UpdateCenterTab, number> = {
  updatable: 0,
  added: 0,
  missing: 0,
  failed: 0,
  unsupported: 0,
  duplicates: 0,
  deletedPlatformCopies: 0,
  orphans: 0,
};

describe("UpdateCenterToolbar", () => {
  it("renders an explicit refresh mode control", async () => {
    const onRefreshModeChange = vi.fn();

    render(
      <UpdateCenterToolbar
        scopeKind="all"
        onScopeKindChange={vi.fn()}
        refreshMode="regular"
        onRefreshModeChange={onRefreshModeChange}
        isRefreshing={false}
        onRefresh={vi.fn()}
        lastRefreshedAt={null}
        activeTab="updatable"
        onTabChange={vi.fn()}
        tabOrder={TAB_ORDER}
        counts={EMPTY_COUNTS}
        scopeEnabled={{ all: true, repositories: false, platform: false, skills: false }}
      />,
    );

    const modeSelect = screen.getByLabelText("刷新模式");
    expect(modeSelect).toHaveAttribute("data-value", "regular");

    await chooseSelectOption(modeSelect, "增量和删减");

    expect(onRefreshModeChange).toHaveBeenCalledWith("sync");
  });
});
