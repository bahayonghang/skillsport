# 窗口材质（Windows 11 Mica）与不透明降级契约

> 建立于 2026-10-21（任务 10-21-glass-window-material，C3）。玻璃 canvas 在 Windows 11 上透出系统 Mica；其余环境保持不透明渐变。视觉依据见 `DESIGN.md`「Window Material（Mica）」与 Known Gaps。

## 1. Scope / Trigger

修改 `set_window_material` 命令、`services/window_material.rs`、`src/stores/windowMaterialStore.ts`、`html[data-window-material]` 的 CSS、`tauri.conf.json` 的 `transparent` / `backgroundColor`，或给全窗表面（AppShell 根、StartupGate、body）加背景时适用。

## 2. Signatures

```rust
// src-tauri/src/services/window_material.rs
pub const MICA_MIN_BUILD: u32 = 22_000;
pub enum WindowMaterial { Mica, None }                          // "mica" | "none"
pub enum WindowMaterialReason { Disabled, UnsupportedOs, UnsupportedPlatform, ApplyFailed }
pub struct WindowMaterialState { pub applied: WindowMaterial, pub reason: Option<WindowMaterialReason>, pub supported: bool }
pub fn decide(enabled: bool, build: Option<u32>) -> WindowMaterialState; // 纯函数，可单测
pub fn apply<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, enabled: bool, dark: bool) -> WindowMaterialState;

// src-tauri/src/commands/window_material.rs —— runtime_only(InternalRefresh)
#[tauri::command]
pub async fn set_window_material(window: tauri::WebviewWindow, enabled: bool, dark: bool)
    -> crate::ipc_error::IpcResult<WindowMaterialState>;
```

```ts
// src/stores/windowMaterialStore.ts
type WindowMaterialPreference = "mica" | "off";        // settings key window_material_v1，缺省 mica
type WindowMaterialState = CommandResult<"set_window_material">;
init(): Promise<void>;                                  // main.tsx 在 themeStore.init() 之后调用
setPreference(preference): Promise<void>;               // 先 set_setting，再重新 apply；写入失败 rethrow
syncTheme(dark: boolean): Promise<void>;                // themeStore.flavor 变化后由订阅调用
```

DOM 标记：`document.documentElement.dataset.windowMaterial = "none" | "mica"`，只由该 store 写入。

## 3. Contracts

- **支持性由 OS build 决定**：Tauri 2 的 `set_effects` 在主线程异步执行并吞掉 `window_vibrancy` 的结果，无法事后观测。`decide` 规则：非 Windows → `none / unsupportedPlatform / supported=false`；build < 22000 → `none / unsupportedOs / supported=false`；Windows 11 且偏好 off → `none / disabled / supported=true`；Windows 11 且偏好 mica → `mica / null / supported=true`。`set_effects` 派发失败 → `none / applyFailed / supported=true`。
- **先不透明、后通透**：默认（无属性或 `none`）时 `body` 与 `.glass-canvas` 完全不透明；只有 store 收到 `applied: "mica"` 才写 `mica`。命令 reject、结果未到、较旧请求晚到都保持或回到 `none`。原生窗口是 `transparent: true`，所以不透明页面是 Win10 / 失败路径上防止透明穿透的唯一屏障。
- **CSS**：只有 `html[data-window-material="mica"]` 规则放宽不透明度：`html` / `body` 背景透明，`.glass-canvas` 背景色透明、渐变两端为 `color-mix(... 80%, transparent)`。Mica 下 canvas alpha **不得低于 0.80**（DESIGN.md Known Gaps；任务 design 草案的 0.72 已被 DESIGN.md 否决）。不得写 `data-window-material="none"` 的覆盖规则，不得在别处让全窗表面变透明。
- **主题联动**：Mica 开启时 Rust 用 `MicaLight` / `MicaDark`（同时修正标题栏明暗）；关闭或 Win10 时 `set_effects(None)`（仅 Win11）并仍 `set_theme(Light|Dark)`。store 订阅 `themeStore.flavor`，在 `setFlavor` / `toggleFlavor` 提交之后调用 `syncTheme`；不在组件里实现。`unsupportedPlatform` 时不再发起同步。
- **请求序号**：每次 apply 自增序号，只有最新一次的结果写入 DOM 与 state。
- **偏好持久化**：`window_material_v1` 走通用 `get_setting` / `set_setting`；`settings_policy.rs` 只接受 `mica` | `off`，审计类别为 `appearance`，不记录 key 与值。读取失败（如启动恢复态）回落 `mica`。
- **组件边界**：组件不得 `invoke()`；设置页开关 `WindowMaterialSetting` 只读 store，写入失败 toast `formatBackendError`。`supported=false` 时开关禁用并显示原因（`settings.appearance.windowMaterialUnavailable.*`）。
- **浏览器演示态**：fixture `set_window_material` 返回 `{ applied: "none", reason: "unsupportedPlatform", supported: false }`；store 不写 `isTauriRuntime()` 分支。
- **日志**：Rust 只写固定 code（`window_theme_sync_failed`、`window_material_apply_failed`、`window_material_clear_failed`、`window_material_unsupported_os`），不含参数、路径或标题。命令不写 Operation Log。
- 不使用 Acrylic 作 Win10 降级；不实现 macOS vibrancy。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| Windows 11（≥ 22000）+ 偏好 mica | `mica`；canvas 80% alpha 透出 Mica |
| Windows 11 + 偏好 off | `none / disabled`；开关可用，canvas 不透明 |
| Windows 10（< 22000） | `none / unsupportedOs`；开关禁用并说明 |
| 非 Windows / 浏览器 | `none / unsupportedPlatform`；主题切换不再调用命令 |
| 命令 reject | DOM 回到 `none`，state 不变 |
| `set_setting` 失败 | `setPreference` rethrow，偏好与 DOM 不变，UI toast |
| 主题切换期间较旧请求晚到 | 被序号丢弃 |
| 窗口失焦 | OS 将 Mica 退化为纯色（系统行为，不是缺陷） |

