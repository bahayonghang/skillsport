# Implement — portable-bundle-core

## 步骤

1. [x] 阅读 `.trellis/spec/backend/index.md` 以及 jsonl 中列出的规范；完成 design.md "实现前确认" 中的 4 项并记录结论。
2. [x] `types.rs` + `error.rs`：manifest v2、`PortableBundleError`、错误码；把新错误码加入 `REVIEWED_IPC_ERROR_CODES`
       与 `public_message_for_code`。
3. [x] `ResourceBudget::portable_bundle()`。
4. [x] `CentralFs::read_skill_tree`：Local 实现与单元测试（符号链接、权限、超限）。
5. [x] `CentralFs::read_skill_tree`：SSH/WSL 实现；在现有远程测试替身（transport seam，见 `transport-seam.md`）上测试。
6. [x] `collect.rs` + `summary.rs`（含 1000 个 skill 的计时测试）。
7. [x] `writer.rs` + `export.rs`（取消、进度节流、skippedSkills）。
8. [x] `reader.rs`：安全矩阵复用、编码嗅探、v1 识别、完整性校验（未引入 `serde_path_to_error`，见 design.md），以及错误矩阵测试。
9. [x] 往返测试 + 共享 `SKILL.md` 根路径的构造数据测试 + 脱敏测试。
10. [x] `commands/portable_bundle.rs`：三个命令，登记到 `ipc_registry.rs`，`src/lib/ipc/commandMap.ts` 加类型（暂不接 UI）。
11. [x] `pnpm docs:gen`，提交生成产物。
12. [ ] 在本机 SSH 目标上手工导出，记录结果到父任务 `research/`。

## 验证命令

```bash
cargo test --manifest-path src-tauri/Cargo.toml portable_bundle
cargo test --manifest-path src-tauri/Cargo.toml central_updates
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm docs:gen:check
pnpm capabilitycheck
just ci
```

## 回滚点

- 第 4 和第 5 步对 `CentralFs` 的改动只做增量，不改变现有方法；如出现回归，单独 revert 这两步即可。
