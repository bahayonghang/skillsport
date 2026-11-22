# Design：Central 一键清理（跨层契约）

本文件是前后端子任务共享的契约来源。层内细节分别见
`11-02-central-clear-backend/design.md` 与 `11-02-central-clear-frontend/design.md`。

## 1. 复用与新增边界

| 能力 | 复用 | 说明 |
| --- | --- | --- |
| 单 skill 中央目录 + 安装删除（含 journal、备份重命名、DB 级联） | `delete_central_skills_under_guard` | 不另写删除路径；遵守 `fs-db-operation-journal.md`、`skill-deletion-integrity.md` |
| 互斥 | `acquire_target_mutation_guard` | apply 只取一次锁，内部 helper 不再取锁 |
| 未完成日志恢复 | `recover_pending_delete_operation_with_transport` / `recover_pending_update_operation` | 本功能对**目标内全部** pending 行执行恢复，而不仅是选中 skill |
| 链接探测/删除 | `directory_link::{is_reparse_or_symlink, inspect_link_kind_and_target, remove_directory_link_slot}` | 支持 Windows junction 与 symlink；只删链接本身，不跟随 |
| 路径判断 | `paths::{paths_equivalent, canonicalize_path_with_missing}` | 需要新增 `path_is_within(root, child)`，放在 `paths.rs`（Path Policy 单点） |
| 清空后的 inventory 处理 | `clear_all_skill_update_inventory` + `clear_pending_additions` | 与 unknown-source reset 一致：任一成功即清 |
| 进度 / 取消 | Exclusive Job Lifecycle | 新增 `central_clear` 作业族 |
| 前端确认对话框 | 新组件（不复用 `BatchDeleteCentralSkillsDialog`） | 后者面向逐 skill 列表，千级数据不适合；新对话框按 Agent 聚合展示 |

新增模块（后端）：

- `src-tauri/src/services/central_skills/clear_all/`（`mod.rs` 编排、`sweep.rs` 孤儿扫描、`remote.rs` 远端脚本、`types.rs`）
- `src-tauri/src/commands/skills.rs` 增加三个命令壳（或拆到 `commands/central_clear.rs`，以文件行数为准）

## 2. 清理对象分类

| 类别 | 来源 | 识别规则 | 删除方式 |
| --- | --- | --- | --- |
| `skills` | `skills.is_central = 1` | SQL 全量 | 复用 journaled 批量删除；symlink 安装自动删，copy 按 `removeCopyAgentIds` |
| `projectLinks` | `project_skill_installations` 中 `link_type = 'symlink'` 且目标位于可归属中央根 | SQL + lstat 复核 | 删链接 + 删 psi 行 |
| `untrackedCentralEntries` | 中央根下一层目录，不在 DB `skills` 中 | read_dir；跳过 `.skillport-*` 及隐藏项 | 先删指向它的链接，再 `remove_dir_all`（`ensure_child_path` 守卫） |
| `orphanLinks` | 所有 Agent 全局目录 + 已登记项目 × Agent 项目目录 | 条目是 junction/symlink，且原始目标（允许悬空）位于可归属中央根 | `remove_directory_link_slot` |
| `skippedUnmanaged` | 同上目录中的普通目录且无 DB 记录 | — | 不删，只计数 |

**可归属中央根**（attributable roots）= 当前中央根 ∪ 默认中央根 `~/.skillsmanage/skills`（远端为
`remote_central_skills_root(home)`）。比较前统一做 `canonicalize_path_with_missing` + Windows 大小写不敏感 +
去除 `\\?\` 前缀。链接目标为相对路径时按链接父目录解析（`resolved_symlink_target`）。

**扫描目录集合**：`agents` 表全部行（含禁用、未检测、自定义），排除 `id = 'central'` 和与中央根等价的目录；
加上每个已登记项目 × 每个有 `project_skills_dir` 的 Agent。按规范化路径去重（Universal 等共享根只扫一次）。
目录不存在视为空，不报错；不可读记入 `sweepWarnings`。

## 3. IPC 契约

所有命令先 `resolve_target_context()` 一次，只作用于当前目标的 pool 与中央根。

```text
preview_clear_central_skills()
  -> ClearCentralPreview

clear_central_skills({ jobId, request: ClearCentralRequest })
  -> ClearCentralResult

cancel_central_clear({ jobId })
  -> boolean
