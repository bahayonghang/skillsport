# Design — Central 便携包 v2

Status: planning. 子任务实现时以本文为共享契约；如需偏离，先回到本文修订。

## 1. 架构概览

```text
渲染进程 (React)                         Tauri commands (thin)               services/portable_bundle (deep module)
┌───────────────────────┐   summary   ┌──────────────────────────┐        ┌─────────────────────────────────────┐
│ PortabilityDialog     │────────────▶│ get_..._export_summary   │──────▶│ summary.rs   (DB only)              │
│  Export card          │   export    │ export_portable_bundle   │──────▶│ export.rs    collect → writer.rs    │
│  Import stepper       │   preview   │ preview_..._import       │──────▶│ reader.rs → inspect.rs → classify.rs│
│  (store: portability  │   apply     │ apply_..._import         │──────▶│ apply.rs (content + metadata merge) │
│   slice)              │   cancel    │ cancel_portable_..._job  │        │ preview_cache.rs (token → inventory)│
└───────────────────────┘             └──────────────────────────┘        └──────────────┬──────────────────────┘
                                                                                         │ reuse
                         CentralFs (Local/SSH/WSL) · journaled content upsert · Central mutation lock
                         local_archive_import::inventory 安全矩阵 · ResourceBudget · ExclusiveJobRegistry
```

原则：

- 渲染进程只传 **路径、jobId、previewToken、决策**；不传清单 JSON，不接触文件内容（遵守
  `.trellis/spec/frontend/renderer-authority-boundary.md`）。
- 新建 `src-tauri/src/services/portable_bundle/`，与旧 `portable_state/` 并存，直到 UI 子任务切换完成后删除旧模块。
- 预览与导出摘要零写入、零网络。

## 2. 包格式 v2

文件扩展名 `.skillport`（ZIP，deflate）；导入同时接受 `.zip`。

```text
<bundle>.skillport
├── manifest.json                 # 必须是第一个条目，UTF-8 无 BOM
└── skills/
    └── <skill-id>/…              # 该 skill 的 Central 目录原样内容（相对路径，正斜杠）
```

`manifest.json`（camelCase）：

```jsonc
{
  "kind": "skillport/bundle",
  "formatVersion": 2,
  "createdAt": "2026-10-28T12:00:00Z",
  "app": { "name": "SkillPort", "version": "1.1.0" },
  "origin": { "targetKind": "ssh" },                            // 只记录类型；标签可能就是主机名，不导出
  "registries": [ { "name": "anthropics/skills", "url": "https://github.com/anthropics/skills", "sourceType": "github", "isEnabled": true } ],
  "tagGroups":  [ { "key": "g1", "name": "Writing", "color": "#aabbcc", "sortOrder": 0 } ],
  "tags":       [ { "key": "t1", "name": "docs", "description": null, "color": null, "groupKey": "g1" } ],
  "savedViews": [ { "name": "Pinned docs", "query": "{…CentralViewState JSON…}", "sortOrder": 0, "icon": null, "pinned": true } ],
  "skills": [
    {
      "id": "docx",
      "name": "docx",
      "description": "…",
      "payloadDir": "skills/docx",
      "contentDigest": "<与 CentralFs::hash_directories 相同算法的十六进制摘要>",
      "files": [ { "path": "SKILL.md", "size": 1234, "sha256": "…" } ],
      "provenance": {
        "type": "github",                       // "github" | "unknown"
        "owner": "anthropics", "repo": "skills",
        "branch": "main",                       // 未知时为 null（不再硬编码 "main"）
        "sourcePath": "skills/docx",            // 统一为 import_source_path 规范形式（根目录为 "."）
        "commitSha": "…" | null
      },
      "tagKeys": ["t1"]
    }
  ]
}
```

规则：

- 不包含 `uid`、`skill_registries.id`、tag/group 的数据库 id、etag、sync 时间戳、绝对路径、凭据。
- 自然键：skill = `id`；tag = `name`；tagGroup = `name`；savedView = `name`；registry = `normalize_registry_identity(url)`。
- `key` 只用于 manifest 内部引用，导入时映射到目标端 id。
- `contentDigest` 必须与目标端用 `CentralFs::hash_directories` 算出的结果可比较 —— 这是"内容相同自动跳过"的唯一依据。
  实现前先确认该算法覆盖文件路径、文件内容和可执行位，并忽略平台差异（CRLF 不做归一化，按字节计算）。
