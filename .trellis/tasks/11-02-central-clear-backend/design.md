# Design：后端

跨层契约（IPC 形状、事件、错误码、执行顺序）以父任务 `design.md` 为准，这里只写层内结构。

## 1. 模块布局

```text
src-tauri/src/services/central_skills/clear_all/
  mod.rs        // preview_clear_central_skills_impl / clear_central_skills_impl 编排
  types.rs      // ClearCentralPreview / Request / Result / PathItem（serde camelCase + specta）
  candidates.rs // 批量 SQL：中央 skills、安装、agents、projects/psi；批量逐项预览
  sweep.rs      // Local 孤儿扫描（并行 read_dir，一层）
  remote.rs     // SSH/WSL 探测脚本与批量删除脚本（transport seam）
  progress.rs   // 节流进度发射 + 取消检查
  tests.rs / perf_tests.rs
src-tauri/src/commands/central_clear.rs   // 三个 IPC 壳；登记到 ipc_registry.rs
src-tauri/src/paths.rs                    // + path_is_within(root, child) / attributable_central_roots()
```

`central_skills/mod.rs` 只 re-export 公共入口。命令层只做参数转换、作业租约、`run_operation` 观测与错误串化
（遵守 `layer-boundaries.md`）。

## 2. 候选计算（candidates.rs）

```rust
pub(super) struct ClearCandidates {
    pub skills: Vec<db::Skill>,                                  // is_central = 1
    pub installations: HashMap<String, Vec<db::SkillInstallation>>,
    pub agents: Vec<db::Agent>,
    pub project_links: Vec<ProjectLinkCandidate>,                // psi symlink → 可归属中央根
    pub central_root: CentralRoot,                               // Local(PathBuf) | Remote(String)
    pub attributable_roots: Vec<RootKey>,
}
```

- SQL：`SELECT * FROM skills WHERE is_central = 1`；`get_skill_installations_for_skills`（已有，按 500 分块）；
  `get_all_agents`；`projects` + `project_skill_installations` 一次 JOIN 查询。
- **批量逐项预览**：新增 `preview_delete_central_skills_bulk(&ClearCandidates)`，在内存中对每个 skill 做与
  `preview_delete_central_skill_impl` 等价的校验（`skill_delete_dir` + `ensure_child_path`），结果拆成
  `skillIds` 与 `skillPreviewFailed`。不得改变现有逐项函数行为；用一个对照测试保证两者对同一输入结论一致。
- `pendingRecoveryCount` = `list_pending_fs_db_operations(target)` 行数。

## 3. 孤儿扫描（sweep.rs）

输入：扫描目录集合（父 design §2），可归属根集合，DB 已登记路径集合（installations + psi 的
`installed_path` 规范化 key，用来把"DB 已登记的链接"排除出孤儿集合，避免与 skills 阶段重复）。

每个目录（`spawn_blocking`，并发上限 `scan_parallelism_limit()`）：

```text
for entry in read_dir(dir):
  meta = symlink_metadata(entry)            // 不跟随
  if is_reparse_or_symlink(meta):
      raw = inspect_link_kind_and_target(entry)   // 悬空也能读
      if raw 位于任一可归属根 && key ∉ DB 已登记:
          orphan(entry, dangling = !raw.exists())
  elif meta.is_dir() && dir 不是中央根:
      if key ∉ DB 已登记: skipped_unmanaged += 1
```

中央根单独扫描：一层子目录，名称以 `.skillport-` 开头或以 `.` 开头的跳过；不在 DB `skills`
（按 `canonical_path` / `file_path` 父目录规范化 key 比对）的条目进入 `untrackedCentralEntries`。

`read_dir` 失败（权限）→ `sweepWarnings`，不中断其他目录。`NotFound` 静默跳过。

## 4. apply 编排（mod.rs）

```rust
pub async fn clear_central_skills_impl(
    pool: &DbPool,
    target: &ActiveTarget,
    request: &ClearCentralRequest,
    job: &ClearJobHandle,            // cancel flag + progress emitter（测试可注入 recorder）
) -> Result<ClearCentralResult, CentralSkillsError>;
```

1. `acquire_target_mutation_guard(target, "clear Central skills", DEFAULT_CENTRAL_MUTATION_TIMEOUT)`。
2. 远端：`connect_remote_target` 一次，`Arc` 复用给 recovery、skills、远端脚本。
3. recovery：遍历 `list_pending_fs_db_operations(target.id())` 全量，调用现有恢复函数；失败按 skill 记录，
   并把这些 skill 从本次删除集合移除（进入 `skills.failed`，phase=`recovery`）。
