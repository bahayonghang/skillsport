# Design — portable-bundle-import

以父任务 `design.md` 第 5–7 节为准，这里补充子任务内的细节。

## 预览缓存

```rust
pub(crate) struct BundlePreviewEntry {
    path: PathBuf,
    fingerprint: ArchiveFingerprint,   // sha256 + len，复用 local_archive_import
    manifest: BundleManifest,          // 已校验
    inventory_index: BundleInventoryIndex, // payloadDir → 条目范围；不含文件内容
    classification: Vec<SkillClassification>,
    target_id: String,
    created_at: Instant,
}
```

- 存放在 `AppState.portable_bundle_previews: Mutex<HashMap<Token, BundlePreviewEntry>>`；新建预览时清掉过期项，
  并限制每个目标最多 2 个。
- 切换目标时（`resetForTargetChange` 对应的后端路径）清空。

## 执行时读取内容

- 执行时重新有界读取整个包（指纹比较需要），然后按 skill 从内存中的 zip 解出文件，组装 `CentralContentSource::Bundle`。
  对 1 GiB 的上限，使用"按 skill 流式解压 + 每批写入"，避免整包展开在内存中：读取器提供
  `BundleReader::open(path, expected_fingerprint)` → `iter_skill(payloadDir)`。

## CentralContentSource 泛化

- `content_upsert_plan` 目前依赖 `GitHubRepoSnapshot` 和 `collect_remote_skill_files`。新增 `Bundle` 分支：
  - `files`：来自包的 `(rel_path, bytes, mode)`；
  - `remote_hash`：等于 manifest 中的 `contentDigest`（执行前再按同一算法复算一次并比较）；
  - `source`：有 GitHub 来源归属时构造 `GitHubUpdateSource`，否则设为 `None` 并让 DB 事务走 unknown 仓库分支。
- 若 `RemoteSkillContent` 的字段强绑定 GitHub，则引入 `SkillContentPayload` 枚举，并将 GitHub 路径改为它的一个变体；
  修改范围限制在 `central_updates/core` 内部，对外 API 不变。

## exists_unmanaged

实现前确认：目标端存在 `is_central = 0` 的同 id skill 时，`ensure_centralized` 的语义是"把平台目录中的副本移入 Central 并建立链接"。
本任务的覆盖语义定为：用包内容写入 Central（新目录），保留原平台安装链接不动，DB 将该 skill 标为 central。
如与现有 central-mutation 规范冲突，回到父任务 design 修订后再实现。

## 元数据合并顺序（单事务）

registries（按规范化后的 url 去重；已存在的不改 `is_enabled`）→ tagGroups（按 name）→ tags（按 name；颜色/描述/分组以包为准，
记为 update）→ skill↔tag 链接（`INSERT OR IGNORE`，`source = 'import'`）→ savedViews（按 name；query 不同则更新）。

## 实现记录（2026-10-29）

### 与设计的偏差

- **分支**：core 尚未合并到 `dev`，本任务叠在 `feat/portable-bundle-core` 之上（分支 `feat/portable-bundle-import`），
  合并顺序必须是 core → import。
- **预览缓存**：用服务内的进程级静态 `PreviewCache`（`preview_cache()`），没有新增 `AppState` 字段（否则要改 8 处测试构造）。
  目标切换不主动清缓存；每个条目绑定 `target_id`，执行时目标不一致返回 `portable_bundle.target_changed`。
  每个目标最多保留 2 个预览，TTL 30 分钟，`discard` 立即删除。
- **文件拆分**：为满足 800 行预算，bundle 写入放在 `central_updates/core/bundle_upsert.rs`，批处理的 DB 持久化步骤移到 `core/batch/persist.rs`。
- **内容来源泛化**：`RemoteSkillContent.source` 改为 `ContentSource::{GitHub, Bundle { github }}`，并把 `candidate`
  换成 `skill_name` / `description`（批处理只用到这两个字段）。GitHub 路径行为不变；`cargo test central_updates` 无回归。
  新入口 `journaled_bundle_content_upsert` 一次处理一批 skill，复用同一个日志式批处理（锁、暂存/交换、DB 事务、回滚）。
- **uid**：目标端已有同 id 的行（无论是否 central）一律保留原 uid；只有全新 skill 才在本地生成。
- **exists_unmanaged 覆盖**：写入 `<central_root>/<id>`，DB 行改为 central；平台安装链接不动。
  另外，"DB 无记录但 Central 目录已存在"的孤儿目录也归为 `exists_unmanaged`，用户选择覆盖时先备份再替换。
- **来源归属**：
  - 包内有 GitHub 来源 → 写入 `skill_repositories` + member；`branch` 为空时仓库行的 branch 为 NULL，
    id 沿用 `github_repository_id(owner, repo, "")`（即 `github:<owner>-<repo>-`，为不超出 `repositories_repo.rs` 的 800 行预算而未改写该函数），由更新中心检查时解析默认分支。
  - 包内无来源 → `skills.source = 'portable-bundle'`，并删除旧的 member 行，使其归为 unknown 来源。
  - member 的 `content_digest` 不写入（GitHub 导入使用的是另一种摘要算法）。
- **元数据合并**：即使执行中途取消，也会为已完成的 skill 运行一次元数据合并（单事务）。内置标签/分组不会被更新。
- **逐项结果代码**：skipped = `identical` / `user_skipped` / `invalid` / `cancelled`；failed = `target_exists` / `write_failed`。

### 未覆盖（留作后续）

- 远程目标（SSH/WSL 测试替身）的导入测试：写入走的是已有远程测试覆盖的同一批处理，但没有端到端的 bundle 用例。
- "批次之间取消"的测试：目前只测了开始前取消（不写任何内容）；批内取消依赖批处理已有的取消测试。
- 200 个 skill / 50 MB 的预览计时（`research/perf.md`）。
- en/zh 错误文案：错误码与英文公开文案已登记；i18n 文案随 UI 子任务添加。