- 版本策略：`formatVersion` 大于支持的值 → `portable_bundle.unsupported_version`；`kind` 为 `skillport/state-export` →
  `portable_bundle.legacy_v1`（专用提示：请在源端升级后重新导出）。

## 3. 预算

新增 `ResourceBudget::portable_bundle()`：

| 项 | 值 | 说明 |
| --- | --- | --- |
| archive_bytes | 1 GiB | 包文件大小 |
| archive_expanded_bytes | 2 GiB | 解压后总量 |
| archive_files | 100 000 | 条目数 |
| archive_entry_bytes | 64 MiB | 单文件 |
| manifest_bytes | 32 MiB | manifest.json 单独上限 |
| 压缩比上限 | 复用 local_archive_import 的 zip-bomb 比例阈值 | |

导出同样受此预算约束；超过时 `portable_bundle.budget_exceeded`，并带上超限的维度（不带路径）。

## 4. 导出管线（child: core）

1. `summary.rs::export_summary(pool, target)`：只查 DB —— skill 数、有来源归属的数量、tag/group/view/registry 数。
   不预先估算体积（远程目标代价太高），实际体积在导出完成后显示。
2. `export.rs::export_bundle(pool, fs: &CentralFs, target, path, cancel, progress)`：
   - 读取 Central skills、仓库归属（`get_skill_repository_assignments_for_skills`）、tags/links、tag groups、
     saved views、registries（全部 registries，不再只取被 skill 引用的）。
   - 对每个 skill 调用新增的 `CentralFs::read_skill_tree(dir, budget)`：
     - Local：`walkdir`（不跟随符号链接；遇到符号链接 → 该 skill 记入 `skippedSkills` 并说明原因）。
     - SSH/WSL：在远端执行 `tar -cf - -C <dir> . | base64`（或复用已有的 exec 字节通道），本地解码后再走同一套安全检查；
       如果远端缺少 `tar`/`base64`，返回 `portable_bundle.remote_tool_missing`。
     - 计算每个文件的 sha256 和 `contentDigest`。
   - `writer.rs` 流式写入同目录临时文件（`tempfile::Builder` + `zip::ZipWriter`），先写 manifest 再写 payload；
     `sync_all` 后原子 `persist`。全程 `run_blocking_fs_with`，并在每个 skill 之间检查取消。
   - 以 skill 为粒度发进度事件（节流：≥100 ms 或每 1%）。
3. 读不到的 skill（权限、符号链接、超限）不让整个导出失败：写入 manifest 的 `skippedSkills: [{id, reason}]`，
   并在结果中返回计数。

## 5. 导入预览（child: import）

1. `reader.rs`：有界读取文件字节 → 计算指纹（sha256 + 长度）→ 复用 `local_archive_import::inventory::build_inventory`
   的安全矩阵（必要时将其泛化为接收 `ResourceBudget` 的形式）。
2. 解析 `manifest.json`：
   - 先嗅探编码：UTF-16 BOM → `portable_bundle.manifest_encoding`；UTF-8 BOM 剥除后继续。
   - 输入是裸 `.json` 时：若能解析出 `kind == "skillport/state-export"` → `legacy_v1`；否则 → `not_a_bundle`。
   - 用 `serde_path_to_error`（新依赖，需同步更新依赖清单检查）给出字段路径；外加行/列，返回
     `portable_bundle.manifest_invalid`，`detail` 仅含字段路径和行列。
   - 语义校验：id 合法（复用 `sanitize_skill_id` 规则）、id 唯一、`payloadDir` 与 inventory 一致、`tagKeys`/`groupKey`
     引用存在、files 列表与实际条目一一对应且 sha256 匹配。单个 skill 不合格 → 该 skill 标 `invalid`，不影响其他。
