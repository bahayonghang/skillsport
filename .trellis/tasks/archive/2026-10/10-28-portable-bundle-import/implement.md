# Implement — portable-bundle-import

前置条件：`10-28-portable-bundle-core` 已合并到 `dev`（实际：叠在 core 分支上开发，见 design.md 实现记录）。

## 步骤

1. [x] 阅读 jsonl 中的规范，重点是 `fs-db-operation-journal.md`、`central-mutation-lock.md`、`local-archive-import.md`、
       `transactional-mutations.md`；确认 design.md 中 `exists_unmanaged` 的语义。
2. [x] `classify.rs`：批量查询 + `hash_directories` 批量计算摘要；分类矩阵测试。
3. [x] `preview_cache.rs` + `preview_portable_bundle_import` / `discard_portable_bundle_preview` 命令；过期/目标切换测试。
4. [x] 泛化 content upsert（`CentralContentSource`）；先跑 `cargo test central_updates`，确认零回归后再继续。
5. [x] `apply.rs`：决策校验、按 skill 流式读取、分批写入、取消、逐项结果。
6. [x] `metadata_merge.rs`：单事务、幂等；重复导入测试。
7. [x] 来源归属写入与更新中心联动测试。
8. [ ] 远程目标（SSH/WSL 测试替身）导入测试。
9. [x] `apply_portable_bundle_import` 命令 + operation log（成功/部分成功/失败/取消）+ 脱敏测试。
10. [ ] 性能计时（200 个 skill，约 50 MB），记录结果。
11. [x] `pnpm docs:gen`，`just ci`。

## 验证命令

```bash
cargo test --manifest-path src-tauri/Cargo.toml portable_bundle
cargo test --manifest-path src-tauri/Cargo.toml central_updates
cargo test --manifest-path src-tauri/Cargo.toml local_archive_import
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm docs:gen:check
just ci
```

## 回滚点

- 第 4 步（content upsert 泛化）单独提交，便于单独 revert；其余步骤只新增代码。
