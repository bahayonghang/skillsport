# C2 玻璃主题与 token 底座（完全替换主题体系）

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`。依赖：C1 已定稿并经用户审阅。

## 目标

在 `src/index.css` 与主题 store 层完成完全替换：只保留 `glass-light` / `glass-dark`，提供 canvas、表面层级、tint、圆角、阴影、模糊 token 与工具类；迁移老用户偏好；重写对比度契约。完成后应用整体换上新底色与材质，组件形状（胶囊等）留给 C4。

## 需求

- R1 Token：删除 6 个 flavor 块、14 个 accent 块及其组合覆写（`src/index.css:260-930`）；新增 `[data-theme="glass-light"]` / `[data-theme="glass-dark"]`，值取自 C1 `DESIGN.md`。shadcn 语义 token 名不变，只新增 `--canvas-*`、`--glass-*`、`--primary-tint`、`--secondary-accent*`、`--radius-control/card/shell/pill`、`--shadow-glass*`。
- R2 工具类：`.glass-canvas`（L1，渐变 + radial 光斑，禁止 `filter: blur`）、`.glass-panel`、`.glass-panel-hover`、`.glass-overlay`（浮层，真实 blur）、`.glass-sticky`（sticky 条，真实 blur）、`.tint-primary` / `.tint-secondary` / `.tint-warning` / `.tint-destructive`；`backdrop-filter` 只允许出现在 `.glass-overlay` / `.glass-sticky` 两块中（C4 契约测试守卫）。在 `@theme inline` 注册 `--radius-control/card/shell/pill`，生成 `rounded-control` / `rounded-card` / `rounded-shell` utility，并注册 `--color-glass-stroke` / `--color-glass-hairline` / `--color-primary-tint` / `--color-secondary-accent*` 以生成 `border-glass-stroke`、`bg-primary-tint` 等命名 utility，供后续任务替代 arbitrary 圆角；新增 `text-display-stat` 语义字号 token。删除 `.surface-glass`、`.bg-orbit`、`.readiness-*` 中被新层取代的定义（消费方由 C6 迁移；本任务内用新类做临时等价映射，保证合入后 Dashboard 不破）。
- R3 `@custom-variant dark` 改为 glass-dark。
- R4 `themeStore`：`ThemeFlavor` 收敛为两值，删除 accent 状态 / 动作 / `ACCENT_NAMES` / `CatppuccinAccent`；新 localStorage key 与旧值迁移（见 design.md）；保留 `theme-switch.md` 的提交抑制契约。
- R5 消费者：`TopBar.tsx` 主题按钮改为亮 / 暗切换（位置调整留给 C5）；`AppearanceSettingsSection.tsx` 删除 flavor 网格与 accent 选择器，改为亮 / 暗二选一（布局细节留给 C8，这里只保证功能正确）；`settingsViewModel.ts` / `settingsViewBindings.ts` / `settingsPageSections.tsx` / `main.tsx` / `lib/statusTone.ts` 去除 `--ctp-*` 与 accent 引用；相关 i18n key 增删（en / zh 同步）。
- R6 字体：`DEFAULT_FONT_PROFILE.body` 改为 `geist`；按 design.md D-F1 处理已落盘的旧默认值；`font-preferences.md` 默认值表更新。
- R7 图标线宽：lucide 全局 `stroke-width: 1.75`（CSS 层统一，不逐个改组件；9 处显式 `strokeWidth` 逐一审视）。
- R8 闪屏与窗口底色：`index.html` `.startup-card` 与背景改为 glass 字面值（亮 / 暗随 `prefers-color-scheme`）；`tauri.conf.json` `backgroundColor` 改为 glass 中性底色。
- R9 契约测试：重写 `themeContrast.test.ts` 为 2 主题矩阵并实现半透明合成（面板 alpha 叠 canvas 最不利点、tint 叠面板）；更新 `themeStore.test.ts`（含迁移用例）、`TopBar.test.tsx`、`SettingsView.test.tsx`、`fontContract.test.ts`；`themeSwitchSuppression.test.ts` 保持通过。
- R10 规范：更新 `.trellis/spec/frontend/theme-switch.md`（签名去 accent）、`typography-tokens.md`（登记 `text-display-stat`；契约中“六主题 × 14 accent”改为两主题合成矩阵）、`font-preferences.md`（默认值与迁移）。

## 验收标准

- [ ] `rg "ctp-|catppuccin|data-accent|CatppuccinAccent" src` 只命中迁移代码及其测试。
- [ ] 6 种旧 flavor 值各自迁移到正确明暗（单测覆盖），迁移后旧 key 被删除；无旧值时跟随系统。
- [ ] 两主题对比度矩阵（含半透明合成）全部 ≥ 4.5:1。
- [ ] 主题切换无颜色插值闪灰（抑制契约测试绿 + 实机观察）。
- [ ] 新安装默认正文为 Geist；D-F1 的老用户路径有单测。
- [ ] 闪屏亮 / 暗截图，与首帧 canvas 无色差跳变。
- [ ] 亮 / 暗首屏截图（Dashboard、Central、Settings）存入 `research/`。
- [ ] `pnpm typecheck`、`pnpm lint`、定向 Vitest、`pnpm build`、`just ci` 全绿。

## 范围外

组件形状 / 胶囊化（C4）、侧栏布局（C5）、页面重排（C6–C8）、Mica（C3）。
