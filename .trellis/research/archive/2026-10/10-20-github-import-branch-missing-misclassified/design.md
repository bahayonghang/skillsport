# Design

## 1. 分支默认值（R1）

**前端** `GitHubRepoImportWizardInput.tsx`：

- `GitHubBranchMode` 改为 `"default" | "main" | "dev" | "custom"`。
- `getInitialBranchMode` 的映射：空字符串 → `default`，`"main"` → `main`，`"dev"` → `dev`，其它值 → `custom`。
- `effectiveBranch` 的取值：在 `default` 模式下为 `""`。
- store 端 `normalizeGitHubBranch`（`marketplaceStore.githubImportSlice.ts:20`）已经把空值归一为 `null`，IPC 契约 `branch: Option<String>` 不需要改。

**重新预览**：`GitHubRepoImportWizardChrome.tsx:180` 改为 `onPreviewSubmit(branch)`，其中 `branch` 来自 store 的 `previewedBranch`；值为 `null` 时传 `""`。

**结果展示**：预览工具栏已经显示 `preview.repo`，需要确认是否显示了 `preview.repo.branch`（后端解析出的展示分支）。如果没有，就在仓库名旁加一个分支徽章。

**后端**：不需要改。`resolve_repo_source_with_branch` 在 `selected_branch` 为 `None` 时已经使用 `default_branch`。

## 2. 错误分类（R2、R3）

### 新变体（`services/github_import/error.rs`）

```rust
#[error("GitHub repository branch was not found")]
BranchNotFound,
#[error("GitHub returned HTTP {status} while {context}")]
HttpStatus { status: u16, context: &'static str },
```

- `context` 是静态短语，例如 `"inspecting the repository"`，只出现在内部 Display 中，不进入日志或 IPC 的公开消息。
- `Http(String)` 只保留给"没有拿到响应"的传输错误，即客户端构建失败和请求发送失败。

### 构造点

| 位置 | 现状 | 改为 |
| --- | --- | --- |
| `snapshot.rs:36-50` `resolve_commit_sha` | 404 → `RepoNotFound`；其它 → `Http` | 先经过 denial 分类；再判断 422 → `BranchNotFound`；其余状态 → `HttpStatus` |
| `source.rs:38-50` | 非 2xx → `Http` | `HttpStatus` |
| `raw_http.rs:520, 615`；`tree_manifest.rs:315` | 带 `HTTP {status}` 文案的 `Http` | `HttpStatus` |
| `raw_http.rs:568, 598`；`archive.rs:257`；`pat.rs:75, 334`；`tree_manifest.rs:346`；`raw_http.rs:100, 143` | 没有状态码的传输错误 | 保持 `Http`。实现时逐一核对：如果某处其实有状态码，就改为 `HttpStatus` |

### 映射

| 变体 | `ipc_error_code` | `retryable` | 快照分类（`snapshot_failure_classification`） |
| --- | --- | --- | --- |
| `BranchNotFound` | `github_import.branch_not_found` | false | terminal `github_import.branch_not_found` |
| `HttpStatus` 4xx | `github_import.request_rejected` | false | terminal `github_import.http_client_error` |
| `HttpStatus` 5xx | `github_import.transport_failed` | true | terminal `github_import.http_server_error`（与原 `Http` 的 terminal 语义一致） |
| `Http(_)` | `github_import.transport_failed`（不变） | true | terminal `github_import.transport_unknown`（不变） |

- `retryable_for_code`（`ipc_error.rs:212`）不加入新码，所以新码默认不可重试。
- `ipc_error.rs` 中补充新码的 public message；`reviewed_codes.rs` 登记新码。
- tree 回退：`tree_manifest.rs:362` 的 `fallback_reason_for` 把 `HttpStatus { .. }` 和 `BranchNotFound` 都映射为 `FallbackReason::Transport`，与原先 `Http(_)` 的回退结论一致。实际上 pinned SHA 不会触发 422，这里只是穷尽匹配。
- Central update inventory 等调用方只依赖 `diagnostic_category` 和 `ipc_error_code`，新变体通过上表的映射自然接入。实现时需要 grep 所有 `GithubImportError::Http` 的匹配点（目前只有 `error.rs` 和 `tree_manifest.rs` 两处）。

### 新增访问器

`GithubImportError::http_status(&self) -> Option<u16>`：只有 `HttpStatus` 返回 `Some`。

## 3. Preview 失败写入 Operation Log（R5）

### 生命周期

- `observability/policy.rs` 的 `OperationLifecycle` 新增 `FailureOnly`。
- `observability/operation.rs::run_operation` 在这个生命周期下：
  - 不写 started 记录；
  - 成功时不写任何记录，直接返回值；
  - 失败时按 terminal 写入，并附带 correlation ID。
- `record_final_best_effort` 和 `operation.rs:753` 的分支把 `FailureOnly` 当作 `TerminalOnly` 处理。

