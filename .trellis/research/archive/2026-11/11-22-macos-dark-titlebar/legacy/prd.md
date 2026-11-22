# 修复 macOS 暗黑模式顶部原生标题栏亮白问题

## 背景与问题描述

在 macOS 下切换到 `Glass Dark`（暗黑模式）时，窗口最上方的原生标题栏仍呈现亮白色（`#eef3f4`），而浅色模式和 Windows 平台均无此问题：

1. **前后端对非 Windows 平台双重短路**：`src-tauri/src/services/window_material.rs::apply` 在检测到 `UnsupportedPlatform` 时提前返回，跳过了 `window.set_theme(Some(theme))`；前端 `src/stores/windowMaterialStore.ts::syncTheme` 也在 `reason === "unsupportedPlatform"` 时直接返回，导致应用内切换深浅色主题时未通知后端同步 `NSWindow` 的 `NSAppearance`。
2. **`tauri.conf.json` 的静态浅色 `backgroundColor` 穿透 macOS 标题栏**：主窗口配置了 `"transparent": true` 与 `"backgroundColor": "#eef3f4"`。在 macOS `AppKit` 下，`NSWindow.backgroundColor` 覆盖整个窗口 Frame（含顶部原生标题栏背板），当 WebView 切至暗黑 `#121a20` 时，标题栏仍透出 `#eef3f4`。

## 范围与方案

- 在 `src-tauri/tauri.conf.json` 为主窗口启用 `"titleBarStyle": "Transparent"`（macOS 专属，开启 `setTitlebarAppearsTransparent(true)` 且保持 `fullsize_content_view = false`，不改变 `contentView` 布局，消除标题栏独立灰底与分割线）。
- 在 `src-tauri/src/services/window_material.rs` 中将 `window.set_theme` 置于 `UnsupportedPlatform` 短路判断之前跨平台执行；在 `#[cfg(not(windows))]` 下调用 `window.set_background_color` 同步浅色 `#eef3f4`（`LIGHT_WINDOW_BG`）与深色 `#121a20`（`DARK_WINDOW_BG`），Windows 下不调 `WebviewWindow::set_background_color` 以保护 WebView2 的 `A=0` Mica 透明通道。
- 在 `src/stores/windowMaterialStore.ts` 中移除 `syncTheme` 对 `unsupportedPlatform` 的提前返回，并保持 `data-window-material="none"` 与设置页禁用说明不变。

## 验收标准

- [x] `src-tauri/tauri.conf.json` 启用 `"titleBarStyle": "Transparent"`。
- [x] 非 Windows 平台在初始化与主题切换时均调用 `set_window_material` 同步 `window.set_theme` 与 `window.set_background_color`，且 DOM `data-window-material` 保持 `"none"`。
- [x] `windowMaterialContract.test.ts` 锁定 `titleBarStyle: "Transparent"` 及 Rust `LIGHT_WINDOW_BG` / `DARK_WINDOW_BG` 与 `src/index.css` `--background` 的一致性。
- [x] `just check`、`cargo test --lib services::window_material`、`cargo clippy --lib -- -D warnings` 全部通过。
