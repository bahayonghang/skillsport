# C1 CLI read surface for agents, projects, tags

父任务：`.trellis/tasks/10-29-agent-operable-skillport/`（需求 R1，设计 §2–§4）。

## Goal

为 `skillport-cli` 增加 Agent 查询数据所需的只读命令，并把 `cli_api` 按领域拆分，为 C2 的写命令打好结构基础。

## Dependencies

- 无前置依赖，可以最先开始。
- C2、C3 依赖本任务完成。

## Requirements

- `cli_api/mod.rs` 拆分为 `mod.rs`（`CliContext`、`CliApiError`、引用解析）和 `skills.rs` 等领域模块；
  现有 5 个命令的行为、JSON 输出和退出码完全不变。
- `CliApiError` 支持实体级错误码：`agent.not_found`、`project.not_found`、`project.ambiguous`、
  `tag.not_found`，退出码沿用 3。现有 `skill.*` 错误码不变。
- 新增命令：
  - `agents list`：id、显示名、是否启用、全局 skills 目录；不包含 Central。
  - `projects list`：id、名称、绝对路径、是否置顶。
  - `projects skills <project>`：项目内每个 Agent 目录下的 skills。`<project>` 按 id → 规范化绝对路径 → 唯一名称解析，`.` 表示当前目录。
  - `tags list`：id、name、description、color、group。
  - `skills list --tag <id|name>... --agent <id> --source <s>`：过滤条件之间是 AND 关系；多个 `--tag` 之间也是 AND。
- `skills show` 只新增字段：`tags`（含每条链接的 source）、`projects`（使用该 skill 的项目）、
  `explanation`（`--lang` 对应语言的说明和 `model`，没有时为 null）。
- 只读命令不获取 Central 互斥锁，也不写 operation log。

## Acceptance Criteria

- [ ] 现有 `skills list|show|search|install|sync` 的 JSON 回归测试通过，输出字段没有被删除或改名。
- [ ] 每个新命令都有 Clap 解析测试和 `cli_api` 单元测试（使用 `test_support` 的临时 DB）。
- [ ] 在临时 HOME 和空 DB 下，`npm run cli -- --json agents list|projects list|tags list` 都返回 `ok: true`。
- [ ] `projects skills` 覆盖三种情况：项目不存在返回 `project.not_found`，项目名重复返回 `project.ambiguous`，`.` 能解析到当前目录。
- [ ] 输出中不包含凭据字段。
- [ ] `pnpm entrypointcheck` 和 `cargo test --bin skillport-cli` 通过；`just ci` 通过。
- [ ] `.trellis/spec/backend/shared-local-cli.md` 的命令表和错误矩阵已更新。
