# Portable Bundle v2 Contract

## Scope

适用于 Central 状态的跨设备迁移：`.skillport`（zip）便携包的导出与读取。旧的 v1 JSON（`skillport/state`）只做识别，
不再导入。导入应用与 UI 由后续子任务补充本文件。

## Format

```text
<bundle>.skillport (zip, 无 ZIP64)
├── skills/<payloadDir>/...   # 每个 skill 的普通文件，原样存储
└── manifest.json             # kind=skillport/bundle, formatVersion=2，最后写入
```

- `contentDigest` 必须与 `CentralFs::hash_directories` 的结果一致：只计入普通文件，跳过符号链接；
  复用 `content_digest_of` / `sha256_hex`，不得另写一套哈希。
- 读取整个 skill 目录只能用 `CentralFs::read_skill_tree`（`central_updates/fs/skill_tree.rs`），与哈希的取舍规则保持一致。
- 标签分组 / 标签在 manifest 中重新编号为 `g1..` / `t1..`；只导出非内置的 registries。
- `origin` 只记录 `targetKind`；不导出 SSH/WSL 标签、主机、用户、绝对路径或任何凭据。

## Export

- 预算统一使用 `ResourceBudget::portable_bundle()`；写入器在写任何字节前先预留条目数与展开字节数。
- 写入临时文件后原子 `persist`；未完成的写入器在 drop 时删除临时文件。目标扩展名限定为 `.skillport` / `.zip`。
- 单个 skill 失败（`invalid_id`、`budget_exceeded`、本地 `read_failed`、`manifest_missing`）记入 `skippedSkills`，
  不中断导出；远程目标的 `Remote` 错误视为整体失败。
- 作业复用 `portable_state_jobs`（busy 码 `job.portability_busy`），支持取消；进度事件按 100 ms 节流。

## Read / Validate

- 先走共享的 `local_archive_import::inventory` 安全检查，再解析 manifest（上限 32 MiB）。
- 非 zip 输入：嗅探 UTF-8/UTF-16/BOM，识别出 v1 JSON 时返回 `portable_bundle.legacy_v1`，其余返回 `not_a_bundle`。
- 结构性错误（缺 manifest、编码、版本、孤立条目）整体失败；逐 skill 的 payload / 哈希 / 未知标签问题记入
  `invalid_skills`，交由导入预览展示。
- 解压时以条目声明的大小为上限。

## Errors

- 每种失败都有专用的 `portable_bundle.*` 错误码，并登记在 `REVIEWED_IPC_ERROR_CODES` 中；改动后运行
  `pnpm ipc:codegen` 刷新 `generatedCommandMap.ts`。
- IPC 只返回错误码与审定文案；字段路径、行列号、预算维度只进运行时日志。命令层不得使用 `.map_err(|e| e.to_string())`。

## Tests Required

- 往返测试（digest 一致）、多个 skill 共用同一根目录 `SKILL.md` 的情况、跳过原因、取消、非法路径、脱敏。
- v1 识别（UTF-8 / UTF-8 BOM / UTF-16LE/BE）、结构错误矩阵、逐 skill 完整性、预算。
- 1000 个 skill 的导出摘要在 500 ms 内完成。

## Quality Check

- `cargo test --lib -- portable_bundle skill_tree`
- `pnpm ipc:codegen`、`pnpm docs:gen`，确认生成产物已提交。
