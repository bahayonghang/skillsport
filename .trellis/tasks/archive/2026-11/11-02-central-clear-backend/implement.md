# Implement：后端

## 步骤

1. [ ] `paths.rs`：新增 `path_is_within`、`attributable_central_roots`（Local/Remote），附单测（大小写、`\\?\`、相对链接、悬空）。
2. [ ] `clear_all/types.rs` + `commands/central_clear.rs` 命令签名（先返回 `unimplemented` 以外的空结果）+ `ipc_registry.rs` 登记 +
       `pnpm docs:gen`。**此步完成即可通知前端子任务开工。**
3. [ ] `candidates.rs`：批量 SQL + 批量预览 + `bulk_preview_matches_single_preview` 对照测试。
4. [ ] `sweep.rs`：Local 扫描 + S5–S9、S15 测试。
5. [ ] `mod.rs`：preview 编排 + S14 测试。
6. [ ] `progress.rs` + 作业族 `central_clear`（`AppState`、cancel 命令）。
7. [ ] `mod.rs`：apply 编排（锁、recovery、求交集、四阶段、finalize）+ S1–S4、S10–S13、安全、取消测试。
8. [ ] `remote.rs`：探测与删除脚本 + FakeRunner 测试 + S16。
9. [ ] 观测性：`operation_definition` 登记 + 观测性测试。
10. [ ] 性能测试，记录预览/apply 耗时；若 apply 1000 项 > 60s，评估 finalize 有界并行（另开评审）。
11. [ ] spec：`.trellis/spec/backend/central-clear-all.md`、`backend/index.md`、`exclusive-job-lifecycle.md`。

## 校验命令

```bash
cargo test --manifest-path src-tauri/Cargo.toml central_skills::clear_all
cargo test --manifest-path src-tauri/Cargo.toml paths::
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm docs:gen && pnpm docs:gen:check
just ci
```

## 评审关注点

- 是否有任何删除路径绕过 `ensure_child_path` / 链接复核。
- 是否在锁内二次取锁（死锁风险）。
- 预览 SQL 次数是否与 skill 数无关。
- 远端脚本是否全部 `shell_quote`，是否误用 scanner 的 `[ -e ]` 过滤。

## 回滚点

- 步骤 2 之后每步独立可回退；无 schema 迁移。
