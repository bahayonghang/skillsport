import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { TargetQuickSwitcher } from "@/components/layout/TargetQuickSwitcher";
import { useTargetStore } from "@/stores/targetStore";
import type { TargetSummary } from "@/types";

vi.mock("@/stores/targetStore", () => ({
  useTargetStore: vi.fn(),
}));

const mockUseTargetStore = vi.mocked(useTargetStore);

const localTarget: TargetSummary = {
  id: "local",
  kind: "local",
  label: "Local",
  isActive: true,
};

const sshTarget: TargetSummary = {
  id: "ssh-dckj",
  kind: "ssh",
  label: "dckj",
  host: "192.168.31.64",
  username: "lyh",
  port: 22,
  authMethod: "password",
  isActive: false,
};

const wslTarget: TargetSummary = {
  id: "wsl-ubuntu",
  kind: "wsl",
  label: "Ubuntu",
  distribution: "Ubuntu-24.04",
  remoteHome: "/home/lyh",
  remoteOs: "Linux",
  isActive: false,
};

function setupStore(overrides?: {
  targets?: TargetSummary[];
  activeTarget?: TargetSummary;
  switchingTargetId?: string | null;
  switchTarget?: ReturnType<typeof vi.fn>;
  error?: string | null;
  clearError?: ReturnType<typeof vi.fn>;
}) {
  const state = {
    targets: overrides?.targets ?? [localTarget, sshTarget],
    activeTarget: overrides?.activeTarget ?? localTarget,
    switchingTargetId: overrides?.switchingTargetId ?? null,
    switchTarget: overrides?.switchTarget ?? vi.fn().mockResolvedValue(localTarget),
    error: overrides?.error ?? null,
    clearError: overrides?.clearError ?? vi.fn(),
  };
  mockUseTargetStore.mockImplementation((selector?: unknown) => {
    if (typeof selector === "function") return (selector as (s: typeof state) => unknown)(state);
    return state;
  });
  return state;
}

function LocationProbe({ onChange }: { onChange: (path: string) => void }) {
  const location = useLocation();
  onChange(location.pathname);
  return null;
}

function renderSwitcher(onLocation?: (path: string) => void) {
  return render(
    <MemoryRouter initialEntries={["/central"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <TargetQuickSwitcher />
              {onLocation && <LocationProbe onChange={onLocation} />}
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("TargetQuickSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders trigger with the active target label", async () => {
    setupStore();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: /切换当前目标/ });
    expect(trigger).toHaveTextContent("本机");
  });

  it("renders SSH label when an SSH target is active", async () => {
    setupStore({
      activeTarget: { ...sshTarget, isActive: true },
      targets: [localTarget, { ...sshTarget, isActive: true }],
    });
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: /切换当前目标/ });
    expect(trigger).toHaveTextContent("dckj");
  });

  it("renders WSL label when a WSL target is active", async () => {
    setupStore({
      activeTarget: { ...wslTarget, isActive: true },
      targets: [localTarget, sshTarget, { ...wslTarget, isActive: true }],
    });
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: /切换当前目标/ });
    expect(trigger).toHaveTextContent("Ubuntu");
  });

  it("opens the menu and lists every target", async () => {
    setupStore();
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /切换当前目标/ }));
    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveTextContent("本机");
    expect(menu).toHaveTextContent("dckj");
    expect(menu).toHaveTextContent("管理目标…");
  });

  it("lists WSL distribution details and switches to WSL", async () => {
    const switchTarget = vi.fn().mockResolvedValue(wslTarget);
    setupStore({
      targets: [localTarget, sshTarget, wslTarget],
      switchTarget,
    });
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /切换当前目标/ }));

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Ubuntu-24.04");
    const wslRow = within(menu).getAllByRole("menuitem").find((btn) =>
      btn.textContent?.includes("Ubuntu")
    );

    await act(async () => {
      wslRow?.click();
    });

    expect(switchTarget).toHaveBeenCalledWith("wsl-ubuntu");
  });

  it("calls switchTarget when picking a non-active row", async () => {
    const switchTarget = vi.fn().mockResolvedValue(sshTarget);
    setupStore({ switchTarget });
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /切换当前目标/ }));

    const menu = await screen.findByRole("menu");
    const sshRow = within(menu).getAllByRole("menuitem").find((btn) =>
      btn.textContent?.includes("dckj")
    );
    expect(sshRow).toBeTruthy();

    await act(async () => {
      sshRow?.click();
    });

    expect(switchTarget).toHaveBeenCalledWith("ssh-dckj");
  });

  it("does not call switchTarget when picking the already-active row", async () => {
    const switchTarget = vi.fn();
    setupStore({ switchTarget });
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /切换当前目标/ }));
    const menu = await screen.findByRole("menu");
    const localRow = within(menu).getAllByRole("menuitem").find((btn) =>
      btn.textContent?.includes("本机")
    );
    fireEvent.click(localRow!);
    expect(switchTarget).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("navigates to /settings when Manage is clicked", async () => {
    setupStore();
    let path = "";
    renderSwitcher((next) => {
      path = next;
    });

    fireEvent.click(screen.getByRole("button", { name: /切换当前目标/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /管理目标…/ }));
    expect(path).toBe("/settings");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("shows a loader on the switching row while a switch is in flight", async () => {
    setupStore({ switchingTargetId: "ssh-dckj" });
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /切换当前目标/ }));
    const menu = await screen.findByRole("menu");
    expect(menu.querySelector(".animate-spin")).toBeTruthy();
  });

  it("closes the menu on outside click", async () => {
    setupStore();
    render(
      <MemoryRouter initialEntries={["/central"]}>
        <div data-testid="outside">outside</div>
        <Routes>
          <Route path="*" element={<TargetQuickSwitcher />} />
        </Routes>
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /切换当前目标/ }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByTestId("outside"));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("closes the menu on Escape", async () => {
    setupStore();
    renderSwitcher();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /切换当前目标/ });
    await user.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("shows the empty hint when only Local exists", async () => {
    setupStore({ targets: [localTarget] });
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /切换当前目标/ }));
    expect(await screen.findByRole("menu")).toHaveTextContent("尚未配置远程目标");
  });

  it("keeps the menu open with the error when a switch fails", async () => {
    const switchTarget = vi.fn().mockRejectedValue(new Error("boom"));
    setupStore({ switchTarget, error: "无法连接" });
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /切换当前目标/ }));
    const menu = await screen.findByRole("menu");
    const sshRow = within(menu).getAllByRole("menuitem").find((row) =>
      row.textContent?.includes("dckj")
    );
    await act(async () => {
      sshRow?.click();
    });
    expect(switchTarget).toHaveBeenCalledWith("ssh-dckj");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(within(screen.getByRole("menu")).getByRole("alert")).toHaveTextContent("无法连接");
  });

  it("supports arrow-key navigation inside the menu", async () => {
    const user = userEvent.setup();
    setupStore();
    renderSwitcher();
    screen.getByRole("button", { name: /切换当前目标/ }).focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(items[1]).toHaveFocus());
  });
});
