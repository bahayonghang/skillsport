# C3 Win11 Mica 原生窗口材质

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`（决策 D3）。依赖：C2 已合入（canvas token 与 `data-theme` 体系就位）。可与 C4 并行。

## 目标

在 Windows 11 上让窗口底使用系统 Mica 材质，使玻璃 canvas 呈现真实的桌面通透感；Windows 10 及任何应用失败的情况下降级为不透明渐变。材质跟随亮 / 暗主题。整个能力独立可回退。

## 需求

- R1 Rust：窗口创建后（显示前）检测 OS 版本，Windows 11（build ≥ 22000）应用 Tauri `Effect::Mica`；失败或不支持时不应用任何效果，并记录一条已脱敏的 runtime 日志。
- R2 透明窗口：`tauri.conf.json` 窗口配置启用 `transparent`；webview 背景透明仅在材质为 `mica` 时生效。
- R3 前端状态：`html[data-window-material]` 默认 `none`（不透明 canvas）；通过 store 获取 Rust 侧材质结果后才切为 `mica`（canvas 带 alpha）。组件不得直接 `invoke()`。
- R4 主题联动：`setFlavor` 后同步窗口主题（Light / Dark），使 Mica 底色与玻璃明暗一致；联动走 store / IPC adapter，不在组件中实现。
- R5 设置项：外观设置中增加“窗口材质：Mica / 关闭”开关（默认开启；Win10 显示为不可用并说明原因）；持久化在 settings 表；文案 en / zh 同步。
- R6 若新增 Tauri 命令：遵守 commands → services 分层、`capabilities` 声明最小权限、运行 `pnpm docs:gen` 并提交生成物、`ipc:codegen` 同步。
- R7 不引入新的第三方原生依赖：使用 Tauri 内置 `set_effects` / `set_theme`；OS 版本判定使用已在依赖树中的 `windows-version`（提为 `cfg(windows)` 直接依赖，见 design.md）。

## 验收标准

- [ ] Win11 真机：安装包启动后窗口底透出 Mica；亮 / 暗切换后 Mica 底色同步；窗口失焦时退化为系统纯色（系统行为，记录即可）。
- [ ] Win10 真机或强制“不支持”路径：canvas 不透明，无任何透明穿透、黑底或白闪。
- [ ] 启动顺序：闪屏 → 首帧期间无透明穿透、无白闪（录屏或逐帧截图存档）。
- [ ] 窗口拖动、缩放、最大化、跨 DPI 显示器移动时无明显闪烁或边缘伪影（逐项记录）。
- [ ] 关闭设置项后立即回到不透明 canvas，重启后保持。
- [ ] Central 网格滚动帧率与 C2 基线相比无可感知退化（同机记录）。
- [ ] `cargo` 测试、`pnpm docs:gen:check`、`just ci` 全绿；Windows x64 NSIS 安装包构建并安装验收。
- [ ] 未完成的硬件证据（某 OS 版本、某 GPU）在任务结束报告中明确列为未验证。

## 范围外

macOS vibrancy、Acrylic、自定义标题栏、多窗口。

## 规划产物

`design.md`（Tauri API 源码调研、D-M1–D-M7 决策、风险验证点）与 `implement.md` 已补齐。
