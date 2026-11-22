# C9 设计：版本准备与验收方法

## 版本与文档约定（来自仓库现状）

- 版本号三处：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`；`scripts/check/sync-version.mjs`（`pnpm version:check`）校验一致。
- `CHANGELOG.md` / `CHANGELOG.zh.md` 目前只有 `## [Unreleased]` 一节（1.0.1 发布时未切版本节）；版本说明以 `release-notes/<version>.md` 为准，格式为同一文件内 `### English` + 中文两段（参见 `release-notes/1.0.1.md`）。
- 决策：沿用现状——在 `[Unreleased]` 下追加 1.1.0 的 Added / Changed / Removed 条目；新增 `release-notes/1.1.0.md`（双语）。是否切出 `## [1.1.0]` 版本节按 `docs/agents/git-and-release.md` 执行，若指南未规定则保持现状并在报告中提出。

## Breaking / 迁移说明（必须写入 CHANGELOG 与 release notes）

- 移除 Catppuccin（Mocha / Macchiato / Frappé / Latte）、Claude 亮 / 暗主题与 14 种 accent；首启自动迁移：亮色系 → 玻璃亮，暗色系 → 玻璃暗；accent 偏好丢弃。
- 正文默认字体改为 Geist；从旧版升级时，若正文仍是旧默认 JetBrains Mono 且无自定义字体，会一次性改为 Geist（可在 设置 → 外观 改回）。
- Windows 11 默认启用 Mica 窗口材质，可在设置中关闭；Windows 10 不支持，使用不透明背景。

## 视觉矩阵

- 路由：`/dashboard`、`/central`、`/platform/:agentId`（取 2 个平台）、`/rules`、`/skills-cli`、`/projects`（及一个项目）、`/collections`、`/marketplace`（含导入向导）、`/skill/:id`、`/obsidian`、`/logs`、`/usage`、`/settings`（全部分页）。
- 维度：亮 / 暗 × Scale 0.875 / 1 / 1.125 × 900×600 / 1280×800 / 1440×900 × zh / en。全组合过大：**全路由跑 亮 / 暗 × 1280×800 × Scale 1 × zh / en**；其余维度只跑 Dashboard、Central、Settings·Appearance、技能详情四个高风险路由。
- 命名：`research/matrix/<route>-<theme>-<w>x<h>-s<scale>-<lang>.png`。
- 工具：浏览器演示态（`pnpm dev` + IPC fixtures）截图用于布局；Mica / 安装 / 升级迁移只能用真机安装包验证。

## 升级验证脚本（真机）

1. 安装 1.0.2，设置 Macchiato + Peach accent、正文保持默认，导入若干技能。
2. 升级安装 1.1.0：期望玻璃暗、正文 Geist、技能数据完整。
3. 重复一次：1.0.2 设 Latte + 正文自定义 “Cascadia Code”：期望玻璃亮、正文保持 Cascadia Code。
