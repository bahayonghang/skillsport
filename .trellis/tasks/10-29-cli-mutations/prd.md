# C2 CLI mutations for import, install, tags, notes

父任务：`.trellis/tasks/10-29-agent-operable-skillport/`（需求 R2–R6，设计 §3–§6、§10）。

## Goal

为 `skillport-cli` 增加 Agent 修改数据所需的写命令：本地导入 Central、从 Agent 卸载、项目安装与卸载、标签、说明。
所有写命令共用同一套 `--dry-run` / `--yes` 确认契约。

## Dependencies

- **必须在 C1 合并之后开始**：依赖 C1 的 `cli_api` 模块拆分、实体级错误码，以及 project / tag 的引用解析。
- C3 依赖本任务完成。

## Requirements

- 确认契约：
  - `--dry-run` 只返回 `{ dryRun: true, plans: [...] }`，不改动数据库或文件系统。
  - 破坏性或批量操作（卸载、`--replace`、多个目标）缺少 `--yes` 时，返回 `input.confirmation_required` / 退出码 2，
    并在 `details.plans` 中附带计划。
- `skills import --from-zip <file>`：复用 `local_archive_import` 的预览 → 指纹校验 → 导入流程；
  指纹不一致返回 `archive.fingerprint_mismatch`。
- `skills import --from-dir <dir>`：只接受包含 `SKILL.md` 的目录；拒绝 Central 目录本身及其子目录，路径非法时返回 `path.invalid`。
  优先复用现有 centralize 路径，确实没有可用入口时再在 `services/` 中新增用例。
- 两种导入方式都可以与 `--replace`、`--sync --agent` 组合，语义与现有 `skills install` 一致。
- `skills unlink <ref>... --agent <id>`：从指定 Agent 的全局目录卸载。
- `projects add [path]`（默认 `.`）、`projects install <project> <ref>... --agent <id> [--method]`、
  `projects uninstall <project> <ref>... --agent <id>`；复用 `services/projects`，拒绝把 `central` 作为目标 Agent。
- `tags create <name> [--group --color --description]`。
- `tags add <ref>... --tag <id|name>... [--reason --confidence]`：默认直接生效，`source = "agent"`；
  加 `--review` 时写入 AI 标签审核队列。标签名不存在时返回 `tag.not_found`，不会自动创建。
- `tags remove <ref> --tag <id|name>...`。
- `notes get <ref> [--lang]` / `notes set <ref> (--text T | --file F) [--lang] [--author A]`：
  写入 `skill_explanations`，`model = "agent:<author|cli>"`；`--file` 要校验大小上限和 UTF-8 编码。
- 锁和操作日志与对应的 GUI 命令保持一致：Central / 安装类操作获取共享 Central 锁；标签和说明是纯数据库写，不获取锁。
  每个写命令都写入经过脱敏的 operation log，分类与 GUI 命令一致。

## Acceptance Criteria

- [ ] 每个写命令都有测试证明 `--dry-run` 不产生副作用（数据库行数和目标目录快照不变）。
- [ ] 每个需要 `--yes` 的命令，缺少 `--yes` 时都返回 `input.confirmation_required` 并附带计划。
- [ ] ZIP 导入覆盖：成功、重复导入（没有 `--replace`）、`--replace`、指纹不一致、路径穿越被拒绝。
- [ ] 目录导入覆盖：成功、缺少 `SKILL.md`、目录位于 Central 内被拒绝、符号链接按 scanner 的策略处理。
- [ ] 桌面应用持有 Central 锁时，导入和 `skills unlink` 都返回 `mutation.busy` / 退出码 4。
      `projects install/uninstall` 只读 Central、写项目目录，与对应 GUI 命令一样不获取 Central 锁（2026-10-30 决定）。
- [ ] `tags add` 默认写入 `source = 'agent'`；随后执行 AI 重新打标签，`agent` 来源的链接仍然保留。
- [ ] `notes set` 写入后，桌面应用的解释视图能读到这条说明，`model` 以 `agent:` 开头。
- [ ] 现有命令的回归测试通过；`just ci` 通过。
- [ ] `.trellis/spec/backend/shared-local-cli.md`（确认契约、错误码）和 `central-skill-tags.md`
      （来源取值 `manual | ai | agent`）已更新。