3. `classify.rs`：对目标端（`CentralFs` + DB）：
   - 批量查询同 id 的 skill；对存在的 Central skill 调用 `CentralFs::hash_directories` 一次性批量算摘要。
   - `new` / `identical` / `changed` / `exists_unmanaged` / `invalid`。
   - 元数据按自然键统计 `add` / `exists` / `update`（tag 颜色/描述不同 → update；视图 query 不同 → update）。
4. `preview_cache.rs`：`previewToken`（随机 128 位）→ `{ path, fingerprint, parsed manifest, inventory, target_id, created_at }`，
   存放在 `AppState` 中，TTL 30 分钟，每个窗口最多保留 1 个，目标切换或对话框关闭（`discard`）时清除。缓存中不保存文件内容。

## 6. 导入执行（child: import）

1. 按 token 取缓存 → 校验 `target_id` 仍是活动目标 → 重新有界读取文件并比较指纹（不一致 → `preview_stale`）。
2. 决策解析：`identical` 默认 skip；`changed`/`exists_unmanaged` 必须有显式决策（缺失 → `decision_required`）；
   `rename` 校验新 id 合法且不冲突。
3. 内容写入：将 `journaled_central_content_upsert` 泛化为接收内容来源枚举：

   ```rust
   pub(crate) enum CentralContentSource<'a> {
       GitHub { repo: GitHubRepoRef, candidate: RemoteSkillCandidate, snapshot: &'a GitHubRepoSnapshot,
                resolved_commit_sha: Option<String>, content_digest: Option<String> },
       Bundle { files: Vec<BundleFile<'a>>, provenance: Option<BundleGithubProvenance> },
   }
   ```

   这样 bundle 路径直接复用：目标锁、pending-operation 恢复、日志式 stage/swap、DB/来源事务、回滚，以及 Local/SSH/WSL 三种目标。
   `uid`：覆盖时保留目标端原值，新建时本地生成。
   `exists_unmanaged` 覆盖 = 走 `ensure_centralized` 语义把它纳入 Central（具体以 central-mutation 现有路径为准，实现前确认）。
4. 来源归属：`provenance.type == "github"` → 写入或复用 `skill_repositories` 并建立 member（branch 为 null 时留空，交给更新中心
   在下次检查时解析默认分支）；否则分配到 unknown 仓库（与 local archive 导入的语义一致）。
5. 元数据合并（单个 DB 事务，在内容写入之后）：registries → tagGroups → tags → skill↔tag 链接（只对本次实际导入/覆盖
   以及 identical 的 skill 建立，`source = 'import'`）→ savedViews。重复导入幂等。
6. 并发：内容写入批量交给 `update_skills_batch_with_progress`（它已负责批处理与锁）；每批之间检查取消。
7. 结果：`{ imported[], overwritten[], skipped[], failed[{id, code}], metadata: {added, updated, unchanged} }`；
   前端可以用失败项构造新的决策，用同一个 token 重试。

## 7. IPC 契约

新增命令（全部登记在 `ipc_registry.rs`，参数用 camelCase）：

| 命令 | 输入 | 输出 | 策略 |
| --- | --- | --- | --- |
| `get_portable_bundle_export_summary` | — | `PortableBundleExportSummary` | `runtime_only(Preview)` |
| `export_portable_bundle` | `{ jobId, path }` | `PortableBundleExportResult` | `operation(PortableState, Filesystem, StartedThenTerminal)` |
| `preview_portable_bundle_import` | `{ jobId, path }` | `PortableBundleImportPreview`（含 `previewToken`） | `operation(PortableState, Preview…)` —— 失败也要记日志 |
| `apply_portable_bundle_import` | `{ jobId, previewToken, decisions[] }` | `PortableBundleImportResult` | `operation(PortableState, Filesystem, StartedThenTerminal)` |
| `discard_portable_bundle_preview` | `{ previewToken }` | `()` | `runtime_only` |
| `cancel_portable_bundle_job` | `{ jobId }` | `()` | `operation(PortableState, Job, TerminalOnly)` |

进度事件：`central://portable-bundle-progress`，载荷 `{ jobId, phase, status, total, completed, currentItem?, message? }`，
其中 `phase ∈ export | read | inspect | classify | apply | metadata`。

错误码（领域枚举 `PortableBundleError` + `to_ipc_error()`，遵守 `domain-error-enums.md` 与 `redaction-policy.md`）：

