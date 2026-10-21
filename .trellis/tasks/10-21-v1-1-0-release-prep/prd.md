# C9 1.1.0 版本准备与全量视觉验收

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`。依赖：C1–C8 全部合入 dev。

## 目标

把轻盈毛玻璃重构收束为可发布的 1.1.0：版本号、变更记录、公开文档、全量视觉矩阵与 Windows 安装包验收。**不包含**打 tag、发布 GitHub Release 或上传 updater 元数据；这些按 `docs/agents/git-and-release.md` 另行获得授权后执行。

## 需求

- R1 版本：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`（及 `Cargo.lock`）统一为 `1.1.0`；`pnpm version:check` 通过。
- R2 变更记录：`CHANGELOG.md` / `CHANGELOG.zh.md` 新增 1.1.0 条目：新视觉体系、玻璃亮 / 暗、Win11 Mica、正文字体默认变更（含 D-F1 迁移说明）、**移除 Catppuccin / Claude 主题与 14 accent（Breaking for preferences）**及迁移规则。新增双语 `release-notes/1.1.0.md`（格式同 `release-notes/1.0.1.md`）。
- R3 公开文档：`README.md` / `README_CN.md` 的主题 / 外观描述与截图更新且双语对齐；`docs/` 中外观相关指南更新，`pnpm docs:build` 通过。
- R4 全量视觉矩阵（父任务 AC8）：全部路由 × 亮 / 暗 × 三档字号 × 900×600 / 1280×800 / 1440×900 × 中 / 英；截图按矩阵命名存入本任务 `research/`；记录每个问题与处理结果。
- R5 父任务集成审查清单（父任务 `implement.md`）逐项执行并记录结果。
- R6 Windows 安装包：构建 x64 NSIS（及发布指南要求的 MSI / ZIP），在 Win11 与 Win10 上安装、首启迁移（旧 flavor → 新主题）、主题切换、Mica 开关、卸载验收；遵守 Authenticode → updater 签名 → 元数据的顺序约束（若本轮涉及签名）。

## 验收标准

- [ ] `pnpm version:check`、`pnpm docs:gen:check`、`pnpm docs:build`、`just ci` 全绿。
- [ ] 矩阵截图齐全；所有问题已修复或在报告中明确列为已知问题并获用户确认。
- [ ] 从 1.0.2 升级安装后，旧主题偏好迁移正确、字体按 D-F1 规则处理、无数据丢失。
- [ ] Win11 / Win10 安装包验收记录完整；未覆盖的硬件 / OS 组合明确列出。
- [ ] 发布动作（tag / Release / updater）列为后续步骤，未在本任务执行。
