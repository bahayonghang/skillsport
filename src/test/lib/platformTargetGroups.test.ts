import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import type { AgentWithStatus } from "@/types";
import {
  getProjectPlatformTargetGroups,
  getPlatformTargetCountAgentId,
  getPlatformTargetGroups,
  getPlatformTargetInstallAgentIds,
  getPlatformTargetLabel,
  getPlatformTargetMemberIds,
  getPlatformTargetTitleHint,
  hasProjectSkillPattern,
  isUniversalPlatformTarget,
} from "@/lib/platformTargetGroups";
import { groupPlatformAgentIds } from "@/lib/platformCleanupGroups";

const baseAgent = {
  category: "coding",
  is_detected: true,
  is_builtin: true,
  is_enabled: true,
} satisfies Pick<
  AgentWithStatus,
  "category" | "is_detected" | "is_builtin" | "is_enabled"
>;

function agent(
  id: string,
  displayName: string,
  path: string,
  enabled = true,
): AgentWithStatus {
  return {
    ...baseAgent,
    id,
    display_name: displayName,
    global_skills_dir: path,
    project_skills_dir: undefined,
    is_enabled: enabled,
  };
}

describe("platformTargetGroups", () => {
  it("folds known Universal agents into one Universal target", () => {
    const agents = [
      agent("codex", "Codex CLI", "C:\\Users\\lyh\\.agents\\skills\\"),
      agent("cursor", "Cursor", "c:/users/lyh/.agents/skills"),
      agent("claude-code", "Claude Code", "C:\\Users\\lyh\\.claude\\skills"),
      agent(
        "central",
        "Central Skills",
        "C:\\Users\\lyh\\.skillsmanage\\skills",
      ),
    ];

    const groups = getPlatformTargetGroups(agents, {
      coding: true,
      lobster: true,
    });

    expect(groups.map((group) => group.id)).toEqual([
      "universal-agents",
      "claude-code",
    ]);
    expect(isUniversalPlatformTarget(groups[0])).toBe(true);
    expect(getPlatformTargetMemberIds(groups[0])).toEqual(["codex", "cursor"]);
    expect(getPlatformTargetInstallAgentIds(groups[0])).toEqual(["codex"]);
  });

  it("keeps independent platforms unchanged", () => {
    const agents = [
      agent("codex", "Codex CLI", "~/.agents/skills"),
      {
        ...agent("grok", "Grok", "~/.grok/skills"),
        project_skills_dir: ".grok/skills",
      },
      agent("claude-code", "Claude Code", "~/.claude/skills"),
      agent("kiro", "Kiro", "~/.kiro/skills"),
      agent("central", "Central Skills", "~/.skillsmanage/skills"),
    ];

    const groups = getPlatformTargetGroups(agents, {
      coding: true,
      lobster: true,
    });

    expect(groups.map((group) => group.id)).toEqual([
      "universal-agents",
      "grok",
      "claude-code",
      "kiro",
    ]);
    expect(isUniversalPlatformTarget(groups[1])).toBe(false);
    expect(hasProjectSkillPattern(groups[1])).toBe(true);
  });

  it("folds Antigravity into the global Universal target while keeping Gemini CLI standalone", () => {
    const agents = [
      agent("codex", "Codex CLI", "~/.agents/skills"),
      agent("antigravity", "Antigravity", "~/.agents/skills"),
      agent("gemini-cli", "Gemini CLI (legacy)", "~/.gemini/skills", true),
      agent("central", "Central Skills", "~/.skillsmanage/skills"),
    ];

    const groups = getPlatformTargetGroups(agents, {
      coding: true,
      lobster: true,
    });

    expect(groups.map((group) => group.id)).toEqual([
      "universal-agents",
      "gemini-cli",
    ]);
    expect(isUniversalPlatformTarget(groups[0])).toBe(true);
    expect(getPlatformTargetMemberIds(groups[0])).toEqual([
      "antigravity",
      "codex",
    ]);
    expect(getPlatformTargetInstallAgentIds(groups[0])).toEqual(["codex"]);
    expect(isUniversalPlatformTarget(groups[1])).toBe(false);
  });

  it("preserves Antigravity install-representative preference order after Codex CLI and OpenCode", () => {
    const withCodex = getPlatformTargetGroups(
      [
        agent("codex", "Codex CLI", "~/.agents/skills"),
        agent("opencode", "OpenCode", "~/.agents/skills"),
        agent("antigravity", "Antigravity", "~/.agents/skills"),
        agent("cursor", "Cursor", "~/.agents/skills"),
      ],
      { coding: true, lobster: true },
    );
    expect(getPlatformTargetInstallAgentIds(withCodex[0])).toEqual(["codex"]);

    const withOpenCode = getPlatformTargetGroups(
      [
        agent("opencode", "OpenCode", "~/.agents/skills"),
        agent("antigravity", "Antigravity", "~/.agents/skills"),
        agent("cursor", "Cursor", "~/.agents/skills"),
      ],
      { coding: true, lobster: true },
    );
    expect(getPlatformTargetInstallAgentIds(withOpenCode[0])).toEqual([
      "opencode",
    ]);

    const withoutCodexAndOpenCode = getPlatformTargetGroups(
      [
        agent("antigravity", "Antigravity", "~/.agents/skills"),
        agent("cursor", "Cursor", "~/.agents/skills"),
        agent("amp", "Amp", "~/.agents/skills"),
      ],
      { coding: true, lobster: true },
    );
    expect(withoutCodexAndOpenCode).toHaveLength(1);
    expect(withoutCodexAndOpenCode[0].id).toBe("universal-agents");
    expect(
      getPlatformTargetInstallAgentIds(withoutCodexAndOpenCode[0]),
    ).toEqual(["antigravity"]);
  });

  it("groups Antigravity into Universal for leftover cleanup grouping", () => {
    const agents = [
      agent("codex", "Codex CLI", "~/.agents/skills"),
      agent("antigravity", "Antigravity", "~/.agents/skills"),
      agent("gemini-cli", "Gemini CLI (legacy)", "~/.gemini/skills"),
    ];

    const cleanupGroups = groupPlatformAgentIds(agents, [
      "antigravity",
      "codex",
      "gemini-cli",
    ]);

    expect(cleanupGroups).toEqual([
      {
        id: "universal-agents",
        label: "Universal",
        agentIds: ["antigravity", "codex"],
        detail: "Antigravity, Codex CLI",
      },
      {
        id: "gemini-cli",
        label: "Gemini CLI (legacy)",
        agentIds: ["gemini-cli"],
        detail: "~/.gemini/skills",
      },
    ]);
  });

  it("folds Antigravity into the project Universal target", () => {
    const agents = [
      agent("codex", "Codex CLI", "~/.agents/skills"),
      {
        ...agent("grok", "Grok", "~/.grok/skills"),
        project_skills_dir: ".grok/skills",
      },
      agent("antigravity", "Antigravity", "~/.agents/skills"),
      agent("claude-code", "Claude Code", "~/.claude/skills"),
      agent("central", "Central Skills", "~/.skillsmanage/skills"),
    ];

    const groups = getProjectPlatformTargetGroups(agents, {
      coding: true,
      lobster: true,
    });

    expect(groups.map((group) => group.id)).toEqual([
      "universal-agents",
      "grok",
      "claude-code",
    ]);
    expect(getPlatformTargetMemberIds(groups[0])).toEqual([
      "antigravity",
      "codex",
    ]);
    expect(getPlatformTargetInstallAgentIds(groups[0])).toEqual(["codex"]);
    expect(isUniversalPlatformTarget(groups[1])).toBe(false);
    expect(hasProjectSkillPattern(groups[1])).toBe(true);
  });

  it("hides the Universal target when every member is hidden", () => {
    const agents = [
      agent("codex", "Codex CLI", "~/.agents/skills", false),
      agent("cursor", "Cursor", "~/.agents/skills", false),
      agent("claude-code", "Claude Code", "~/.claude/skills"),
      agent("central", "Central Skills", "~/.skillsmanage/skills"),
    ];

    const groups = getPlatformTargetGroups(agents, {
      coding: true,
      lobster: true,
    });

    expect(groups.map((group) => group.id)).toEqual(["claude-code"]);
  });

  it("requires an explicit project pattern before reporting project install support", () => {
    const builtinWithoutProjectPattern: AgentWithStatus = {
      ...agent("claude-code", "Claude Code", "~/.claude/skills"),
      project_skills_dir: undefined,
    };

    expect(hasProjectSkillPattern(builtinWithoutProjectPattern)).toBe(true);

    const absoluteCustomAgent: AgentWithStatus = {
      ...agent("custom-app", "Custom App", "D:\\Tools\\CustomApp\\skills"),
      is_builtin: false,
      project_skills_dir: undefined,
    };

    expect(hasProjectSkillPattern(absoluteCustomAgent)).toBe(false);
  });

  describe("display helpers", () => {
    const t = ((key: string) => key) as TFunction;

    function buildTargets() {
      const agents = [
        agent("codex", "Codex CLI", "~/.agents/skills"),
        agent("cursor", "Cursor", "~/.agents/skills"),
        agent("claude-code", "Claude Code", "~/.claude/skills"),
        agent("central", "Central Skills", "~/.skillsmanage/skills"),
      ];

      const groups = getPlatformTargetGroups(agents, {
        coding: true,
        lobster: true,
      });

      return { universal: groups[0], plain: groups[1] };
    }

    it("labels the universal group with i18n keys and plain agents with display_name", () => {
      const { universal, plain } = buildTargets();

      expect(getPlatformTargetLabel(universal, t, "full")).toBe(
        "platformTargets.universalLabel",
      );
      expect(getPlatformTargetLabel(universal, t, "short")).toBe(
        "platformTargets.universalShortLabel",
      );
      expect(getPlatformTargetLabel(plain, t, "full")).toBe("Claude Code");
      expect(getPlatformTargetLabel(plain, t, "short")).toBe("Claude Code");
    });

    it("hints the universal group with member names and plain agents with skills dir", () => {
      const { universal, plain } = buildTargets();

      expect(getPlatformTargetTitleHint(universal)).toBe("Codex CLI, Cursor");
      expect(getPlatformTargetTitleHint(plain)).toBe("~/.claude/skills");
    });

    it("counts the universal group by its install agent and plain agents by id", () => {
      const { universal, plain } = buildTargets();

      expect(getPlatformTargetCountAgentId(universal)).toBe("codex");
      expect(getPlatformTargetCountAgentId(plain)).toBe("claude-code");
    });
  });
});