`portable_bundle.not_a_bundle`、`legacy_v1`、`unsupported_version`、`manifest_missing`、`manifest_encoding`、
`manifest_invalid`、`integrity_mismatch`、`unsafe_entry`、`budget_exceeded`、`preview_stale`、`preview_expired`、
`target_changed`、`decision_required`、`rename_invalid`、`remote_tool_missing`、`io`、加上已有的 `operation.cancelled`。
全部加入 `REVIEWED_IPC_ERROR_CODES`，并在 `src/i18n/` 中提供 en/zh 文案。
（core 实现时确认：`IpcError` 信封没有 `detail` 字段，本任务不改全局信封；字段路径、行列等细节只进运行时日志。
core 还新增了 `portable_bundle.invalid_path`、`portable_bundle.target_io`、`portable_bundle.internal`。）

删除（UI 子任务）：`export_skillport_state`、`save_skillport_state_export`、`preview_skillport_state_import`、
`preview_skillport_state_import_file`、`import_skillport_state`、`cancel_skillport_state_portability` 及对应类型与旧事件名。

## 8. 前端

- 新增 `src/stores/centralSkillsStore.portabilitySlice.ts`（从 `updateSlice.ts` 拆出），并新增 `src/types/portableBundle.ts`。
- 作业状态合并加入**终态保护**：某个 jobId 已经 completed/failed/cancelled 后，迟到的 running 事件一律忽略
  （修复 RC7 中的竞态）。参照 `.trellis/spec/frontend/job-correlation-cancellation.md`。
- 对话框 `CentralStatePortabilityDialog.tsx` 重写为两个视图：
  - **导出**：摘要卡（skill 数 / 有来源归属的数量 / 标签 / 分组 / 视图 / 来源）→"导出到文件…"（原生保存对话框，默认文件名
    `skillport-<target>-<date>.skillport`）→ 进度 → 完成卡（大小、被跳过的项、"在文件夹中显示"）。
  - **导入**：步骤条 `选择文件 → 预览 → 处理冲突 → 导入 → 结果`。
    - 选择文件：按钮 + 拖放区域；只接受 `.skillport` / `.zip`。
    - 预览：分类计数 chip（新增/相同/变更/未托管/无效）+ 元数据统计 + 来源目标标签（来自 `origin`）。
    - 冲突：可按分类筛选的虚拟化列表（skill 数可能上千）、批量"全部覆盖/全部跳过"、单条 skip/overwrite/rename。
    - 结果：成功/跳过/失败明细，"仅重试失败项"。
  - 删除：JSON 文本框、Raw/Pretty 切换、粘贴预览、打开即导出。
- 视觉遵守 `glass-surfaces.md`；所有文案进入 `src/i18n/`；错误展示复用 `formatBackendError`。

## 9. 兼容与回滚

- 数据库无 schema 变更（若泛化后的 content upsert 需要新列，必须遵守 `database-migrations.md` 并运行 `pnpm docs:gen`）。
- 子任务 core / import 只新增命令，不删旧命令，因此每个子任务完成时都能独立通过 `just ci`。UI 子任务一次性完成切换与删除；
  回滚 = revert UI 子任务的提交。
- 升级到新版本后，旧版 v1 JSON 无法导入；发布说明中需写明"请两端都升级后再导出"。

## 10. 风险与待确认

| 风险 | 处理 |
| --- | --- |
| 远端没有 `tar`/`base64`（极简容器、Windows SSH） | 实现前确认现有 exec 是否已有字节通道；没有的话以逐文件 `read_file_bounded` 作为回退 |
| `hash_directories` 的算法与导出摘要不一致 | core 子任务以同一函数计算 `contentDigest`，并用 Local/SSH 往返测试锁定 |
| 泛化 content upsert 影响更新中心 | 先加 `Bundle` 变体而不改 GitHub 分支的行为；更新中心的回归测试必须全部通过 |
| 包体积大（含二进制资源的 skill） | 1 GiB 预算 + 流式写入；导出完成卡显示体积 |
| `exists_unmanaged` 覆盖的语义 | 以 central-mutation / `ensure_centralized` 的现有行为为准，import 子任务开始前写进其 design 附注 |
