# 平台

平台是指任何会读取 `skills/` 目录的 AI 编码 agent 或运行时。SkillPort 预置 34 个平台定义，并允许在设置中添加自定义平台。

## 分类

| 分类 | 含义 |
|------|------|
| Coding | AI 编码 agent 与 CLI（Claude Code、Cursor、Codex 等）。 |
| Lobster | 基于 OpenClaw 的生态（QClaw、EasyClaw、AutoClaw、WorkBuddy）。 |
| Central | 中央技能库；作为虚拟平台。 |

## 内置平台

| 类别 | 平台 | Skills 目录 |
|------|------|------------|
| Coding | Claude Code | `~/.claude/skills/` |
| Coding | Codex CLI | `~/.agents/skills/` |
| Coding | Cursor | `~/.agents/skills/` |
| Coding | Antigravity | `~/.agents/skills/` |
| Coding | Gemini CLI（legacy） | `~/.gemini/skills/` |
| Coding | Trae | `~/.trae/skills/` |
| Coding | Factory Droid | `~/.factory/skills/` |
| Coding | Junie | `~/.junie/skills/` |
| Coding | Qwen | `~/.qwen/skills/` |
| Coding | Trae CN | `~/.trae-cn/skills/` |
| Coding | Windsurf | `~/.windsurf/skills/` |
| Coding | Qoder | `~/.qoder/skills/` |
| Coding | Augment | `~/.augment/skills/` |
| Coding | OpenCode | `~/.agents/skills/` |
| Coding | KiloCode | `~/.kilocode/skills/` |
| Coding | OB1 | `~/.ob1/skills/` |
| Coding | Amp | `~/.agents/skills/` |
| Coding | Kiro | `~/.kiro/skills/` |
| Coding | CodeBuddy | `~/.codebuddy/skills/` |
| Coding | Hermes | `~/.hermes/skills/` |
| Coding | Copilot | `~/.agents/skills/` |
| Coding | Aider | `~/.aider/skills/` |
| Lobster | OpenClaw（开爪） | `~/.openclaw/skills/` |
| Lobster | QClaw（千爪） | `~/.qclaw/skills/` |
| Lobster | EasyClaw（简爪） | `~/.easyclaw/skills/` |
| Lobster | EasyClaw V2 | `~/.easyclaw-20260322-01/skills/` |
| Lobster | AutoClaw | `~/.openclaw-autoclaw/skills/` |
| Lobster | WorkBuddy（打工搭子） | `~/.workbuddy/skills-marketplace/skills/` |
| Central | 中央技能库 | `~/.skillsmanage/skills/` |

Antigravity（Desktop 2.36.0+ 与 CLI `agy`）、Codex CLI、Cursor、OpenCode、Amp、Copilot 等 universal agents 共同读取全局 Universal Agents 路径（`~/.agents/skills/`），项目 / workspace 安装同样共享 `.agents/skills/` 目录；Gemini CLI 仍作为独立的 legacy/shared Google 目标使用 `~/.gemini/skills/`。SkillPort 当前不管理 Antigravity plugin bundle。

### Antigravity 升级与 `~/.gemini/config/skills/` 遮蔽警告

> **警告 — `~/.gemini/config/skills/` 同名遮蔽优先级**：尽管 Antigravity Desktop（2.36.0+）与 CLI（`agy`）已读取全局 `~/.agents/skills/`，但只要 `~/.gemini/config/skills/` 中仍留有同名技能，Antigravity 仍会优先加载 `~/.gemini/config/skills/` 里的旧副本，从而遮蔽 `~/.agents/skills/` 中的技能。

- **不会自动删盘**：SkillPort 升级只会清理数据库中残留的 `~/.gemini/config/skills/` 元数据，**不会**自动删除、移动或修改用户磁盘上 `~/.gemini/config/skills/` 里的任何文件。
- **手动排查与清理步骤**：
  1. 检查 `~/.gemini/config/skills/` 中是否存在与 `~/.agents/skills/` 同名的技能目录。
  2. 确认需要保留的技能已经在中央技能库（`~/.skillsmanage/skills/`）中有备份，或已安装到 `~/.agents/skills/`。
  3. 确认无误后，手动删除或移走 `~/.gemini/config/skills/` 中的多余同名目录，避免遮蔽 `~/.agents/skills/`。
- **Antigravity IDE 回退方案**：Antigravity IDE 官方文档尚未宣布支持 `~/.agents/skills/`。如果你仍使用 Antigravity IDE 并需要用 SkillPort 管理 `~/.gemini/config/skills/`，请前往 **Settings → 自定义平台（Custom Platforms）** 添加自定义平台（例如 id 填 `antigravity-ide`、目录填 `~/.gemini/config/skills/`、分类选 `Coding`）。

## 平台视图

每个平台展示当前目录里可见的 skills。视图支持：

- **搜索**，使用延迟查询。
- **内联安装/卸载**，点击卡片上的平台图标行直接切换。
- **来源标识**，区分 symlink 安装与独立副本。
- **Marketplace plugin 行**（仅 Claude Code）：以只读方式展示 `~/.claude/plugins/marketplaces/*`，仅作透明展示，不按原生 skill 管理。

## 自定义平台

进入 Settings → 自定义平台 添加：

- 唯一 id 与显示名称。
- skills 目录路径（绝对路径或 `~/` 相对路径）。
- 分类（Coding、Lobster 或 Other）。

自定义平台与内置平台一样参与安装、卸载和 Discover 扫描。

## 平台可见性

不需要的平台可在 Settings → 平台可见性 中隐藏。隐藏的平台仍在后台扫描，但不会出现在导航中。

## 下一步

- 组装一组可复用 skills：[集合](./collections)。
- 连接远程机器：[SSH 远程](./ssh-remote)。
- 调整扫描路径与可见性：[设置](./settings)。

---

Last reviewed: 2026-11-27
