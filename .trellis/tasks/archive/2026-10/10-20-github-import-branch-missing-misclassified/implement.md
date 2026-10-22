# Implement Plan

按阶段推进，每个阶段单独可验证、单独可提交（实施完成后作为一个 squash PR 合入 `dev`）。

## Phase A 后端错误分类（R2、R3）

1. [x] `error.rs`：
   - 新增变体 `BranchNotFound` 和 `HttpStatus { status, context }`；
   - 补齐 `ipc_error_code`、`snapshot_failure_classification`、`diagnostic_category`；
   - 新增访问器 `http_status()`。
2. [x] 改造构造点：
   - `snapshot.rs::resolve_commit_sha` 的 422 → `BranchNotFound`；
   - `source.rs`、`raw_http.rs` 和 `tree_manifest.rs` 中带状态码的分支 → `HttpStatus`；
   - 逐一核对剩余的 `Http(String)` 构造点。
3. [x] `tree_manifest.rs::fallback_reason_for` 穷尽匹配新变体，保持原有回退结论。
4. [x] 登记新码：`ipc_error.rs`（public message，不加入 `retryable_for_code`）、`reviewed_codes.rs`。
5. [x] 单测（`services/github_import/tests.rs` 和 `error.rs` 测试）：
   - 422 → `branch_not_found` / non-retryable；
   - 400、409 → `request_rejected`；
   - 500、503 → `transport_failed`；
   - 连接失败和超时 → `transport_failed`；
   - tree 回退结论不变；
   - IPC envelope 和 diagnostic 中不出现 URL 或分支名。
6. [x] 验证：`cargo test -p skillport github_import`、`cargo test ipc_error`（具体命令以 `docs/agents/build-and-test.md` 为准）。

**回滚点**：Phase A 可以单独 revert。

## Phase B Preview 失败写入 Operation Log（R5）

1. [x] `observability/policy.rs`：新增 `OperationLifecycle::FailureOnly`。
2. [x] `observability/operation.rs`：
   - `run_operation` 在 `FailureOnly` 下跳过 started 和 success 记录；
   - `record_final_best_effort` 兼容 `FailureOnly`；
   - `ReviewedDiagnostic` 增加 `failure_stage`、`http_status` 两个字段及对应 builder；
   - `diagnostic_details` 在有值时写入。
3. [x] `preview.rs`：
   - 新增 `PreviewStage` 和 `PreviewFailure`；
   - local 与 remote 的 preview 在各阶段打标；
   - 新增 staged 入口，旧签名保持不变。
4. [x] `commands/github_import.rs`：preview 改为通过 `run_operation` 执行，并新增 `preview_reviewed_failure`。
5. [x] `ipc_registry.rs:147` 改为 `operation(Import, Network, FailureOnly)`，并更新注册表测试。
6. [x] docs 生成器支持 `failure-only`；执行 `pnpm docs:gen`，提交生成文件；更新 `src/test/scripts/docsGeneration.test.ts`。
7. [x] 测试：
   - 失败的 preview 恰好写入一条 Operation Log 记录，字段齐全；
   - 成功的 preview 写入零条；
   - IPC 错误带有 correlation ID；
   - runtime failure 的 category/phase 为 `import` / `network`；
   - 隐私：details 中没有 URL、token 或分支名。
8. [x] 验证：Rust 测试、`pnpm docs:gen:check`、observability gate 相关测试。

**回滚点**：Phase B 可以单独 revert，前提是先 revert 注册表行。

## Phase C 前端分支默认值与错误框（R1、R2、R4 的错误部分）

1. [x] `GitHubRepoImportWizardInput.tsx`：
   - 新增 `default` 模式并设为默认；
   - `effectiveBranch` 在 `default` 模式下为 `""`；
   - 分支提示按模式切换文案。
2. [x] `GitHubRepoImportWizardChrome.tsx:180`：重新预览沿用 `previewedBranch`。工具栏显示解析出的分支名（如果目前缺失）。
3. [x] `githubImportWizardUtils.ts`：新增 `describeGitHubPreviewError`。错误框渲染标题、正文和动作，动作包括 `use_default_branch` 与 `retry`。
4. [x] `src/lib/ipc/errors.ts` 补充 canonical message；执行 `pnpm docs:gen` 刷新 `generatedCommandMap.ts`。
5. [x] i18n（en/zh）：
   - `githubBranchOption.default`；
   - 更新 `githubBranchDefaultHint`；
   - `github_import.branch_not_found` 和 `github_import.request_rejected`；
   - `marketplace.githubImportError.*`；
   - 新的 `githubImportDesc`。
6. [x] 测试：
   - `GitHubRepoImportWizard.test.tsx`：初始状态提交 `null`；`branch_not_found` 时点击"使用仓库默认分支"会以 `null` 重新预览；`transport_failed` 显示"重试"；重新预览沿用原分支。
   - `githubImportWizardUtils.test.ts`：三个错误码的描述。
   - `backendError.test.ts`：新码已登记。
   - i18n parity 测试。

## Phase D 布局与样式（R4 其余部分）

1. [x] `githubImportWizardViewModel.ts`：输入步改为 60rem 宽，`max-h` 改为 40rem。
2. [x] 把输入块移入 body；header 只保留标题、徽章和步骤条；消除空 body 带。
3. [x] 输入卡片两行布局，统一 `h-9`，去掉 `sm:mt-7`；分段控件改为 `inline-grid grid-cols-4`；窄屏下纵向排列。
4. [x] 头部：标题行与徽章对齐；更新描述文案；删除重复的 no-write 提示行。
5. [x] 步骤条：改用 `ol`/`li` 并加 `aria-current`；去阴影；提高未激活序号的对比度；连接线加 `max-w-20`。
6. [x] 保持现有 `data-testid`（`github-import-compact-header`、`github-import-flat-stepper` 等），更新相关快照和断言。
7. [ ] 视觉验证：执行 `pnpm tauri dev`（Windows 原生），截图覆盖 1280px 亮色、1280px 暗色、约 900px 宽三种情况，每种都包含长 URL 和 `branch_not_found` 错误状态。截图存放在任务的 `research/screenshots/` 下。无法运行原生环境时，标记为 UNVERIFIED。

## 收尾

1. [x] 更新 spec：
   - `github-import-preview-contract.md`：错误矩阵增加 422 / 4xx / 5xx 行和 `failureStage`；
   - `observability-gates.md`：说明 `FailureOnly` lifecycle；
   - 必要时更新前端 `async-error-feedback.md`。
2. [x] 如果 README / README_CN 中有与分支默认值相关的公开文案，同步对齐。
3. [x] 执行 `just ci`，全部通过后才能声明完成。报告跳过的检查，以及未验证的原生或网络证据。
4. [ ] 手动验收：在真实网络下分别执行以下操作，并在 Operation Log 中看到对应记录：
   - 对一个默认分支为 `master` 的仓库执行默认 Preview；
   - 显式选择 `main`；
   - 断网后执行 Preview。

## 风险文件

- `src-tauri/src/observability/operation.rs`（所有 Operation 命令共享）
- `src-tauri/src/ipc_registry.rs`（策略矩阵和生成文档）
- `src-tauri/src/services/github_import/error.rs`（Central update inventory 也依赖它的映射）
- `src/components/marketplace/GitHubRepoImportWizardChrome.tsx`（各步共用的头部）
