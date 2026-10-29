# Design — portable-bundle-core

以父任务 `design.md` 为准，这里只记录本子任务的模块切分与实现前需要确认的点。

## 模块

```text
src-tauri/src/services/portable_bundle/
├── mod.rs            # 对外 API 与 re-export
├── types.rs          # Manifest v2、Summary、ExportResult、进度载荷（serde camelCase）
├── error.rs          # PortableBundleError（thiserror）+ code() + to_ipc_error()
├── budget.rs         # ResourceBudget::portable_bundle() 的封装（或直接放在 resource_budget.rs）
├── summary.rs        # 只查 DB 的导出摘要
├── collect.rs        # 从 DB 组装 manifest 元数据；来源归属规范化（import_source_path 规则移到此处共享）
├── export.rs         # 编排：collect → read_skill_tree → writer；取消与进度
├── writer.rs         # 临时文件 + ZipWriter + persist（阻塞，跑在 run_blocking_fs_with 中）
├── reader.rs         # 有界读取 + 指纹 + inventory + manifest 解析 + 完整性校验 → ParsedBundle
└── tests.rs
src-tauri/src/commands/portable_bundle.rs   # 薄命令层：解析目标上下文、作业租约、operation log
```

- 作业租约复用 `ExclusiveJobRegistry`；在 `AppState` 中新增 `portable_bundle_jobs`，或在确认语义一致后复用 `portable_state_jobs`
  （UI 切换后旧的会被删除，**推荐直接新建**，以免在并存期间互相阻塞）。
- `CentralFs::read_skill_tree(dir, budget, cancel) -> Vec<TreeFile { rel_path, bytes, mode }>`：
  放在 `services/central_updates/fs/` 中，与 `hash_directories` 相邻，保证两者对"哪些文件算内容"的判断一致
  （同样的排除规则、同样的符号链接处理）。

## 实现前确认

1. `hash_directories` 的算法细节（是否包含可执行位、是否排除 `.git` 等）——导出的 `contentDigest` 必须与之完全一致。
2. 远程目标的字节通道：`ConnectedRemoteTarget` 是否已有返回 `Vec<u8>` 的执行接口；没有则用 `run_command` + base64，
   并用预算限制输出长度。
3. `zip` crate（v9，`deflate-flate2-zlib-rs`）的写入 API，以及在 `persist` 前计算整包 sha256 的方式（可选，用于结果展示）。
4. `serde_path_to_error` 新依赖对 `pnpm capabilitycheck` 依赖清单的影响。

## 实现前确认 —— 结论（2026-10-28）

1. `hash_directories`：只计入普通文件，跳过符号链接和特殊条目；条目为 `(相对路径, sha256 小写十六进制)`，按路径排序，
   用 `0xff`/`0xfe` 分隔后再做 sha256，前缀 `sha256-manifest:`。不包含可执行位，也不排除 `.git`。
   导出直接复用该函数（新增 `content_digest_of` / `sha256_hex`），往返测试锁定一致性。
2. 远程字节通道：`ConnectedRemoteTarget::read_file_bounded` 已返回 `Vec<u8>`，配合 `list_dir` 做 BFS
   （与 `hash_remote_directory` 的回退路径相同），不依赖远端的 `tar`/`base64`。代价是每个文件一次往返，
   远程大库的提速（批量脚本）留作后续优化。
3. `zip` v9：`SimpleFileOptions` + `large_file(false)`，只写普通文件条目，不写目录条目；先写 payload，最后写 manifest
   （条目顺序不影响读取器）。
4. **不引入 `serde_path_to_error`**：serde_json 的错误信息已包含字段名和行列号，这些只写入运行时日志。

## 与父设计的偏差

- 作业租约复用 `AppState.portable_state_jobs`（busy 码 `job.portability_busy`），不新增 AppState 字段：
  v1 与 v2 同属一个作业族，互斥是正确行为；UI 子任务删除 v1 时再改名。
- `IpcError` 信封没有 `detail` 字段。为避免改动全局信封，各种失败用**专用错误码**区分；字段路径/行列只进运行时日志。
- manifest 的 `origin` 只记录 `targetKind`：SSH/WSL 标签由用户命名，常常就是主机名。
- `commitSha` 目前恒为 `null`：数据库没有保存 commit SHA（`skill_update_states` 只有内容哈希）。
- 读取器在内存中处理整个包（上限 1 GiB），由共享 inventory 先做全部安全检查；按 skill 流式解压留给 import 子任务按需实现。
- 模块合并：`summary.rs` 并入 `collect.rs`，预算直接放在 `resource_budget.rs`；`read_skill_tree` 位于
  `central_updates/fs/skill_tree.rs`（`fs.rs` 受 800 行预算限制）。
- 远程目标上读取失败（`Remote` 错误）视为整体失败，不按 skill 跳过，避免连接中断时静默导出一个空包。

## 错误到 IPC 的映射

- 每个变体都有固定的 `code()`；`to_ipc_error()` 用 `IpcError::new(code, public_message_for_code(code))` 生成信封，
  对外只暴露错误码与审定文案；`Display` 中的字段路径、行列、预算维度只进运行时日志。
- 命令层不得使用 `.map_err(|e| e.to_string())`（这是 RC5 的直接成因）。
