# UI 审查：GitHub repo import 向导输入步（Repo URL）

依据：用户截图（2026-10-20，从 Central Skills 打开）+ 源码。

## 尺寸与布局

| # | 问题 | 证据 |
| --- | --- | --- |
| U1 | URL 输入框被挤窄，长 URL 被截断（截图只显示 `https://github.com/alchainc`） | 输入步弹窗为 `!w-[min(92vw,48rem)]`（`githubImportWizardViewModel.ts:212`）；一行三列 `sm:grid-cols-[minmax(0,1fr)_minmax(14rem,auto)_auto]`（`GitHubRepoImportWizardInput.tsx:78`），分支列至少 14rem，加上按钮，URL 列只剩约 240px |
| U2 | 输入框与分支分段控件高度不一致，底边没有对齐；Preview 按钮靠 `sm:mt-7` 硬编码对齐 | `GitHubRepoImportWizardInput.tsx:78-170`：`Input` 默认高度，分段控件是 `p-1` 加 `min-h-8` 按钮；`Button className="sm:mt-7"` |
| U3 | 输入步底部有一条空白带：header 带 `border-b`，下面是空的 body（`px-6 py-4`） | `GitHubRepoImportWizard.tsx` 的 body 容器在 `!preview` 且非 result 时渲染为空；整个输入表单放在 header（`GitHubRepoImportWizardChrome.tsx:86-200`）里，而不在 body 里 |
| U4 | 分支提示文案位于整行下方，离分支控件较远，和"只读预览"提示叠成两行灰字，层级不清 | `GitHubRepoImportWizardInput.tsx:172-186` |

## 头部与徽章

| # | 问题 | 证据 |
| --- | --- | --- |
| B1 | 描述"Launch the shared GitHub repo import wizard from Central Skills."与右侧徽章"From Central Skills"重复表达来源，而且"shared wizard"是实现层用语 | `en.json:2996-2997`；`GitHubRepoImportWizardChrome.tsx:97-108` |
| B2 | 来源徽章与标题不在同一基线：标题和描述换行后，徽章垂直居中于两行之间，并且贴近关闭按钮（只靠 `pr-10` 留白） | `GitHubRepoImportWizardChrome.tsx:91-109` |
| B3 | 步骤条的胶囊带 `shadow-sm` 和边框，看起来像可点击按钮，但并不可交互；未激活步骤的序号是 `bg-background` 加 muted 文字，在暗色主题下对比度偏低；连接线 `flex-1` 被拉得很长，视觉重心分散 | `GitHubRepoImportWizardChrome.tsx:113-165` |
| B4 | 分支选项只有 `main / dev / custom`，没有"仓库默认分支"；选中态用勾号加 `bg-primary/15`，未选中态用空占位，整体可以接受 | `GitHubRepoImportWizardInput.tsx:32-37, 108-135` |
| B5 | 预览工具栏的"重新预览"回退为 `branch \|\| "main"`，同样硬编码 `main` | `GitHubRepoImportWizardChrome.tsx:180` |

## 报错呈现

| # | 问题 | 证据 |
| --- | --- | --- |
| E1 | 错误框只有一句话：没有标题，也没有可执行的下一步（例如"改用默认分支"或"重试"） | `GitHubRepoImportWizardInput.tsx:187-214` |
| E2 | 错误文案只由 code 决定；`transport_failed` 一律提示"检查网络"，即使实际是 HTTP 4xx | `src/lib/ipc/errors.ts:145`；i18n `github_import.transport_failed` |
| E3 | 前端错误状态只保存 `code:message` 字符串，没有 operation ID，用户无法把界面上的错误和日志行对应起来 | `backendErrorStateValue`（`src/lib/backendError.ts:51`）；`IpcInvokeError` 不携带 operation ID |

## 日志

| # | 问题 | 证据 |
| --- | --- | --- |
| L1 | Preview 失败的运行日志只有 `category="runtime" phase="command" code=...`，看不出是哪一步（仓库信息、commit 解析、tree、raw、archive）失败，也看不到 HTTP 状态类别 | `skillport-2026-10-20.log:12-15`；`commands/github_import.rs:63-110` 直接 `map_err(to_ipc_error)`，没有经过 `ReviewedFailure` |
| L2 | `GithubImportError::Http(String)` 的 Display 文本带有 `HTTP 422` 等信息，但出于脱敏只记录 code，状态信息因此丢失 | `error.rs:552-563`、`source.rs:45`、`snapshot.rs:45` |
| L3 | Preview 的日志策略是 `RuntimeOnly(Preview)`，不写 Operation Log。这是有意的设计，并有测试固定 | `ipc_registry.rs:490` |
| L4 | 同一个 code 的 import 失败日志是 `category="import" phase="network"`，preview 却是 `runtime/command`，两者不一致 | 同一份日志的第 6 行与第 12 行 |
