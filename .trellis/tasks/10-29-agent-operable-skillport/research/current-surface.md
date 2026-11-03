# 现状调研：Agent 可操作 SkillPort 数据的既有基础

调研时间：2026-10-29，分支 `dev`（`bf9031f9`）。

## 1. 已存在的 `skillport-cli`

- 二进制：`src-tauri/src/bin/skillport-cli.rs`（Clap、渲染、退出码），库：`src-tauri/src/cli_api/mod.rs`（`CliContext`）。
- 契约规范：`.trellis/spec/backend/shared-local-cli.md`；用户文档：`docs/reference/skillport-cli.md`（含 `docs/zh/` 镜像）。
- 来源任务：`.trellis/tasks/archive/2026-07/07-15-shared-core-cli/`。
- 现有命令（仅 Local target）：

| 命令 | 后端调用 |
| --- | --- |
| `skills list` | `central_skills::get_central_skills_impl` |
| `skills show <ref>` | `central_skills::resolve_skill_ref_impl` + `db::get_skill_installations` |
| `skills search <q>` | skills.sh 远端检索 |
| `skills install <owner/repo@skill \| github url> [--replace --yes --sync --agent --method]` | `marketplace` / `github_import` + `installation` 批量安装 |
| `skills sync <refs..> \| --all [--agent --method --dry-run]` | `installation::CentralBatchInstallResult` |

- JSON 信封：`{"schemaVersion":1,"ok":...}`，成功写 stdout、错误写 stderr；退出码 0/1/2/3/4/5。
- 引用解析顺序：uid → slug/id → 唯一的大小写敏感 name。
- 变更共享 Central 跨进程互斥锁（`services/central_mutation`，`fs2::try_lock_exclusive`），写入已脱敏的 operation log。
- `CliContext::open_default()` 直接打开 `paths::app_data_dir()/db.sqlite`，无需桌面应用在运行。
- 分发：`npm run install:cli`（`cargo install`）；**NSIS 安装包不包含 CLI，也不改 PATH**。
- 明确限制：不做本地路径导入（"filesystem existence is not a classifier"）；不推送桌面实时刷新。

## 2. GUI 能力 vs CLI 缺口

IPC 共 222 条命令（`docs/architecture/_generated/ipc-commands.md`）。与本需求相关、CLI 尚未覆盖的：

| 需求 | GUI 命令 | 可复用的后端入口 | 备注 |
| --- | --- | --- | --- |
| 本地 ZIP 导入 Central | `preview_local_skill_archive` / `import_local_skill_archive` | `services/local_archive_import::import_local_skill_archive_impl`（`pub(crate)`） | 需要预览 → 指纹校验两步 |
| 本地目录导入 Central | 无直接命令（scan/adopt 路径） | 需确认 scanner/centralize 入口 | 可能需要新 service 用例 |
| 卸载 Agent 安装 | `uninstall_skill_from_agent` / `batch_uninstall_skills_from_agent` | `installation::*` | |
| 项目管理 | `add_project` / `list_projects` / `get_project_skills` | `services/projects/crud.rs::{add_project_impl, get_project_skills_impl}` | |
| 安装到项目 | `install_skill_to_project` / `uninstall_skill_from_project` | `services/projects/crud.rs::install_skill_to_project_impl(pool, project_id, skill_id, agent_id, method)` | 拒绝 `central` agent |
| 列出 Agents | `get_agents` / `detect_agents` | `db` agents repo | |
| 标签 | `get_skill_tags` / `create_skill_tag` / `assign_skill_tags` / `unassign_skill_tags` / tag groups | `db::create_skill_tag`、`db::assign_skill_tags(pool, skill_ids, tag_ids, source, confidence, reason)` | 纯 DB 写，GUI 侧不拿 Central 锁 |
| AI 标签审核队列 | `get_pending_ai_tag_reviews` / `accept_ai_tag_review` / `skip_ai_tag_review` | `services/ai_tagging` | Agent 自己就是 LLM，可写入审核队列 |
| 说明 | `get_skill_explanation` / `refresh_skill_explanation` | 表 `skill_explanations(skill_id, lang, explanation, model)` | **没有用户备注字段** |
| 收藏集 | `add_skill_to_collection` 等 | `commands/collections.rs::*_impl`（在 commands 层） | 需下沉到 service 才能被 cli_api 调用 |

命令处理器形态：`commands/*` 基本都是 `ipc_boundary` + `observability::run_operation` 包装 `db::*` / `services::*`，业务可直接复用；少数 `*_impl` 仍在 `commands/` 下（collections），需要下沉。

## 3. 数据模型要点

- `skills`：`id`、`uid`（唯一、不可变）、`name`、`description`（来自 SKILL.md frontmatter）、`canonical_path`、`is_central`、`source`、`content`。
- `skill_tags(name UNIQUE, description, color, group_id)`、`skill_tag_links(skill_id, tag_id, confidence, reason, source='manual')`。
- `skill_explanations(skill_id, lang) PK`，带 `model`，GUI 的 "AI explanation" 视图读取。
- 没有 `skill_notes` 之类的用户可编辑说明表。

## 4. 桌面端感知外部变更

- 前端没有 `visibilitychange` / focus 刷新、也没有 `PRAGMA data_version` 轮询。
- `services/deep_link` 只承载导入意图（`skillport://import-intent`），且触发会拉起应用，不适合作为刷新通道。
- 结论：CLI 修改后，桌面窗口需要手动刷新才能看到。

## 5. 仓库内 skill 布局

- `.claude/skills/`、`.agents/skills/` 目前只有 Trellis 与 re_gent 的 skill。
- SkillPort 本身就是 skill 管理器：指导 skill 可以作为一个普通 skill 导入 Central，再同步到所有 Agent 的全局目录，从而在任意项目中可用。
