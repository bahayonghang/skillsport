import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import type { TargetSummary } from "@/types";
import type { SshReachability } from "@/lib/sshLibraryGate";
import * as S from "./centralSkillsViewTestSupport";

const LIBRARY_PATH = "/Users/test/.skillsmanage/skills/";
const SECRET = "session-only-secret";

const sshTarget: TargetSummary = {
  id: "ssh-demo",
  kind: "ssh",
  label: "Lab",
  host: "lab.local",
  username: "alice",
  port: 22,
  isActive: true,
};

const wslTarget: TargetSummary = {
  id: "wsl-ubuntu",
  kind: "wsl",
  label: "Ubuntu",
  distribution: "Ubuntu-24.04",
  isActive: true,
};

function useReachability(activeTarget: TargetSummary, sshReachability: SshReachability, error: string | null = null) {
  S.useTargetStore.setState({
    targets: [S.localTarget, activeTarget],
    activeTarget,
    error,
    sshReachability,
  });
}

function expectLibraryHidden() {
  expect(screen.queryByText("frontend-design")).not.toBeInTheDocument();
  expect(screen.queryByTestId("central-result-count")).not.toBeInTheDocument();
  expect(screen.queryByText(LIBRARY_PATH)).not.toBeInTheDocument();
}

function expectLibraryLive() {
  expect(screen.getByText("frontend-design")).toBeInTheDocument();
  expect(screen.getByTestId("central-result-count")).toBeInTheDocument();
  expect(screen.getByText(LIBRARY_PATH)).toBeInTheDocument();
  expect(screen.queryByTestId("ssh-unreachable-flag")).not.toBeInTheDocument();
}

