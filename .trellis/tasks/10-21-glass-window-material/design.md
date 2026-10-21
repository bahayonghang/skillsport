# C3 设计：Win11 Mica 窗口材质

## 调研结论（本地 crate 源码，`Cargo.lock` 锁定版本）

| 事实 | 证据 |
| --- | --- |
| `tauri 2.11.5` 内置 `Window::set_effects(WindowEffectsConfig)` 与 `set_theme(Option<Theme>)` | `tauri-2.11.5/src/window/mod.rs:2076`、`:1899`；`webview_window.rs:2036`、`:2295` |
| Windows 下 `Effect::Mica / MicaLight / MicaDark` 转发到 `window_vibrancy::apply_mica(hwnd, dark)`；`MicaLight/Dark` 同时设置 `DWMWA_USE_IMMERSIVE_DARK_MODE` | `tauri-2.11.5/src/vibrancy/windows.rs:16-45` |
| `apply_mica`：build ≥ 22523 用文档化 `DWMWA_SYSTEMBACKDROP_TYPE=MAINWINDOW`；22000–22522 用未文档化 `DWMWA_MICA_EFFECT`；更低返回 `UnsupportedPlatformVersion` | `window-vibrancy-0.6.0/src/windows.rs:109-140, 316-330` |
| **`set_effects` 吞掉结果**（`let _ = crate::vibrancy::set_window_effects(...)`，并在主线程异步执行） | `tauri-2.11.5/src/window/mod.rs:2076-2082` |
| 透明窗口需配置 `transparent: true`（`tauri-utils` `WindowConfig.transparent`） | `tauri-utils-2.9.3/src/config.rs:2025` |
| `windows-version 0.1.7` 已在依赖树中（window-vibrancy 的传递依赖），可零新增 crate 地提为 `cfg(windows)` 直接依赖 | `src-tauri/Cargo.lock` |
| 窗口初始 `visible: false`，由前端 `StartupGate` 就绪后 `showMainWindowWhenReady()` 显示 | `tauri.conf.json:22`、`src/lib/ipc/runtime.ts:19-26`、`StartupGate.tsx:33` |

推论：
1. Rust 无法从 `set_effects` 得知是否成功，必须**自行判定支持性**（`OsVersion::current().build >= 22000`），以“支持 + 已请求”作为 `applied: "mica"` 的依据；真机验收弥补这一不可观测性。
2. 材质应在窗口显示前请求，前端默认不透明，所以即使请求晚到也只会“由不透明变通透”，不会穿透。

## 决策

- **D-M1 状态传递 = 显式命令**（相对事件 / 初始化脚本更简单、可测、可在浏览器 fixture 中模拟）：
  ```rust
  #[tauri::command]
  pub async fn set_window_material(window: tauri::WebviewWindow, enabled: bool, dark: bool)
      -> Result<WindowMaterialState, String>;
  #[derive(Serialize)] #[serde(rename_all = "camelCase")]
  pub struct WindowMaterialState { pub applied: Material /* "mica" | "none" */, pub reason: Option<Reason> /* "disabled" | "unsupportedOs" | "unsupportedPlatform" */, pub supported: bool }
  ```
  service `services/window_material.rs` 持有判定与调用；command 只做参数转换（遵守 commands → services 分层）。非 Windows：`applied: none, reason: unsupportedPlatform`。
- **D-M2 主题联动**：Mica 开启时用 `MicaLight` / `MicaDark`（与 glass 明暗一致，同时修正标题栏明暗）；关闭时 `set_effects(None)` 并仍调用 `set_theme` 使原生标题栏跟随明暗。
- **D-M3 设置持久化**：settings 表 key `window_material_v1`，值 `mica` | `off`，缺省视为 `mica`。走现有 `get_setting` / `set_setting`，不新增表。
- **D-M4 前端 store**：新增 `src/stores/windowMaterialStore.ts`：`{ preference, state, init(), setPreference(), syncTheme(dark) }`；`init()` 在 `main.tsx` 主题 init 之后调用（读 setting → 调命令 → 写 `document.documentElement.dataset.windowMaterial`）；订阅 `themeStore.flavor` 变化调用 `syncTheme`。组件只读 store。
- **D-M5 透明配置**：`tauri.conf.json` 窗口加 `"transparent": true`；`backgroundColor` 保留 C2 的 glass 中性色（作为系统层兜底）。CSS：`html[data-window-material="mica"] body { background: transparent }`，`.glass-canvas` 在 mica 下 alpha 0.72（亮）/ 0.80（暗）；`none` 下完全不透明。
- **D-M6 IPC 注册**：在 `ipc_registry.rs` 登记为 `runtime_only(InternalRefresh)`（现有 `RuntimeOnlyReason`，见 `observability/policy.rs:87-92`；窗口呈现副作用、不改持久数据，不写 Operation Log，只写 runtime 日志）。不新增 `ExclusionReason`（该枚举只服务自记录与前端就绪桥）。偏好写入继续走已登记的 `set_setting`（`operation(Settings, Database, TerminalOnly)`）；运行 `pnpm ipc:codegen`、`pnpm docs:gen`；浏览器 fixture 返回 `{ applied: "none", reason: "unsupportedPlatform", supported: false }`。
- **D-M7 不使用 Acrylic 作 Win10 降级**：Win10 上 acrylic 在拖动 / 缩放时有已知卡顿，直接降级为不透明 canvas。

## 风险与验证点

| 风险 | 验证 |
| --- | --- |
| `transparent: true` 在部分 GPU / 远程桌面下出现黑底 | 远程桌面会话与集显 / 独显各记录一次；若复现则在 `supported` 判定中排除（如检测 RDP 会话） |
| 缩放 / 最大化时边缘闪烁 | 录屏逐项记录 |
| DPI 跨屏 | 100% ↔ 150% 屏间拖动 |
| 启动顺序 | 设置为 `mica` 时冷启动录屏；确认闪屏期间无透明 |
| 22000–22522 走未文档化属性 | 若无该版本真机，在报告中列为未验证 |
