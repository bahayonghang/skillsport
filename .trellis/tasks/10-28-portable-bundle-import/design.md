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
