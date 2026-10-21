import { fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TopBar } from "@/components/layout/TopBar";
import { usePlatformStore } from "@/stores/platformStore";
import { useThemeStore } from "@/stores/themeStore";
import { setNavigatorPlatform } from "@/test/support/testPlatform";

vi.mock("@/components/layout/TargetQuickSwitcher", () => ({
  TargetQuickSwitcher: () => <div data-testid="target-switcher" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: {
    children: ReactNode;
    size?: string;
    variant?: string;
  } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/stores/platformStore", () => ({
  usePlatformStore: vi.fn(),
}));

vi.mock("@/stores/themeStore", () => ({
  useThemeStore: vi.fn(),
}));

const mockUsePlatformStore = vi.mocked(usePlatformStore);
const mockUseThemeStore = vi.mocked(useThemeStore);

let restorePlatform: (() => void) | undefined;

function mockTheme(flavor: "glass-light" | "glass-dark") {
  const toggleFlavor = vi.fn();
  mockUseThemeStore.mockImplementation((selector?: unknown) => {
    const state = { flavor, setFlavor: vi.fn(), toggleFlavor };
    if (typeof selector === "function") return selector(state);
    return state;
  });
  return toggleFlavor;
}

function setPlatform(platform: string) {
  restorePlatform?.();
  restorePlatform = setNavigatorPlatform(platform);
}

function renderTopBar() {
  render(
    <MemoryRouter initialEntries={["/central"]}>
      <TopBar onSearchClick={vi.fn()} onShortcutsClick={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("TopBar shortcut hint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePlatformStore.mockImplementation((selector?: unknown) => {
      const state = {
        agents: [],
        skillsByAgent: { central: 3 },
        categoryVisibility: undefined,
      };
      if (typeof selector === "function") return selector(state);
      return state;
    });
    mockTheme("glass-dark");
  });

  afterEach(() => {
    restorePlatform?.();
    restorePlatform = undefined;
  });

  it("renders Ctrl+K on non-macOS", () => {
    setPlatform("Win32");

    renderTopBar();

    expect(screen.getByLabelText("Ctrl+K")).toHaveTextContent("CtrlK");
    expect(screen.queryByLabelText("Command+K")).not.toBeInTheDocument();
  });

  it("renders Command+K on macOS", () => {
    setPlatform("MacIntel");

    renderTopBar();

    expect(screen.getByLabelText("Command+K")).toHaveTextContent("⌘K");
  });

  it("toggles glass dark to light through the store", () => {
    const toggleFlavor = mockTheme("glass-dark");
    renderTopBar();

    const button = screen.getByRole("button", { name: "切换到浅色主题" });
    fireEvent.click(button);
    expect(toggleFlavor).toHaveBeenCalledTimes(1);
  });

  it("offers the dark theme while glass light is active", () => {
    mockTheme("glass-light");
    renderTopBar();

    expect(
      screen.getByRole("button", { name: "切换到深色主题" }),
    ).toBeInTheDocument();
  });
});