describe("Central skills SSH reachability", () => {
  beforeEach(() => {
    S.resetCentralSkillsViewTestState();
  });

  afterEach(S.cleanupCentralSkillsViewTestState);

  it("hides the cached library and the flag before targets resolve", () => {
    useReachability(S.localTarget, { phase: "idle" });
    S.useTargetStore.setState({ targetsResolved: false });
    S.renderCentralSkillsView();

    expect(screen.getByTestId("central-target-pending")).toBeInTheDocument();
    expect(screen.getByText("正在加载技能...")).toBeInTheDocument();
    expect(screen.queryByTestId("ssh-unreachable-flag")).not.toBeInTheDocument();
    expect(screen.queryByTestId("central-ssh-reachability-checking")).not.toBeInTheDocument();
    expectLibraryHidden();
  });

  it("hides the saved library and the flag while the active ssh target is checking", () => {
    useReachability(sshTarget, { phase: "checking", targetId: sshTarget.id });
    S.renderCentralSkillsView();

    expect(screen.getByTestId("central-ssh-reachability-checking")).toBeInTheDocument();
    expect(screen.getByText("正在检查连接")).toBeInTheDocument();
    expect(screen.queryByTestId("ssh-unreachable-flag")).not.toBeInTheDocument();
    expect(screen.queryByTestId("central-ssh-reachability-retry")).not.toBeInTheDocument();
    expectLibraryHidden();
  });

  it("paints the library without a flag when the active ssh target is reachable", () => {
    useReachability(sshTarget, { phase: "reachable", targetId: sshTarget.id });
    S.renderCentralSkillsView();

    expectLibraryLive();
    expect(screen.queryByTestId("central-ssh-reachability-checking")).not.toBeInTheDocument();
    expect(screen.queryByTestId("central-ssh-reachability-unreachable")).not.toBeInTheDocument();
  });

  it("shows the flag and empty state only when the active ssh target is unreachable", () => {
    useReachability(sshTarget, {
      phase: "unreachable",
      targetId: sshTarget.id,
      message: "connection refused",
    });
    S.renderCentralSkillsView();

    const flag = screen.getByTestId("ssh-unreachable-flag");
    expect(flag).toHaveAccessibleName("无法连接");
    expect(flag).toHaveAttribute("title", "connection refused");
    expect(screen.getByTestId("central-ssh-reachability-unreachable")).toBeInTheDocument();
    expect(screen.getByTestId("central-ssh-reachability-retry")).toBeInTheDocument();
    expect(screen.getByTestId("central-ssh-reachability-settings")).toBeInTheDocument();
    expectLibraryHidden();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("keeps a still-reachable target's library when a switch error is stored", () => {
    useReachability(
      sshTarget,
      { phase: "reachable", targetId: sshTarget.id },
      "no route to host",
    );
    S.renderCentralSkillsView();

    expectLibraryLive();
    expect(screen.queryByTestId("ssh-unreachable-flag")).not.toBeInTheDocument();
  });

  it("keeps the library for local and wsl targets", () => {
    useReachability(S.localTarget, {
      phase: "unreachable",
      targetId: "ssh-other",
      message: "connection refused",
    });
    const localView = S.renderCentralSkillsView();
    expectLibraryLive();
    localView.unmount();

    useReachability(wslTarget, { phase: "idle" });
    S.renderCentralSkillsView();
    expectLibraryLive();
  });

  it("fails closed without a flag when the unreachable record is for another target", () => {
    useReachability(sshTarget, {
      phase: "unreachable",
      targetId: "ssh-other",
      message: `down ${SECRET}`,
    });
    S.renderCentralSkillsView();

    expect(screen.getByTestId("central-ssh-reachability-checking")).toBeInTheDocument();
    expect(screen.queryByTestId("ssh-unreachable-flag")).not.toBeInTheDocument();
    expectLibraryHidden();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("reloads skills after a successful retry and ignores a reload failure", async () => {
    useReachability(sshTarget, {
      phase: "unreachable",
      targetId: sshTarget.id,
      message: "connection refused",
    });
    const original = S.useTargetStore.getState().verifyActiveSshTarget;
    const verify = vi.fn(async () => true);
    S.useTargetStore.setState({ verifyActiveSshTarget: verify });
    try {
      S.renderCentralSkillsView();
      await waitFor(() => expect(S.mockLoadCentralSkills).toHaveBeenCalled());
      S.mockLoadCentralSkills.mockClear();
      S.mockRescan.mockClear();
      S.mockLoadCentralSkills.mockRejectedValueOnce(new Error(`reload ${SECRET}`));

      fireEvent.click(screen.getByTestId("central-ssh-reachability-retry"));

      await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(S.mockLoadCentralSkills).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(S.mockRescan).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(new RegExp(SECRET))).not.toBeInTheDocument();
      expect(screen.queryByText(/reload /)).not.toBeInTheDocument();
      expect(S.useTargetStore.getState().sshReachability.phase).toBe("unreachable");
    } finally {
      S.useTargetStore.setState({ verifyActiveSshTarget: original });
      S.mockLoadCentralSkills.mockReset();
      S.mockLoadCentralSkills.mockResolvedValue(undefined);
    }
  });

  it("does not reload skills when the retry probe is still down", async () => {
    useReachability(sshTarget, {
      phase: "unreachable",
      targetId: sshTarget.id,
      message: "connection refused",
    });
    const original = S.useTargetStore.getState().verifyActiveSshTarget;
    const verify = vi.fn(async () => false);
    S.useTargetStore.setState({ verifyActiveSshTarget: verify });
    try {
      S.renderCentralSkillsView();
      await waitFor(() => expect(S.mockLoadCentralSkills).toHaveBeenCalled());
      S.mockLoadCentralSkills.mockClear();
      S.mockRescan.mockClear();

      fireEvent.click(screen.getByTestId("central-ssh-reachability-retry"));

      await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(S.mockLoadCentralSkills).not.toHaveBeenCalled();
      expect(S.mockRescan).not.toHaveBeenCalled();
      expect(screen.getByTestId("ssh-unreachable-flag")).toBeInTheDocument();
    } finally {
      S.useTargetStore.setState({ verifyActiveSshTarget: original });
    }
  });
});
