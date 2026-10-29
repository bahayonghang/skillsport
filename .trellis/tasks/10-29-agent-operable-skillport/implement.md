# Implement plan

本任务是父任务，负责需求、子任务映射和最终集成验收。实现工作在子任务中进行（见 design.md §12）。
子任务按需创建：

```bash
python ./.trellis/scripts/task.py create "<title>" --slug <slug> --parent .trellis/tasks/10-29-agent-operable-skillport
```

## 0. 进入实现前的关卡

- [x] Q1（说明语义）：复用 `skill_explanations`（2026-10-29）。
- [x] Q2（分发方式）：MVP 沿用 `npm run install:cli`（2026-10-29）。
- [x] Q3（标签默认行为）：默认直接生效，`--review` 进入审核队列（2026-10-29）。
- [x] 已创建子任务 C1–C4（2026-10-29）；C5、C6 不在 MVP 内，之后需要时再建。
      每个子任务都有自己的 `prd.md` / `implement.md`，以下第 1–4 节是概览，**以子任务目录中的文件为准**：
      `10-29-cli-read-surface`、`10-29-cli-mutations`、`10-29-skillport-guide-skill`、`10-29-desktop-external-change-refresh`。
- 执行顺序：C1 与 C4 可以并行 → C2（需要 C1 已合并）→ C3（需要 C1 和 C2 已合并）。
- [ ] 为每个子任务配置 `implement.jsonl` / `check.jsonl`，至少包含：
      `.trellis/spec/backend/index.md`、`.trellis/spec/backend/shared-local-cli.md`、
      `.trellis/spec/quality/index.md`、本任务的 `research/current-surface.md`；C4 另外需要 `.trellis/spec/frontend/index.md`。

## 1. C1 cli-read-surface

1. 拆分 `src-tauri/src/cli_api/mod.rs`：错误类型和引用解析留在 `mod.rs`，`skills.rs` 承接现有方法，行为不变。
2. 扩展 `CliApiError`，新增实体级 not_found / ambiguous 错误码；保证现有 `skill.*` 错误码不变，并补测试。
3. 新增 `agents list`、`projects list`、`projects skills`、`tags list`、`skills list --tag/--agent/--source`，
   以及增强的 `skills show`。
4. 在 bin 中补充 Clap 解析表测试、JSON 信封测试，以及临时 HOME 下的空 DB 冒烟测试。

验证：

```bash
cargo test --manifest-path src-tauri/Cargo.toml --bin skillport-cli
cargo test --manifest-path src-tauri/Cargo.toml --lib cli_api
pnpm entrypointcheck
```

回滚点：只有读命令，可以直接 revert。

## 2. C2 cli-mutations

1. 实现 `--yes` / `--dry-run` 通用契约（`input.confirmation_required`，`details` 中附带计划）。
2. `skills import --from-zip`：先 preview，再校验 fingerprint，最后 import；测试覆盖重复导入、`--replace`、指纹不一致。
3. `skills import --from-dir`：先确认能否复用 centralize 路径；不能复用时在 `services/` 新增用例。
   测试覆盖 Central 子目录拒绝和符号链接策略。
4. `skills unlink`、`projects add/install/uninstall`：复用 `installation` 与 `projects` service，
   为每个命令补 dry-run 无副作用测试。
5. `tags create/add/remove`（含 `--review` 写入审核队列）、`notes get/set`（写 `skill_explanations`，
   `model = "agent:<author>"`）。
6. 锁测试：模拟桌面端持有 Central 锁，确认写命令返回 4。
7. 确认 operation log 的分类和脱敏与对应 GUI 命令一致。

验证：同 C1，并在 `npm run cli -- --json ...` 下用临时 HOME 手工冒烟一轮。

回滚点：每类命令单独提交，可以分别 revert。

## 3. C3 skillport-guide-skill

1. 编写 `skills/skillport/SKILL.md`（大纲见 design.md §7），只引用已经实现的命令。
2. 更新 `docs/reference/skillport-cli.md` 和 `docs/zh/reference/skillport-cli.md`；
   如果公开描述有变化，同步更新 `README.md` / `README_CN.md`。
3. 更新 `.trellis/spec/backend/shared-local-cli.md` 的命令表、错误码和确认契约。
4. 端到端演练：导入指导 skill → 同步到 Claude Code → 在一个示例项目中让 Agent 完成
   "注册项目 → 安装 skill → 打标签 → 写说明"，把命令与 JSON 输出存为 `research/e2e-evidence.md`。

验证：`pnpm docs:build`，以及演练证据。

## 4. C4 desktop-external-change-refresh

1. 新增只读 Tauri 命令 `get_data_change_marker`（返回 operation log 最大 id 或 `PRAGMA data_version`），
   在 `ipc_registry` 中登记为 runtime-only。
2. 前端在 app shell 中监听 focus / `visibilitychange`，标记变化时通过各领域 store 的刷新方法刷新，组件不直接调用 `invoke()`。
3. AI 解释刷新前，如果 `model` 以 `agent:` 开头，弹出覆盖确认（PRD R6.3），文案走 `src/i18n/`。
4. 执行 `pnpm docs:gen` 并提交生成文件；补 Vitest 用例，覆盖"标记未变化时不刷新"和覆盖确认。

验证：

```bash
pnpm test
pnpm docs:gen:check
```

以及手工验证：桌面应用打开时用 CLI 打标签，切回窗口后能看到新标签。

## 5. 集成验收（父任务）

- [ ] 逐条核对 prd.md 中的 Acceptance Criteria。
- [ ] `just ci` 通过。
- [ ] 用 `npm run install:cli` 在干净的 PATH 下安装，确认 `skillport-cli --version` 可用，指导 skill 的前置检查能通过。
- [ ] 在报告中明确列出未验证的部分（例如其他 Agent 工具中的 live skill 加载）。