### 注册表

- `ipc_registry.rs:147` 改为 `operation(Import, Network, FailureOnly)`。
- `representative_policies_preserve_product_semantics` 测试中把 preview 的断言改为 Operation + `FailureOnly`。
- skills CLI 的 preview 断言保持 `RuntimeOnly(Preview)` 不变。

### 文档生成

docs 生成器需要支持新的 lifecycle 字符串（`failure-only`），并同步更新 `src/test/scripts/docsGeneration.test.ts`。

### 诊断附加字段

- `ReviewedDiagnostic` 增加两个可选字段：`failure_stage: Option<&'static str>` 和 `http_status: Option<u16>`，用 `const fn` builder 设置。
- `diagnostic_details` 在字段有值时写入 `failureStage` / `httpStatus`。
- 这两个都是静态枚举值或数字，满足 redaction 约束。

### 阶段跟踪

- `preview.rs` 新增内部类型 `PreviewFailure { stage: PreviewStage, error: GithubImportError }`。
- `preview_github_repo_import_with_branch_and_auth` 和 remote 版本在每个阶段用 `.map_err(stage)` 打标：

  | 阶段 | 对应步骤 |
  | --- | --- |
  | `RepoInspect` | 解析 URL 和仓库信息 |
  | `CommitResolve` | 解析 commit |
  | `SnapshotAcquire` | 通过 tree 或 archive 获取快照 |
  | `CandidateBuild` | 构建候选和文件清单 |
  | `SnapshotRegister` | 注册快照 |

- 新增 `*_staged` 入口供 command 调用。原有签名保持不变（内部丢弃 stage），供 CLI 和测试使用。

### Command 层

`commands/github_import.rs::preview_github_repo_import` 改为调用 `run_operation`：

- context 只放 `operation_target(&active_target)`，沿用 import 命令的做法：不把仓库 URL 或分支作为 subject。
- `build_success` 返回一个不会被写入的 `SafeOperationResult::succeeded(...)`。
- 失败时通过 `preview_reviewed_failure(definition, &PreviewFailure)` 构造 `ReviewedDiagnostic`：
  - `code`：取 `ipc_error_code()`，没有则为 `internal.unexpected`；
  - `category`：取 `snapshot_diagnostic_category()`，可以区分 timeout、request、body、4xx、5xx；
  - `phase`：`Network`；
  - `message`：`public_message_for_code`；
  - `retryable`：根据 code 判定；
  - 再附加 `.stage(..)` 和 `.http_status(..)`。
- `github_direct_auth_from_secret_store` 的失败也走同一路径，stage 记为 `RepoInspect`。

### Runtime Log

- `ipc_boundary` 按注册表策略记录 runtime 失败。改成 Operation 策略后，category 和 phase 自动变为 `import` / `network`，并带上 correlation ID，修复 L4。

## 4. 前端错误呈现（R2、R4 的错误框）

- `githubImportWizardUtils.ts` 新增 `describeGitHubPreviewError(error, t, { branch, repoLabel })`，返回 `{ title, body, action: "use_default_branch" | "retry" | null }`：
  - `branch_not_found`：标题"找不到分支"；正文插入前端已知的分支名和 `owner/repo`（从输入的 URL 解析，只用于显示）；动作 `use_default_branch`。
  - `request_rejected`：标题"GitHub 拒绝了请求"；无动作。
  - `transport_failed`：标题"无法连接 GitHub"；动作 `retry`。
  - 其它错误码：标题"预览失败"；正文沿用 `formatGitHubImportError`。现有的 snapshot 和 PAT 提示行保留。
- 动作按钮使用 `Button size="sm" variant="outline"`，满足热区规范。
  - `use_default_branch`：调用 `handleBranchModeChange("default")`，然后提交预览。
  - `retry`：用当前分支重新提交预览。
- `src/lib/ipc/errors.ts` 的 `canonicalMessage` 补充两个新码；i18n 在 `github_import.*` 下补充 `branch_not_found` 和 `request_rejected`，并新增 `marketplace.githubImportError.*` 用于标题和动作文案，en/zh 同步。

## 5. 布局与样式（R4）

### 弹窗尺寸

`githubImportWizardViewModel.ts:212` 中，输入步的宽度改为 `!w-[min(92vw,60rem)] !max-w-[min(92vw,60rem)]`，最大高度改为 `max-h-[min(92vh,40rem)]`。预览步的尺寸不变。

### 结构

- 把 `GitHubRepoImportUrlInputBlock` 从 header 移到 body 渲染，header 只保留标题、徽章和步骤条。
- 输入步的 body 使用 `px-6 pb-5 pt-4`。只有在没有任何内容时才不渲染 body，这样可以去掉空白带（U3）。
- footer 已经在 `!showSharedShellBody` 时返回 null，不需要改。

### 输入卡片

