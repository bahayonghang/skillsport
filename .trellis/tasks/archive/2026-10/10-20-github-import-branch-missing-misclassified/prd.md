# GitHub 导入向导：分支默认值、错误分类、失败审计与输入卡片优化

## Goal

让 GitHub repo import 向导的输入步做到四件事：

- 对默认分支不是 `main` 的仓库，默认就能预览成功；
- 失败时给出准确、可操作的错误；
- 每次失败都能在 Operation Log 和 Runtime Log 中定位到失败环节；
- 输入卡片能完整显示 URL，徽章与排版统一、精致。

## Background

- 根因见 `research/root-cause.md`。网络和 token 都正常，但向导默认显式提交 `main`，覆盖了仓库的 `default_branch`（`master`）。之后 `GET /repos/{o}/{r}/commits/main` 返回 422，被包成 `GithubImportError::Http`，再映射为 `github_import.transport_failed`，UI 于是显示"无法连接 GitHub"。
- UI 与日志现状见 `research/ui-audit.md`，问题编号 U1–U4、B1–B5、E1–E3、L1–L4。
- 任务结构：各需求都会修改 `GitHubRepoImportWizardInput.tsx` / `GitHubRepoImportWizardChrome.tsx`，或修改 GitHub import 的错误契约。拆成子任务会在同一组文件上冲突，所以作为单一任务实施，在 `implement.md` 中分阶段验收。

## Requirements

### R1 默认使用仓库默认分支（修 B4、B5）

- 分支选择新增"仓库默认分支"选项，并设为默认选中。在这个状态下向后端提交 `branch = null`，后端使用 `/repos/{o}/{r}` 返回的 `default_branch`。
- 用户仍可显式选择 `main`、`dev` 或自定义分支。URL 自带 `/tree/<branch>` 时，沿用现有的 reconcile 语义，并预选对应的选项。
- 预览工具栏的"重新预览"沿用本次预览实际使用的分支选择，不再回退到 `"main"`（`GitHubRepoImportWizardChrome.tsx:180`）。
- 预览结果展示实际解析出的分支名。
- 分支提示文案（`githubBranchDefaultHint` 等）en/zh 同步更新；如果公开文案有变化，同时对齐 `README.md` / `README_CN.md`。

### R2 分支不存在时给出准确错误（修 E2 的主因）

- `commits/{ref}` 返回 422（No commit found）时，映射为新的稳定码 `github_import.branch_not_found`，`retryable=false`。
- 文案说明仓库中找不到所选分支，并引导用户改用仓库默认分支或检查分支名，不出现"检查网络"。分支名只在前端根据本地状态插入，不经过后端错误值。
- 按现有流程登记新码：`reviewed_codes.rs`、`ipc_error.rs` 的 public message、`generatedCommandMap.ts`（通过 `pnpm docs:gen` 生成）、`src/lib/ipc/errors.ts`、i18n。

### R3 确定性 HTTP 状态不再冒充传输失败（修 E2、L2）

- 收到了 HTTP 响应、但状态码属于"非鉴权、非限流、非 404、非 422 分支缺失"的 4xx 时，映射为新的稳定码 `github_import.request_rejected`，`retryable=false`。文案说明"GitHub 拒绝了该请求"，不提网络。
- `transport_failed` 只用于以下情况：连接失败、超时、请求发送失败、响应体读取失败、5xx（包括重试耗尽）。它的文案和 `retryable=true` 保持不变。
- 错误值、IPC envelope 和日志只携带静态码、静态类别和数字状态码，不包含 URL、token、响应体或分支名（遵循 `github-import-preview-contract.md` 与 `redaction-policy.md`）。
- tree 快速路径失败后回退到 archive 的行为保持不变：`fallback_reason_for` 对新的 HTTP 状态变体给出与原 `Http(_)` 相同的回退结论。

### R4 输入卡片排版与样式（修 U1–U4、B1–B3、E1）

