# 根因调查：Preview 报 "GitHub could not be reached"

调查日期：2026-10-20。现场：GitHub repo import 向导，URL `https://github.com/alchainc…`（截图中被截断），分支选择保持默认 `main`，点击 Preview import。

## 现场证据

- Runtime Log `~/.skillsmanage/logs/skillport-2026-10-20.log`：
  - `11:45:22Z` 与 `11:46:10Z` 两次 `preview_github_repo_import` 失败，`code="github_import.transport_failed" retryable=true`，`duration_ms` 分别为 1031 和 986。
  - 约 1 秒即失败，排除 `GITHUB_CONNECT_TIMEOUT` / 请求超时；同时与真实断网（连接被拒或 DNS 失败）也不太吻合，更像收到了一个 HTTP 响应。
- Operation Log（`~/.skillsmanage/db.sqlite`，`operation_logs` 表）里没有这两次 preview 的记录，失败的 preview 不落 Operation Log，无法拿到静态 `errorCategory`。
- 本机网络：FlClash TUN（fake-ip `198.18.x`），系统代理关闭，无代理环境变量。`curl` 访问 `api.github.com`、`codeload.github.com` 和 `raw.githubusercontent.com` 均为 200，建连约 30–40 ms。网络不是根因。

## 代码路径

1. 前端 `src/components/marketplace/GitHubRepoImportWizardInput.tsx:32-75`：分支只有 `main | dev | custom` 三种模式，初始默认 `main`，`handlePreviewClick` 始终把 `effectiveBranch`（默认 `"main"`）显式提交。没有"使用仓库默认分支"这一选项。
2. 后端 `src-tauri/src/services/github_import/source.rs:10-75` `resolve_repo_source_with_branch`：先请求 `/repos/{owner}/{repo}` 读取 `default_branch`，再执行 `selected_branch.unwrap_or(branch)`。也就是说，前端显式传来的 `main` 会覆盖仓库真实的默认分支。
3. 后端 `src-tauri/src/services/github_import/snapshot.rs:12-63` `resolve_commit_sha`：请求 `/repos/{owner}/{repo}/commits/{branch}`。只有 404 会映射为 `RepoNotFound`；其它非 2xx 状态，在 `classify_github_denial_response` 不认领时，统一变成 `GithubImportError::Http("…: HTTP {status}")`。
4. `src-tauri/src/services/github_import/error.rs:400-405` `ipc_error_code`：`Self::Http(_)` 映射为 `github_import.transport_failed`。
5. 前端 `src/lib/ipc/errors.ts:145` 和 i18n `github_import.transport_failed` 最终显示为"GitHub could not be reached. Check the network connection…"。

## 关键事实：GitHub 对不存在的分支返回 422，而非 404

```
GET https://api.github.com/repos/torvalds/linux/commits/main    -> 422 {"message":"No commit found for SHA: main"}
GET https://api.github.com/repos/torvalds/linux/commits/master  -> 200
GET https://api.github.com/repos/anthropics/skills/commits/dev  -> 422
```

`alchaincyf` 账号下大量 skill 仓库的默认分支是 `master`，例如 `huashu-design`、`huashu-skills`、`darwin-skill`、`karpathy-skill`、`freud-skill`、`ilya-sutskever-skill`，与截图中的 URL 前缀吻合。

## 结论

完整因果链：仓库默认分支是 `master` → 向导默认显式提交 `main` → 后端用 `main` 覆盖 `default_branch` → `commits/main` 返回 422 → 被包成 `Http` → `transport_failed` → UI 提示"无法连接 GitHub"。

这里有两个独立缺陷叠加：

- **A. 分支默认值错误**：UI 默认强制使用 `main`，后端因此不再使用仓库的 `default_branch`。
- **B. 错误分类错误**：非网络类的确定性 HTTP 状态（这里是 422 分支不存在；还有其它非特殊 4xx）被归为 `transport_failed`，而且 `retryable=true`，误导用户去排查网络。

## 未验证项

- 截图中 URL 被截断，具体仓库名未确认。上面的因果链靠代码路径、1 秒耗时和 422 复现推断得出，没有在应用内直接复现。复现方式：对任一默认分支为 `master` 的仓库保持 `main` 执行 Preview。
- 失败的 preview 不落 Operation Log，属于可观测性缺口，是否在本任务内补齐另行决定。
