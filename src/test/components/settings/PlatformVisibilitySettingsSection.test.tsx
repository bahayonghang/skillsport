import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { TFunction } from "i18next";

import { PlatformVisibilitySettingsSection } from "@/components/settings/PlatformVisibilitySettingsSection";
import { getPlatformVisibilityGroups } from "@/pages/settingsViewModel";
import type { AgentWithStatus } from "@/types";

function makeAgent(
  id: string,
  displayName: string,
  globalSkillsDir: string,
  isEnabled: boolean,
): AgentWithStatus {
  return {
    id,
    display_name: displayName,
    category: "coding",
    global_skills_dir: globalSkillsDir,
    project_skills_dir: undefined,
    is_detected: true,
    is_builtin: true,
    is_enabled: isEnabled,
  };
}

const fullUniversalAndCodingAgents: AgentWithStatus[] = [
  makeAgent("claude-code", "Claude Code", "~/.claude/skills/", true),
  makeAgent("amp", "Amp", "~/.agents/skills/", false),
  makeAgent("antigravity", "Antigravity", "~/.agents/skills/", true),
  makeAgent("cline", "Cline", "~/.agents/skills/", false),
  makeAgent("codex", "Codex CLI", "~/.agents/skills/", true),
  makeAgent("cursor", "Cursor", "~/.agents/skills/", false),
  makeAgent("deep-agents", "Deep Agents", "~/.agents/skills/", false),
  makeAgent("firebender", "Firebender", "~/.agents/skills/", false),
  makeAgent("copilot", "GitHub Copilot", "~/.agents/skills/", false),
  makeAgent("kimi-code-cli", "Kimi Code CLI", "~/.agents/skills/", false),
  makeAgent("opencode", "OpenCode", "~/.agents/skills/", true),
  makeAgent("warp", "Warp", "~/.agents/skills/", false),
  makeAgent("gemini-cli", "Gemini CLI (legacy)", "~/.gemini/skills/", false),
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

describe("PlatformVisibilitySettingsSection", () => {
  it("lists Antigravity inside the 11-member global Universal card and not as a standalone coding platform", () => {
    const t = ((key: string) => key) as TFunction;
    const groups = getPlatformVisibilityGroups({
      agents: fullUniversalAndCodingAgents,
      categoryVisibility: { coding: true, lobster: false },
      normalizedQuery: "",
      t,
    });

    const codingGroup = groups.find((group) => group.category === "coding");
    expect(codingGroup).toBeDefined();
    expect(codingGroup!.agents.map((target) => target.id)).toEqual([
      "universal-agents",
      "claude-code",
      "gemini-cli",
    ]);

    render(
      <PlatformVisibilitySettingsSection
        groups={groups}
        isSearchActive={false}
        normalizedQuery=""
        query=""
        onQueryChange={vi.fn()}
        onToggleCategory={vi.fn()}
        onTogglePlatform={vi.fn()}
      />,
    );

    expect(screen.getByText("3 / 11 个工具")).toBeInTheDocument();
    const universalSwitch = screen.getByLabelText("切换平台 Universal 的显示");
    const universalCard = universalSwitch.closest(".rounded-control");
    expect(universalCard).not.toBeNull();
    expect(
      within(universalCard as HTMLElement).getByText("Antigravity", {
        selector: "div",
      }),
    ).toBeInTheDocument();
    expect(
      within(universalCard as HTMLElement).getByLabelText("切换平台 Antigravity 的显示"),
    ).toBeChecked();
    expect(
      screen.getAllByLabelText("切换平台 Antigravity 的显示"),
    ).toHaveLength(1);
    expect(screen.getByText("Gemini CLI (legacy)", { selector: "div" })).toBeInTheDocument();
  });
});
