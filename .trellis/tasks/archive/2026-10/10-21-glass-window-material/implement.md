# C3 执行计划

前置：C2 已合入；读 `.trellis/spec/backend/index.md`、`frontend/ipc-adapter.md`、`renderer-authority-boundary.md`、`docs/agents/security-and-shared-state.md`（设置持久化部分）。

1. **Rust service + 单测**：`Cargo.toml` `[target.'cfg(windows)'.dependencies]` 增加 `windows-version = "0.1"`（与 lock 中版本一致，不新增 crate）。新建 `services/window_material.rs`：纯函数 `decide(enabled, build: Option<u32>) -> WindowMaterialState`（可单测：disabled、build 19045、22000、22631、非 Windows），以及调用 `set_effects` / `set_theme` 的薄层。
2. **command + 注册**：`commands/window_material.rs`；`ipc_registry.rs` 登记（D-M6）；`pnpm ipc:codegen`；`commandMap.ts` 类型；`pnpm docs:gen` 并提交 `_generated/`。
   - 验证：`cargo test`、`pnpm ipc:codegen:check`、`pnpm docs:gen:check`、`ipcCommandCoverage.test.ts`、`capabilityDrift.test.ts`。
3. **配置**：`tauri.conf.json` 加 `transparent: true`。
4. **前端 store**：`windowMaterialStore.ts` + 测试（init 读 setting、命令失败时保持 `none`、主题切换触发 `syncTheme`、`setPreference` 持久化）；浏览器 fixture。
5. **CSS**：`html[data-window-material]` 规则与 canvas alpha；契约测试断言默认（无属性）时 canvas 不透明。
6. **接线**：`main.tsx` 在主题 init 后调用 `useWindowMaterialStore.getState().init()`；Settings Appearance 增加开关（只放控件与文案，布局由 C8 统一；文案 en / zh）。
7. **真机验收**（Windows x64 NSIS 安装包）：Win11 亮 / 暗 / 关闭 / 失焦；Win10；缩放、最大化、跨 DPI；冷启动录屏；Central 滚动对比 C2 基线。证据存 `research/`。
8. **收尾**：`just ci`；更新 `.trellis/spec/frontend/theme-switch.md`（主题提交后同步窗口材质）并新增 `window-material.md` 规范。

回退：revert 本 PR；`data-window-material` 缺失时 CSS 默认不透明，C2 之后的界面不受影响。