```

```ts
type ClearCentralPreview = {
  previewId: string;                 // 仅用于关联日志/事件，不作授权凭据
  targetKind: "local" | "ssh" | "wsl";
  centralRoot: string;
  skillIds: string[];                // 可删除的中央 skill（已通过逐项预览）
  skillPreviewFailed: FailedCentralSkillDelete[];
  agentSummaries: Array<{
    agentId: string;
    linkCount: number;               // DB 登记的 symlink/native，会自动删除
    copyCount: number;               // DB 登记的 copy，默认保留
    orphanLinkCount: number;
  }>;
  projectLinks: ClearCentralPathItem[];
  orphanLinks: ClearCentralPathItem[];
  untrackedCentralEntries: ClearCentralPathItem[];
  projectLinkCount: number;          // 截断时仍准确的总数（实现新增）
  orphanLinkCount: number;
  untrackedCentralEntryCount: number;
  skippedUnmanagedCount: number;
  pendingRecoveryCount: number;
  sweepWarnings: Array<{ path: string; code: string }>;
  truncated: boolean;                // 路径列表超过上限时为 true，计数仍准确
};

type ClearCentralPathItem = {
  key: string;                       // 规范化路径（Windows 小写），apply 时用于求交集
  path: string;
  ownerKind: "agent" | "project" | "central";
  ownerId: string;                   // agentId / projectId / "central"
  skillName: string | null;
  dangling: boolean;
};

type ClearCentralRequest = {
  previewId: string;
  skillIds: string[];
  removeCopyAgentIds: string[];
  projectLinkKeys: string[];
  orphanLinkKeys: string[];
  untrackedEntryKeys: string[];
};

type ClearCentralResult = {
  skills: BatchDeleteCentralSkillResult;
  projectLinks: ClearCentralPathOutcome;
  orphanLinks: ClearCentralPathOutcome;
  untrackedCentralEntries: ClearCentralPathOutcome;
  recovery: { recovered: number; failed: number };
  skippedChanged: number;            // 预览后状态已变化而被跳过的条目数
  cancelled: boolean;
};