```
┌──────────────────────────────────────────────────────────┐
│ GitHub 仓库 URL                                           │
│ [https://github.com/owner/repo........................]  │  ← 独占一行，font-mono
│ 分支                                                      │
│ [● 默认分支 | main | dev | 自定义]          [✦ 预览导入]  │  ← grid [minmax(0,1fr)_auto] items-end，统一 h-9
│ 使用仓库在 GitHub 上设置的默认分支。                       │  ← 分支提示，紧贴分段控件
│ [自定义分支输入框]（仅 custom 模式）                       │
│ ┌ ⚠ 找不到分支 ─────────────────────────────────────────┐ │
│ │ 仓库 owner/repo 中没有分支 main。   [使用仓库默认分支] │ │
│ └───────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- 分段控件容器为 `h-9 p-0.5`，选项为 `h-8`；`Input` 和 `Button` 统一 `h-9`。去掉 `sm:mt-7`。
- 分段控件改为 `inline-grid grid-cols-4`，宽度随内容伸缩，最小宽度不再固定为 14rem。
- 窄屏（< `sm`）时第二行改为纵向排列，按钮占满整行。

### 头部

- 第一行：左侧为图标和标题，右侧为来源徽章，`items-center` 对齐；徽章右侧留出与关闭按钮一致的 `pr-10` 间距，并用 `self-center` 保证与标题同一基线。
- 第二行：描述改为 `githubImportDesc`。新文案表达"预览仓库中的技能；确认导入前不会写入任何内容"，不再提 launcher。卡片中原有的 `githubImportNoWriteHint` 行随之删除，避免重复。
- 徽章：保留 `githubImportHeaderLauncher`，样式改为 `text-ui-meta`、细边框，去掉粗体。

### 步骤条

- 去掉 `shadow-sm`。
- 未激活的序号由 `bg-background` 改为 `bg-muted text-foreground/70` 加 `ring-1 ring-border`。
- 连接线由 `flex-1` 改为 `flex-1 max-w-20`。
- 用 `<ol>` / `<li>` 包装；当前步骤加 `aria-current="step"`。

### 主题

只使用现有 token（`primary`、`muted`、`destructive`、`border`）和语义字号，不引入新颜色。

## 6. 兼容性与回滚

- **IPC 签名不变**：只新增错误码。旧前端遇到未知码时回退显示 message。
- **CLI**：`cli_api` 使用同一套错误映射，422 场景的输出会从 transport 变为 branch_not_found，属于修正。实现时用 `cli_api` 测试确认。
- **Operation Log**：只新增 `github_import` 类的 preview 失败行，数据库 schema 不变（`details_json` 只多两个可选键）。不需要执行 `docs:gen` 中的 schema 部分，但 command 策略矩阵会发生变化，因此仍然要执行 `pnpm docs:gen`。
- **回滚**：分为三个可以独立 revert 的提交：错误分类、Operation Log 生命周期、前端 UI。

## 7. 风险

- `FailureOnly` 是新的生命周期，observability gate 需要接受它，不能误判为"缺少 success 记录"。实现时先读 gate 测试，再扩展。
- Remote（SSH/WSL）preview 的阶段划分与 local 不同（会远程下载并做清单校验），需要单独打标并测试。
- 视觉验收依赖 Tauri 桌面运行，浏览器模式下向导只显示 desktop-only 状态。如果无法运行原生环境，截图证据标记为 UNVERIFIED。

## 8. 实施偏差记录（2026-10-20）

- `HttpStatus` 最终签名为 `{ message: String, status: u16 }`，没有采用 `context: &'static str`。原因是 `failure_prefix` 在部分调用点是动态的 `&str`，而且 `domain-error-enums.md` 要求 Display 文本逐字保留。`message` 只出现在内部 Display 中，IPC 和日志仍然只走 code / category / status。
- 422 并不是在 `resolve_commit_sha` 的状态检查里被包成 `Http` 的，而是在通用请求函数 `send_github_request_with_endpoints`（`raw_http.rs`）中被包装。因此在通用函数里保留状态码，`resolve_commit_sha` 再通过 `branch_not_found_from_commit_status` 对 `.await` 的错误和后续的状态分支统一转换。
- 旧入口 `preview_github_repo_import_with_branch_and_auth` 和 `preview_github_repo_import_remote_with_auth` 已删除，因为只剩 command 层在用，而 command 层已改用 staged 入口。`preview_github_repo_import_with_auth` 改为直接调用 staged 入口。
- 前端标题和动作文案的 i18n key 由 `marketplace.githubImportError.*` 改为 `marketplace.githubPreviewError.*`，避免和已有的字符串 key `marketplace.githubImportError` 冲突。
- Header 不再接收输入块所需的 props。输入块由 `GitHubRepoImportWizard.tsx` 在 body 中渲染，渲染条件 `showUrlInput` 与原 header 的条件一致。