4. 重新 `ClearCandidates::load` + sweep；按 key 求交集（支持 `"*"`）；差集计 `skippedChanged`。
5. projectLinks → skills（`delete_central_skills_under_guard`，copy 安装按 `removeCopyAgentIds` 组装
   `BatchDeleteCentralSkillRequest`，同 `reset.rs::reset_delete_requests`）→ untracked → orphanLinks。
6. skills 阶段的取消：把请求切成 25 个一块调用 `delete_central_skills_under_guard`，块之间检查取消标志并发进度。
   这样不改动现有 batch 函数签名。
7. finalize：`succeeded > 0` 时 `clear_all_skill_update_inventory` + `clear_pending_additions`。

单项删除：

- psi 链接：`remove_directory_link_slot`（返回 `Ok(false)` 表示已非链接 → `skippedChanged`）；成功后收集
  `(project_id, skill_id, agent_id)`，阶段末一个事务批量 `DELETE FROM project_skill_installations`。
- 未登记中央条目：先 `ensure_child_path(central_root, entry)`，再 `validate_skill_dir_removal`，再
  `remove_dir_all`（`spawn_blocking`）。
- 孤儿链接：删除前重新 `observe`，仍是链接且原始目标仍可归属 → `remove_directory_link_slot`。

## 5. 远端（remote.rs）

- 探测脚本：参照 `scanner/ssh_batch.rs::build_probe_script` 风格，所有路径 `shell_quote`；对每个目录输出
  `LINK\t<dir>\t<entry>\t<readlink>` / `DIR\t<dir>\t<entry>` / `ROOT_MISS` / `ROOT_UNREADABLE`。
  **不能**沿用 scanner 的 `[ -e "$dir" ] || continue`，否则悬空链接会被跳过。
- 删除脚本：`for p in ...; do if [ -L "$p" ]; then rm -f -- "$p" && printf 'OK\t%s\n' "$p" || printf 'ERR\t%s\n' "$p"; else printf 'SKIP\t%s\n' "$p"; fi; done`；
  按 200 个路径分批，避免命令行过长。
- 未登记中央条目：路径先经 `ensure_remote_child_path`，再 `rm -rf --`，同样分批。
- 远端路径比较使用 `normalize_remote_path` 字符串前缀（`root + "/"`）。

## 6. 作业族与命令

- `AppState` 增加 `central_clear_jobs: ExclusiveJobRegistry`；`clear_central_skills` 在第一个 `.await` 前 acquire。
- `preview_clear_central_skills` 不需要租约。
- 命令层错误映射：锁 → `central_skills.mutation_lock_failed`；租约忙 → `job.central_clear_busy`；其他 → `central.clear_failed`。
- `operation_definition("clear_central_skills")` 登记到观测性目录，记录 `requested`、`succeeded`、`failed`、
  `orphanRemoved`、`cancelled`，不记录路径。

## 7. 测试清单

| 测试 | 场景 |
| --- | --- |
| `clear_all_removes_central_dirs_links_and_rows` | S1 |
| `clear_all_keeps_copy_by_default_and_removes_selected_agents` | S2 |
| `clear_all_tolerates_missing_central_dir` | S3 |
| `clear_all_removes_untracked_central_entry_and_its_links` | S4 |
| `sweep_detects_dangling_junction_into_central_root` | S5（Windows 下用真实 junction；Unix 用 symlink） |
| `sweep_attributes_default_root_after_location_change` | S6 |
| `sweep_ignores_links_outside_central_and_plain_dirs` | S7、S8 |
| `clear_all_handles_agent_dir_equal_to_central_root` | S9 |
| `clear_all_removes_project_links_and_psi_rows` | S10 |
| `clear_all_recovers_pending_operations_first` | S11 |
| `clear_all_ignores_items_added_after_preview` | S12 |
| `clear_all_reports_locked_file_and_retry_is_idempotent` | S13（用只读属性/句柄占用模拟） |
| `preview_empty_when_nothing_to_clear` | S14 |
| `sweep_includes_disabled_and_custom_agents` | S15 |
| `clear_all_is_target_scoped`（两个 `file_pool` + FakeRunner） | S16 |
| `apply_rejects_out_of_scope_keys` | 安全 |
| `apply_cancel_between_chunks` | 取消 |
| `bulk_preview_matches_single_preview` | 回归 |
| `perf_clear_preview_1000x6`（`#[ignore]` 或 perf feature，参照 `pagination_performance_tests.rs`） | 性能 |

> 实现偏差与新增字段已回写到父任务 `design.md` §9；后端契约见 `.trellis/spec/backend/central-clear-all.md`。
