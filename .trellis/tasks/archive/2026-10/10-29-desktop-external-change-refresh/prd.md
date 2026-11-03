# C4 Desktop refresh on external data change

父任务：`.trellis/tasks/10-29-agent-operable-skillport/`（需求 R6.3、R9，设计 §5、§8）。

## Goal

CLI（或其他进程）修改 Local 数据后，打开中的桌面窗口在重新获得焦点时自动刷新受影响的视图。
同时，在用户刷新 AI 解释、可能覆盖 Agent 写入的说明之前给出确认提示。

## Dependencies

- 没有前置依赖，可以和 C1 并行。
- 覆盖确认的效果要等 C2 的 `notes set` 合并后才能端到端验证；在那之前，用测试数据中
  `model = 'agent:test'` 的行来验证。

## Requirements

- 新增只读 Tauri 命令 `get_data_change_marker`，返回一个单调变化的标记（`PRAGMA data_version` 或
  `operation_logs` 的最大 id，由实现时测试哪个更可靠来决定，并在 design.md 中记录原因）；
  在 `ipc_registry` 中登记为 runtime-only，并执行 `pnpm docs:gen`。
- 前端在 app shell 中监听窗口 focus / `visibilitychange`：标记变化时，调用 Central skills、tags、projects、
  agents 等领域 store 已有的刷新方法；标记没有变化时不发起任何刷新。组件不直接调用 `invoke()`，刷新要防抖。
- 刷新 AI 解释前，如果当前说明的 `model` 以 `agent:` 开头，先弹出确认对话框；中英文文案放在 `src/i18n/`。
- 刷新失败遵循 `async-error-feedback` 规范，不能让当前视图变成空白。

## Acceptance Criteria

- [x] Vitest 覆盖三种情况：标记未变化时不刷新；标记变化时只刷新指定的 store；连续多次 focus 只触发一次刷新。
- [x] Vitest 覆盖 Agent 说明的覆盖确认：确认后执行刷新，取消后不执行。
- [x] Rust 测试证明：用另一个数据库连接写入后，标记会变化。
- [ ] 手工验证：桌面应用打开时，用 `skillport-cli` 修改数据（C2 合并前可以用 `skills sync`），切回窗口后能看到变化。
- [x] `pnpm docs:gen:check` 通过，生成的文件已提交；`just ci` 通过。