type ClearCentralPathOutcome = {
  removed: number;
  failed: Array<{ key: string; path: string; errorCode: string }>;
};
```

路径列表上限：每类最多返回 2000 条，超出时 `truncated = true`，计数仍准确，前端提示"仅显示部分"。
apply 时后端以**锁内重新扫描的结果**为准，与请求 key 求交集。截断时前端对该类别传 `["*"]`，表示
"该类别中重新扫描后仍成立的全部条目"。`"*"` 是唯一允许的通配值，其它值一律精确匹配。`skillIds`
不支持通配，必须是预览返回的 id。

## 4. 进度事件

```text
event: central://clear-progress
payload: {
  jobId: string;
  phase: "recovery" | "projectLinks" | "skills" | "untracked" | "orphanLinks" | "finalize";
  status: "started" | "running" | "completed" | "cancelled" | "failed";
  completed: number;   // 全局累计
  total: number;       // 全局总数（apply 开始时重算）
}
```

- 事件按 ≥100ms 或每 25 项节流，阶段切换和终态必发。
- 取消只在条目边界检查；已 `db_committed` 的 skill 不回滚；结果 `cancelled = true`。

## 5. Apply 执行顺序（锁内）

1. 取作业租约 → 取 `acquire_target_mutation_guard`（一次）→ 远端目标建立一次连接复用。
2. **recovery**：恢复该目标所有 pending `fs_db_operations`；失败的 skill 进入 `skills.failed`（phase=`recovery`）。
3. 重新计算候选：中央 skills、psi 链接、孤儿扫描、未登记中央条目；与请求求交集，差集计入 `skippedChanged`。
4. **projectLinks**：lstat 复核仍是链接且目标仍可归属 → 删链接 → 批量删 psi 行（单事务）。
5. **skills**：调用 `delete_central_skills_under_guard`（同一 `batch_id`），逐项发进度、检查取消。
6. **untracked**：先删指向该条目的链接（已在孤儿集合中的跳过重复），再删目录。
7. **orphanLinks**：按目录分组并行（上限 `scan_parallelism_limit()`），每项删除前重新 observe。
8. **finalize**：任一成功则清 update inventory 与 pending additions；写操作日志 `central.clear_all`（只含计数和目标类型）。

步骤 4 先于 5：保证中央目录删除时不存在已知的项目链接指向它；步骤 7 最后：覆盖 5、6 之后新出现的悬空链接
（只在本次扫描集合内，不额外扫描）。

## 6. 错误码

| 情形 | 码 |
| --- | --- |
| 外层失败 | `central.clear_failed` |
| 互斥锁忙/超时 | `central_skills.mutation_lock_failed` |
| 同族作业进行中 | `job.central_clear_busy` |
| 单项：链接已不是链接 / 目标已变 | 计入 `skippedChanged`，不算失败 |
| 单项：删除 IO 失败（占用、权限） | `central_clear.remove_failed` |
| 单项：路径越界（不在可归属根/扫描目录内） | `central_clear.path_outside_scope` |
| 单项 skill 失败 | 沿用 `FailedCentralSkillDelete.error_code` |

## 7. 性能策略

- **预览不取锁**，SQL 全部批量：中央 skills 1 次、`get_skill_installations_for_skills` 分块、agents 1 次、
  projects + psi 1 次；不对每个 skill 单独调用 `preview_delete_central_skill_impl`（它每项 4 次查询）。
  新增批量预览函数，结果形状与现有逐项预览一致。
- **扫描只做一层**：每个目录 `read_dir` + `symlink_metadata` + 读取链接目标；不解析 `SKILL.md`、不递归、
  不 canonicalize 链接目标（只规范化字符串前缀比较）。按目录并行，`spawn_blocking`，并发上限 8。
- **远端**：一次脚本完成所有目录的探测（`[ -L ]` + `readlink`），一次脚本完成批量 `rm`（逐行回报状态）。
- **apply**：skills 阶段沿用逐项 journal（崩溃安全优先）；每项 IO 是同卷 rename + 删除备份。若性能测试显示
  1000 项超过 60s，再在后端子任务中把 finalize（删除备份目录）改为有界并行，journal 语义不变。
- **前端**：预览按 Agent 聚合展示，路径明细折叠并虚拟化/限高；只在完成后刷新一次。

## 8. 安全约束

- 渲染层传入的 key 只作为过滤条件，不作为删除授权；后端只删除"重新扫描得到 ∩ 请求 key"的条目。
- 只删除：中央根内的子目录、扫描目录内的链接条目。普通目录（非链接）在 Agent/项目目录中永不删除，
  除非它是 DB 登记的 copy 且其 Agent 在 `removeCopyAgentIds` 中。
- 日志与操作记录不写路径；错误消息遵守 Redaction Policy。
- 测试禁止使用真实 `~/.skillsmanage/db.sqlite` 或 `targets/*/db.sqlite`。

## 9. 实现偏差（后端子任务回写）

- 预览新增 `projectLinkCount` / `orphanLinkCount` / `untrackedCentralEntryCount`，列表截断时用于显示准确计数。
- 操作日志的 action 由命令注册表决定，实际为 `clear_central_skills`（category `central`），details 只含计数与
  `scope=central_clear_all`；不再另起 `central.clear_all` 字面量。
- 步骤 6 不在 untracked 阶段预删"指向该条目的链接"：这些链接已在 `orphanLinks` 集合中，由随后的 orphan 阶段删除。
- untracked 条目的越界校验使用"必须是中央根的直接非隐藏子项且不是 DB skill 目录"，比 `ensure_child_path`
  更严格（后者会跟随条目自身的链接）。
- orphan 阶段按 64 项分块顺序删除（每块一个 `spawn_blocking`），块间检查取消与发进度；未做按目录并行。
- 远端探测不跟随链接，远端 orphan 的 `dangling` 恒为 `false`。
- 远端脚本协议（独立检查后修正）：路径与期望目标只作为位置参数传递（`sh -s --`，每批 ≤200），文件系统派生字段
  （条目名、`readlink` 值、解析后的根）一律用 `od -An -tx1 -v` 十六进制编码；记录为 `TAG	<序号>[	<hex>...]`，
  按标签校验字段数，未知标签、越界或非数字序号、非法 hex/UTF-8/NUL、空名/`.`/`..`/含 `/` 的名字全部丢弃。
  名字或链接目标中的换行/制表符无法伪造或拆分记录。
- 远端根身份：目录探测在同一次调用中输出中央根的 `REAL`（`cd -P && pwd -P`）或 `UNRESOLVED`，每次 preview/apply
  各一次。仅当根可解析、且条目名不是该目标任何 DB skill 目录的末级名时，才视为 untracked（覆盖“存储根/名”与
  “解析根/名”两种匹配）。根不可解析时不提供、也不删除任何 untracked 条目，请求中的此类 key 计入 `skippedChanged`。
- 远端链接删除在删除时复核：脚本接收 `(path, expectedTarget)` 对（锁内重扫捕获的原始 `readlink` 值），仅当
  `[ -L ]` 且 `readlink` 仍等于期望值时才 `rm -f`，否则报告 `SKIP` 计入 `skippedChanged`；无捕获目标的链接不删除。
- 单项"路径已不存在"：projectLinks 视为已删除（同时删 psi 行，便于幂等重试）；orphan/untracked 计入 `skippedChanged`。
- `cancel_central_clear` 返回 `boolean`（是否命中活动作业），与 Exclusive Job Lifecycle 一致。
- 修复两个既有缺陷（S1/S3 依赖）：`build_local_delete_manifest` 去重改用 `slot_paths_equivalent`（不跟随末级链接，
  否则链接安装与其中央目标被合并，中央目录不会被删除）；`ensure_child_path` 改用 `canonicalize_path_with_missing`
  （否则 Windows 上中央目录已丢失的 skill 预览失败）。