- **尺寸**：适当放大输入步弹窗。在 ≥ 1280px 宽的窗口中，`https://github.com/<owner>/<repo>` 形式的完整 URL 能一次显示完整。
- **布局**：URL 独占一行；分支选择和 Preview 按钮在第二行；同一行内控件高度一致、底边对齐，不再使用 `sm:mt-7` 这类硬编码偏移。分支提示紧贴分支控件。
- **底部空白**：去掉输入步底部的空白带（U3），卡片高度由内容决定。
- **头部**：描述和来源徽章不再重复表达来源，描述改用面向用户的语言（例如说明预览是只读的）。来源徽章和标题对齐，与关闭按钮保持一致间距。
- **步骤条**：去掉按钮式阴影；未激活步骤的序号在暗色、亮色主题下都满足可读对比度；连接线长度适度；当前步骤带 `aria-current="step"`。
- **错误框**：每个错误码有简短标题、说明和下一步动作。`branch_not_found` 提供"使用仓库默认分支"一键动作；`transport_failed` 提供"重试"；`request_rejected` 和其它错误码显示标题与说明。
- **规范**：遵循 `typography-tokens.md`、`icon-control-hit-area.md` 和主题 token。

### R5 Preview 失败写入 Operation Log，并补充诊断字段（修 L1、L3、L4）

- `preview_github_repo_import` 的日志策略由 `RuntimeOnly(Preview)` 改为 Operation 策略：只记录失败，成功的预览不写 Operation Log。
- 每条失败记录包含静态字段：`errorCode`、`errorCategory`（细分到传输子类）、`phase`、`retryable`，以及：
  - `failureStage`：取值 `repo_inspect`、`commit_resolve`、`snapshot_acquire`、`candidate_build`、`snapshot_register`；
  - `httpStatus`：收到 HTTP 响应时为数字状态码，否则不写这个字段。
- 失败的 IPC 错误携带 operation ID 作为 correlation ID，Runtime Log 中前后端的对应行可以按这个 ID 关联。Runtime Log 的 `category` / `phase` 改为 `import` / `network`，与 import 路径一致。
- Local、SSH 和 WSL 三种目标的 preview 都适用。

## Constraints

- 不改变 preview 的 commit pinning、快照、mirror/redirect 安全语义，不改变 import 路径的行为，不改变 skills CLI 的 preview 策略。
- 凭证继续只经过 `SecretStore`。
- 修改 Tauri command 策略或错误码清单后，执行 `pnpm docs:gen` 并提交生成文件。
- 用户可见文本全部走 `src/i18n/`，en/zh 同步；组件不直接调用 `invoke()`。

## Acceptance Criteria

- [ ] AC1（R1）：对默认分支为 `master` 的仓库，保持向导初始状态执行 Preview 能成功，结果显示 `master`。前端测试断言初始状态提交的是 `branch = null`。
- [ ] AC2（R1）：重新预览沿用原来的分支选择；URL 自带 `/tree/x` 时，预选自定义分支 `x`。
- [ ] AC3（R2）：在只有 `master` 的仓库上显式选择 `main` 执行 Preview，返回 `github_import.branch_not_found`，`retryable=false`，文案不提网络。错误框中的"使用仓库默认分支"动作能直接让预览成功。
- [ ] AC4（R3）：后端单测覆盖以下映射：
  - 422 映射为 `branch_not_found`；
  - 400/409 等非特殊 4xx 映射为 `request_rejected`；
  - 5xx、连接失败和超时仍映射为 `transport_failed`；
  - tree 回退结论不变。
- [ ] AC5（R4）：在 1280px 宽窗口中，约 60 字符的 GitHub URL 能完整显示；同一行控件底边对齐；输入步没有底部空白带。亮色、暗色和约 900px 宽窗口下各有截图证据。
- [ ] AC6（R4）：头部描述与徽章不重复；步骤条没有按钮式阴影，并带有 `aria-current`；错误框对三个关键错误码分别展示正确的标题和动作；新增文案 en/zh 齐全。
- [ ] AC7（R5）：一次 422 失败和一次连接失败的 preview，分别各产生一条 Operation Log 记录，`errorCode`、`errorCategory`、`failureStage`、`httpStatus` 可区分；成功的预览不产生 Operation Log 记录；记录和 Runtime Log 中都没有 URL、token 或分支名；同一个 operation ID 能同时关联到 Operation 和 Runtime 证据。
- [ ] AC8：注册表测试、observability gate 和 `docs:gen:check` 通过。`github-import-preview-contract.md` 的错误矩阵、`observability-gates.md` 的 lifecycle 描述，以及相关前端 spec，都已更新。
- [ ] AC9：`just ci` 通过。

## Out of Scope

- 通过 GitHub API 列出仓库分支供用户选择。
- 在错误框中展示 operation ID，或从错误框跳转到日志页（E3）。
- 预览、确认和结果步的布局改动。只改输入步，以及各步共用的头部和步骤条。
- 成功预览的审计记录。
