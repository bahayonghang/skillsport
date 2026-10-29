# 便携包 v2：格式、读写器与导出

父任务：[`10-28-central-state-portability-v2`](../10-28-central-state-portability-v2/prd.md)
共享设计：[`design.md`](../10-28-central-state-portability-v2/design.md) 第 2、3、4、7 节。

## 范围

- 新模块 `src-tauri/src/services/portable_bundle/`：manifest v2 类型、`PortableBundleError`、包写入器、包读取器
  （读取器供 import 子任务使用，本任务负责实现并测试）。
- 导出摘要与导出命令：`get_portable_bundle_export_summary`、`export_portable_bundle`、`cancel_portable_bundle_job`。
- `CentralFs::read_skill_tree`：Local（walkdir）与 SSH/WSL（远端打包传回）两种实现。
- `ResourceBudget::portable_bundle()`。
- 不改动旧的 `portable_state` 命令与前端。

## 需求

- 覆盖父 PRD 的 R1.1–R1.6，以及与导出相关的 R4.1、R4.2。
- 导出全部 Central skill（包括没有来源归属的）、tags/links、tag groups、saved views、全部 registries，以及来源归属
  （branch 未知时为 null，不再回退到 "main"）。
- `contentDigest` 必须由 `CentralFs::hash_directories` 的同一算法计算。
- 读取器：有界读取、指纹、安全矩阵（复用 `local_archive_import::inventory`）、编码嗅探（UTF-16 / UTF-8 BOM）、
  识别 v1 JSON（`legacy_v1`）、带字段路径的结构校验、逐文件 sha256 校验。

## 验收

- [ ] Rust：Local 导出 → 读取器解析的往返测试，内容、摘要、元数据完全一致。
- [ ] Rust：183 个 skill / 23 个仓库 / 6 个共享根路径 `SKILL.md` 的构造数据，导出后来源归属与标签不串。
- [ ] Rust：读取器错误矩阵——v1 JSON、UTF-16、BOM、非 zip、缺少 manifest、路径穿越、符号链接条目、sha256 不符、
      超预算、formatVersion 过高——每种都有对应错误码。
- [ ] Rust：符号链接 / 权限不足的 skill 进入 `skippedSkills`，导出整体仍成功。
- [ ] Rust：导出包与 IPC 错误中不含绝对路径和凭据（参照 `portable_state_errors_drop_paths_and_manifest_content` 写法）。
- [ ] SSH 目标手工验证：导出本机 SSH 目标（103 个 skill），包内 103 个 payload 目录（记录到父任务 `research/`）。
- [ ] 1000 个 skill 的 DB 上，导出摘要 < 500 ms（Rust 基准测试或计时测试）。
- [ ] `pnpm docs:gen` 产物已提交，`just ci` 通过。
