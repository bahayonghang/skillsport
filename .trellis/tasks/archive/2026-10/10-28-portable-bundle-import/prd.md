# 便携包 v2：导入预览与执行管线

父任务：[`10-28-central-state-portability-v2`](../10-28-central-state-portability-v2/prd.md)
共享设计：[`design.md`](../10-28-central-state-portability-v2/design.md) 第 5、6、7 节。
依赖：`10-28-portable-bundle-core` 已合并（读取器、错误枚举、`read_skill_tree`、`contentDigest` 算法）。

## 范围

- `classify.rs`、`preview_cache.rs`、`apply.rs`、`metadata_merge.rs`（位于 `services/portable_bundle/`）。
- 将 `journaled_central_content_upsert` 泛化为 `CentralContentSource::{GitHub, Bundle}`。
- 命令：`preview_portable_bundle_import`、`apply_portable_bundle_import`、`discard_portable_bundle_preview`。
- 不改动旧的 `portable_state` 命令与前端。

## 需求

- 覆盖父 PRD 的 R2.1–R2.5、R3.1–R3.7、R4.1、R4.2。
- 预览零网络、零写入；分类为 `new` / `identical` / `changed` / `exists_unmanaged` / `invalid`；元数据给出 add/exists/update 统计。
- `previewToken` 缓存：TTL 30 分钟，绑定 target_id；执行前重新校验文件指纹。
- 执行：决策校验 → 通过泛化的 content upsert 写入（Local/SSH/WSL）→ 来源归属 → 元数据合并（单事务、幂等）→ 逐 skill 结果。
- `uid`：覆盖时保留目标端原值，新建时本地生成；不读取源端 uid（manifest 中本来就没有）。
- 取消：已完成的保留，进行中的回滚，未开始的标为 skipped。

## 验收

- [ ] Rust：分类矩阵测试（5 种状态 + 元数据 3 种状态）。
- [ ] Rust：同一个包导入两次——第二次全部 identical，tags/groups/views/registries 行数不变。
- [ ] Rust：rename / overwrite / skip，以及 `decision_required`、`rename_invalid`、`preview_stale`（预览后修改文件）、
      `preview_expired`、`target_changed`。
- [ ] Rust：强制在 swap 之后让 DB 失败 → 旧目录恢复，无暂存/备份残留（参照 local archive 导入测试）。
- [ ] Rust：取消测试（批次之间取消）。
- [ ] Rust：有来源归属的 skill 导入后 `skill_repository_members` 正确；没有归属的分配到 unknown 仓库；
      在 central_updates 中检查更新时不是 remote-missing。
- [ ] Rust：通过远程测试替身导入到 SSH 目标。
- [ ] `cargo test central_updates` 全部通过（泛化不得引入回归）。
- [ ] 200 个 skill（约 50 MB）的预览 < 10 s（计时测试，记录到父任务 `research/perf.md`）。
- [ ] `pnpm docs:gen` 产物已提交，`just ci` 通过。
