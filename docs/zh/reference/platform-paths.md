# 平台路径

SkillPort 管理的所有平台及其磁盘上的技能目录。Lobster 平台是中文厂商出品的编码 agent，UI 中单独分组。

## 编码（Coding）

| 平台 | 技能目录 |
| --- | --- |
| Claude Code | `~/.claude/skills/` |
| Codex CLI | `~/.agents/skills/` |
| Cursor | `~/.agents/skills/` |
| Antigravity | `~/.agents/skills/` |
| Gemini CLI（legacy） | `~/.gemini/skills/` |
| Trae | `~/.trae/skills/` |
| Factory Droid | `~/.factory/skills/` |
| Junie | `~/.junie/skills/` |
| Qwen | `~/.qwen/skills/` |
| Trae CN | `~/.trae-cn/skills/` |
| Windsurf | `~/.windsurf/skills/` |
| Qoder | `~/.qoder/skills/` |
| Augment | `~/.augment/skills/` |
| OpenCode | `~/.agents/skills/` |
| KiloCode | `~/.kilocode/skills/` |
| OB1 | `~/.ob1/skills/` |
| Amp | `~/.agents/skills/` |
| Kiro | `~/.kiro/skills/` |
| CodeBuddy | `~/.codebuddy/skills/` |
| Hermes | `~/.hermes/skills/` |
| Copilot | `~/.agents/skills/` |
| Aider | `~/.aider/skills/` |

## 龙虾（Lobster）

| 平台 | 技能目录 |
| --- | --- |
| OpenClaw（开爪） | `~/.openclaw/skills/` |
| QClaw（千爪） | `~/.qclaw/skills/` |
| EasyClaw（简爪） | `~/.easyclaw/skills/` |
| EasyClaw V2 | `~/.easyclaw-20260322-01/skills/` |
| AutoClaw | `~/.openclaw-autoclaw/skills/` |
| WorkBuddy（打工搭子） | `~/.workbuddy/skills-marketplace/skills/` |

## 中央

| 路径 | 作用 |
| --- | --- |
| `~/.skillsmanage/skills/` | 中央仓库（保留兼容性命名） |
| `~/.skillsmanage/db.sqlite` | SQLite 数据库（WAL 模式） |
| `~/.skillsmanage/targets/<id>/db.sqlite` | SSH 目标的本地缓存 |
| `~/.agents/skills/` | Universal Agents 全局共享目录（Antigravity Desktop 2.36.0+ / CLI `agy`、Codex CLI、Cursor、OpenCode、Amp、Copilot 等 universal agents 读取） |
| `~/.gemini/skills/` | Gemini CLI 承载的 legacy/shared Google 目标 |

## 共享根

多个全局 agent（包括 Antigravity Desktop 2.36.0+ / CLI `agy`、Codex CLI、Cursor、OpenCode、Amp、Copilot 等 universal agents）都解析到 `~/.agents/skills/`，并在项目 / workspace 范围共享 `.agents/skills/`。Gemini CLI 仍承载 legacy/shared Google 路径 `~/.gemini/skills/`。项目扫描会折叠这些 workspace 兼容成员，避免同一项目技能在 UI 重复出现。

> **Antigravity `~/.gemini/config/skills/` 遮蔽与 IDE 说明**：Antigravity Desktop 与 CLI 仍让 `~/.gemini/config/skills/` 中的同名技能优先于 `~/.agents/skills/`。SkillPort 升级仅清理旧数据库元数据，不会自动删除、移动或修改磁盘上 `~/.gemini/config/skills/` 里的任何文件——请手动检查旧目录中的同名技能，确认已在中央技能库（`~/.skillsmanage/skills/`）或 `~/.agents/skills/` 备份后再移除多余旧副本。由于 Antigravity IDE 官方文档尚未宣布支持 `~/.agents/skills/`，如需用 SkillPort 管理 `~/.gemini/config/skills/`，可在下方自定义平台中手动添加。

## 只读来源

Claude Code 把 `~/.claude/plugins/marketplaces/*` 下的市场插件目录作为只读行展示。仅展示用，不像 `~/.claude/skills/` 那样接受管理操作。Antigravity plugin bundle 属于独立 CLI 插件机制，SkillPort 不导入或导出。

## 自定义平台

设置 → 平台 支持添加自定义平台。SkillPort 按宿主 home 路径风格自动生成目录：

- Windows：`C:\Users\<name>\.<id>\skills\`
- macOS / Linux：`~/.<id>/skills/`

目录在首次安装时按需创建。

Last reviewed: 2026-11-27