## 5. Good / Base / Bad Cases

- Good：Win11 冷启动，窗口在 StartupGate 就绪后显示，先不透明，`set_window_material` 返回后 canvas 变为 80% alpha；切到 glass-dark 后 Mica 变暗、标题栏同步。
- Base：Win10 用户看到与 C2 完全一致的不透明渐变，设置页开关禁用。
- Bad：在 CSS 默认规则里给 `.glass-canvas` 加 alpha，或组件里 `invoke("set_window_material")`；前者让 Win10 透明穿透，后者绕过序号与主题订阅。

## 6. Tests Required

- Rust `services::window_material::tests`：非 Windows、build 10240 / 19045 / 21999、22000 / 22523 / 22631 / 26100、disabled、serde 字段名。
- Rust `commands::settings_policy::tests`：`window_material_v1` 接受 `mica` / `off`，拒绝其他值，审计类别 `appearance`。
- `src/test/stores/windowMaterialStore.test.ts`：init 读 key、结果前保持 `none`、off、Win10、命令失败保持 `none`、读取失败回落默认、主题切换触发同步且不重复订阅、非 Windows 不同步、最新请求胜出、`setPreference` 持久化与失败 rethrow。
- `src/test/contracts/windowMaterialContract.test.ts`：默认 canvas / body 不透明；只有 `mica` 标记放宽；Mica 下 alpha ≥ 0.80 且光斑几何与默认 canvas 一致；两主题文字在代表性 Mica 底色上的面板合成色 ≥ 4.5:1；`tauri.conf.json` `transparent: true` 且保留 `backgroundColor`。
- `src/test/components/settings/WindowMaterialSetting.test.tsx`、`src/test/fixtures/browserFixtures.test.ts`。
- 真机证据（Win11 亮 / 暗 / 关闭 / 失焦、Win10、缩放 / 最大化 / 跨 DPI、冷启动录屏、Central 滚动帧率）不能由上述测试替代，未取得时在任务报告中列为 UNVERIFIED。

## 7. Wrong vs Correct

```css
/* Wrong: 默认规则带 alpha，Win10 / 失败路径透明穿透 */
.glass-canvas { background-color: rgb(238 243 244 / 0.8); }

/* Correct: 只在 Rust 确认 Mica 后放宽 */
html[data-window-material="mica"] .glass-canvas { background-color: transparent; /* ... 80% 渐变 */ }
```

```ts
// Wrong: 组件直接调用命令，绕过 store 的序号与主题订阅
await invoke("set_window_material", { enabled: true, dark });

// Correct
await useWindowMaterialStore.getState().setPreference("mica");
```
