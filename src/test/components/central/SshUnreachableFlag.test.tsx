import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  CentralSshReachabilityPanel,
  SshUnreachableFlag,
} from "@/components/central/SshReachabilityStatus";

const SETTINGS_PATH = "/settings/connections?section=remote-targets";
const SECRET = "session-only-secret";

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderAt(node: ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/central"]}>
      {node}
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("SshUnreachableFlag", () => {
  it("uses the glass button with the destructive tint and opens ssh settings", async () => {
    const user = userEvent.setup();
    renderAt(<SshUnreachableFlag message="connection refused" />);

    const flag = screen.getByTestId("ssh-unreachable-flag");
    expect(flag).toHaveAttribute("data-slot", "button");
    expect(flag).toHaveAccessibleName("无法连接");
    expect(flag.className).toContain("bg-popover");
    expect(flag.className).toContain("tint-destructive");
    expect(flag.className).toContain("text-destructive-text");
    expect(flag.className).not.toMatch(/\btext-foreground\b/);
    expect(flag.className).toContain("h-8");
    expect(flag.className).toContain("rounded-full");
    expect(flag.className).not.toMatch(/backdrop-/);
    expect(flag).toHaveAttribute("title", "connection refused");
    expect(flag.closest("[data-slot=badge]")).toBeNull();

    await user.click(flag);
    expect(screen.getByTestId("location")).toHaveTextContent(SETTINGS_PATH);
    expect(screen.getByTestId("location").textContent).not.toContain(SECRET);
  });

  it.each([
    ["the label", "无法连接"],
    ["blank text", "   "],
    ["a line break", `connection refused\n${SECRET}`],
    ["more than 160 characters", `${"x".repeat(161)}${SECRET}`],
  ])("omits the tooltip when the probe text is %s", (_label, message) => {
    renderAt(<SshUnreachableFlag message={message} />);
    const flag = screen.getByTestId("ssh-unreachable-flag");
    expect(flag).not.toHaveAttribute("title");
    expect(flag).toHaveTextContent("无法连接");
    expect(document.body.textContent).not.toContain(SECRET);
  });
});

describe("CentralSshReachabilityPanel", () => {
  it("shows a neutral loading state before the target list resolves", () => {
    renderAt(<CentralSshReachabilityPanel phase="pending" onRetry={() => {}} />);
    expect(screen.getByTestId("central-target-pending")).toHaveTextContent("正在加载技能...");
    expect(screen.queryByTestId("ssh-unreachable-flag")).not.toBeInTheDocument();
    expect(screen.queryByTestId("central-ssh-reachability-retry")).not.toBeInTheDocument();
  });

  it("shows checking copy without actions", () => {
    renderAt(<CentralSshReachabilityPanel phase="checking" onRetry={() => {}} />);
    expect(screen.getByTestId("central-ssh-reachability-checking")).toBeInTheDocument();
    expect(screen.getByText("正在检查连接")).toBeInTheDocument();
    expect(screen.queryByTestId("central-ssh-reachability-retry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ssh-unreachable-flag")).not.toBeInTheDocument();
  });

  it("retries and opens ssh settings from the unreachable empty state", async () => {
    const user = userEvent.setup();
    let retried = 0;
    renderAt(
      <CentralSshReachabilityPanel
        phase="unreachable"
        onRetry={() => {
          retried += 1;
        }}
      />,
    );

    const retry = screen.getByTestId("central-ssh-reachability-retry");
    const settings = screen.getByTestId("central-ssh-reachability-settings");
    expect(retry.className).toContain("bg-popover");
    expect(retry.className).not.toMatch(/backdrop-/);
    expect(settings.className).toContain("bg-popover");

    await user.click(retry);
    expect(retried).toBe(1);
    await user.click(settings);
    expect(screen.getByTestId("location")).toHaveTextContent(SETTINGS_PATH);
  });
});
