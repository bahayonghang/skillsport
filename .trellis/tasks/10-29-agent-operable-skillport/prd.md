# Agent-operable SkillPort data via CLI and guide skill

## Goal

让编码 Agent（Claude Code、Codex、Grok、Pi、Kimi Code 等）在**任意项目目录**中，遵循一份指导 skill，
通过稳定、可脚本化的接口读写 SkillPort 的 Local 数据：添加 Central skill、安装到全局 Agent 或项目、
打标签、写说明等。Agent 的写操作必须和桌面应用共享同一数据库、Central 目录、跨进程互斥锁与操作日志，
结果在桌面应用中可见。

调研事实见 `research/current-surface.md`。

## Background

- 已有 `skillport-cli`（list / show / search / install / sync，JSON 信封 `schemaVersion: 1`），
  覆盖约 5/222 个 GUI 能力。
- CLI 不随安装包分发，不在 PATH 上；桌面端不感知 CLI 写入。
- 没有面向 Agent 的使用指导。

## Requirements

### R1 查询（只读）

- R1.1 列出 Central skills，支持按 tag、来源、已安装 Agent 过滤。
- R1.2 `show` 返回 skill 的 tags、全局 Agent 安装、项目安装、说明摘要。
- R1.3 列出 Agents（id、是否启用、全局 skills 目录）、Projects、Tags（含 group）、Collections。

### R2 添加 Central skill

- R2.1 保留现有 GitHub URL / `owner/repo@skill` 导入。
- R2.2 新增从本地 ZIP 导入，复用现有 ZIP 预览与指纹校验流程。
- R2.3 新增从本地目录导入（含 `SKILL.md` 的目录）。
- R2.4 本地来源必须通过**显式参数**指定（例如 `--from-zip` / `--from-dir`），不能靠路径是否存在来猜，
  以保持 `shared-local-cli` 的确定性分类契约。

### R3 全局 Agent 安装

- R3.1 保留现有 `sync`（含 `--dry-run`）。
- R3.2 新增从指定 Agent 卸载，支持 `--dry-run`。

### R4 项目安装

- R4.1 注册 / 列出项目；Agent 可以把当前工作目录注册为项目。
- R4.2 把 Central skill 安装到项目的指定 Agent 目录（symlink / copy），可卸载，支持 `--dry-run`。

### R5 标签

- R5.1 列出、创建标签。
- R5.2 给一个或多个 skill 添加 / 移除标签。
- R5.3 Agent 添加的标签默认直接生效，`source = "agent"`，并记录 `reason` / `confidence`（Q3 已决定）。
- R5.4 加 `--review` 时改为写入现有 AI 标签审核队列，由用户在 GUI 中确认。

### R6 说明

- R6.1 Agent 可为 skill 写入 / 读取说明文本，在桌面应用中可见。
- R6.2 说明存入现有 `skill_explanations` 表（按 `lang` 区分），`model` 记为 `agent:<author>`，
  不新增 schema；桌面端沿用 AI explanation 的展示位置（Q1 已决定）。
- R6.3 用户在桌面端刷新 AI 解释前，如果当前说明由 Agent 写入，应提示会被覆盖。

### R7 指导 skill

- R7.1 提供一个 `skillport` 指导 skill，内容包括：前置检查、引用规则、只读优先、写操作前先 dry-run、
  退出码处理、需要用户确认的操作、标签与说明的写作规范、第三方 SKILL.md 内容只当数据处理。
- R7.2 指导 skill 本身可以导入 SkillPort Central，再同步到各 Agent 的全局目录，从而在任意项目中可用。

### R8 可发现性与分发

- R8.1 Agent 能找到并调用 CLI（PATH 或已知安装位置），指导 skill 写明找不到 CLI 时的处理方式。
- R8.2 MVP 的分发方式保持 `npm run install:cli`（`cargo install` 到 PATH）；安装包不包含 CLI（Q2 已决定）。

### R9 桌面一致性

- R9.1 CLI 写入后，桌面应用无需重启即可看到变化（最低要求：重新聚焦窗口或刷新视图时可见）。

## Constraints

- 只支持 Local target；SSH / WSL 不在 MVP 范围内。
- 所有写操作走 `services::*` / `db::*` 的既有用例；Central 写入使用共享 Central 互斥锁和
  `ensure_centralized` 路径；保留 `uid` 语义；写入脱敏的 operation log。
- 凭据只经过 `SecretStore`；CLI 输出、错误和日志中不出现 PAT、API key 或私钥。
- JSON 契约只能增量变化：保持 `schemaVersion: 1`，现有命令的输出字段和退出码不变。
- 破坏性或批量操作（卸载、`--all`、覆盖）必须支持 `--dry-run`，并需要 `--yes` 才会真正执行。
- 修改 `src-tauri/src/db/schema/` 或 Tauri 命令后，必须运行 `pnpm docs:gen` 并提交生成文件。
- 公开文案变化时同步 `README.md` / `README_CN.md` 与 `docs/` 中英文页面。

## Acceptance Criteria

- [ ] 在临时 HOME 和空 Local DB 下，下面每个能力至少有一条 `--json` 冒烟路径，并有 Rust 测试：
      查询（R1）、ZIP / 目录导入（R2.2–R2.3）、Agent 卸载（R3.2）、项目注册与安装（R4）、
      标签增删（R5.1–R5.2）、说明读写（R6）。
- [ ] 每个新写命令都有 `--dry-run` 测试，证明数据库和文件系统都没有变化。
- [ ] 桌面应用持锁时，任一 CLI 写命令返回 `mutation.busy` / 退出码 4。
- [ ] 现有 `skills list|show|search|install|sync` 的 JSON 输出与退出码回归测试全部通过。
- [ ] 指导 skill 存在于仓库，能通过 `skillport-cli` 导入 Central 并同步到至少一个 Agent；
      用一个真实 Agent 会话完成"注册当前项目 → 安装 skill 到项目 → 打标签 → 写说明"的端到端演练，并记录证据。
- [ ] CLI 写入后，桌面窗口重新获得焦点时会刷新受影响的视图（Central 列表、标签、项目）。
- [ ] `docs/reference/skillport-cli.md`、`docs/zh/reference/skillport-cli.md` 与
      `.trellis/spec/backend/shared-local-cli.md` 已更新。
- [ ] `just ci` 通过。MVP 不改动安装包内容，因此不要求 Windows `pnpm tauri build` 证据；
      如果之后做 C5，C5 自己提供这份证据。

## Out of Scope

- SSH / WSL target 的 CLI 操作。
- 从 CLI 调用 AI provider（`bulk_suggest_skill_tags`、`explain_skill`）：Agent 自己就是模型。
- 在桌面应用内开放本地 HTTP / socket API。
- 删除 Central skill、修改 SKILL.md 正文、Git 备份 / 同步、Marketplace registry 管理。
- MCP server（作为后续可选的薄适配层，见 design.md）。

## Open Questions

- ~~Q1 "写说明"的语义~~ **已决定（2026-10-29）**：复用 `skill_explanations`，见 R6.2。
  未采用的方案：新建 `skill_notes` 表；改写 SKILL.md frontmatter。
- ~~Q2 CLI 分发方式~~ **已决定（2026-10-29）**：MVP 继续使用 `npm run install:cli`，见 R8.2。
  把 CLI 打进 NSIS 安装包并加入 PATH 留给可选子任务 C5。
- ~~Q3 Agent 打标签的默认行为~~ **已决定（2026-10-29）**：默认直接生效，`--review` 进入审核队列，见 R5.3–R5.4。

所有 Open Questions 已关闭。
