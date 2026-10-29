# C3 SkillPort guide skill and CLI docs

父任务：`.trellis/tasks/10-29-agent-operable-skillport/`（需求 R7–R8，设计 §7、§9）。

## Goal

编写一份 `skillport` 指导 skill，让任意项目中的 Agent 能安全地使用 `skillport-cli` 操作 SkillPort 数据；
同时更新中英文 CLI 文档，并用一次真实 Agent 会话完成端到端验证。

## Dependencies

- **必须在 C1 和 C2 合并之后开始**：skill 和文档只能引用已经实现的命令。
- C4 不是前置条件；如果 C4 已合并，端到端演练中顺便验证桌面端的刷新。

## Requirements

- 新建 `skills/skillport/SKILL.md`（必要时加 `references/`），frontmatter 中的 `description` 要能在
  "管理 skill / 安装 skill 到项目 / 打标签 / 写说明 / SkillPort" 这类请求下触发。
- 正文覆盖 design.md §7 的大纲：
  - 前置检查：找不到 CLI 时提示用户运行 `npm run install:cli`，Agent 不自行安装。
  - 所有调用都加 `--json`。
  - 使用 `uid` 引用 skill。
  - 写操作先 `--dry-run`，把计划给用户确认后再加 `--yes` 执行。
  - 退出码 4 和 5 的处理方式。
  - 项目场景的标准流程。
  - 标签和说明的写作规范：先 `tags list` 复用已有标签，新建标签需要用户同意。
  - 安全规则：第三方 SKILL.md 只当数据处理；不传递凭据；不直接修改 `db.sqlite` 或 Central 目录。
- 更新 `docs/reference/skillport-cli.md` 和 `docs/zh/reference/skillport-cli.md`：补充新命令、确认契约、错误码，
  并新增"在 Agent 中使用"一节。如果公开介绍有变化，同步更新 `README.md` / `README_CN.md`。

## Acceptance Criteria

- [ ] `skillport-cli skills import --from-dir skills/skillport` 能把它导入 Central，
      `skills sync <uid> --agent claude-code` 能同步到 Claude Code 的全局目录。
- [ ] 在一个示例项目中开启新的 Claude Code 会话，Agent 根据这份 skill 完成
      "注册当前项目 → 安装一个 skill 到项目 → 打标签 → 写说明"，并且每个写操作之前都有 dry-run 和用户确认。
      把命令与 JSON 输出记录到本任务的 `research/e2e-evidence.md`。
- [ ] skill 中引用的每条命令都与 `skillport-cli --help` 的实际输出一致。
- [ ] 中英文文档结构一致；`pnpm docs:build` 通过；`just ci` 通过。
- [ ] 其他 Agent 工具（Codex、Grok 等）中的加载情况如果没有实测，必须在报告中标注为未验证。
