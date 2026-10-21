# 主题提交与颜色过渡抑制

> 建立于 2026-10-12（任务 10-12-theme-switch-transition）。主题切换不得借用 hover 过渡去插值语义色。
> 2026-10-21（任务 10-21-glass-theme-foundation）：主题收敛为 `glass-light` / `glass-dark` 两个，accent 概念删除，新增 `toggleFlavor` 与旧偏好迁移。
> 2026-10-21（任务 10-21-glass-window-material）：主题提交后同步原生窗口材质 / 窗口主题，见 [window-material.md](./window-material.md)。

## 1. Scope / Trigger

修改 `data-theme` 的写入、主题持久化 / 迁移，或给大面积表面加 `color` / `background-color` / `border-color` / `box-shadow` 过渡时适用。

顶栏 / 侧栏明暗开关只调用 `toggleFlavor`，设置页明暗二选一只调用 `setFlavor`。组件不得自己写 `document.documentElement.dataset.theme`。`data-accent` 已废止，不得重新引入。

## 2. Signatures

```ts
type ThemeFlavor = "glass-light" | "glass-dark";
const THEME_FLAVORS: ThemeFlavor[]; // ["glass-light", "glass-dark"]
fontThemeModeForFlavor(flavor: ThemeFlavor): FontThemeMode; // glass-light → light

setFlavor(flavor: ThemeFlavor): void;
toggleFlavor(): void; // glass-light ↔ glass-dark，内部走 setFlavor
init(): void;
```

localStorage key：`skillport-theme`。旧 key `catppuccin-flavor` / `catppuccin-accent` 只在 `init()` 迁移时读取一次。

提交期间的 DOM 标记是 `document.documentElement.dataset.themeSwitching = ""`，对应选择器 `html[data-theme-switching]`。它不是 Zustand 字段，组件不订阅。

## 3. Contracts

- `setFlavor`（含 `toggleFlavor`）在同一次提交里：打上 `data-theme-switching`，写入 `data-theme` 与 localStorage，读取 `offsetWidth` 强制样式提交，再在后续动画帧删除标记。
- 删除标记的回调必须核对提交序号。较新的一次提交会使较早的回调直接返回，标记留到最后一次提交之后。
- `html[data-theme-switching]` 规则放在 `@layer` 之外，覆盖 `html`、`*`、`*::before`、`*::after`，并且只设置 `transition: none !important`。
- 该规则不得设置 `animation: none`。加载指示器在切换时继续播放。
- `init()` 在首屏绘制前直接写 `data-theme`，不打标记，不注册动画帧。
- `init()` 解析顺序：`skillport-theme` 合法值 → 旧 `catppuccin-flavor`（`latte` / `claude-light` → `glass-light`；`mocha` / `macchiato` / `frappe` / `claude-dark` → `glass-dark`）→ `prefers-color-scheme`。新 key 写入成功后才删除 `catppuccin-flavor` 与 `catppuccin-accent`，并清掉残留的 `html[data-accent]`。
- hover、focus、按下缩放仍留在组件自己的 `transition` 上。抑制只包住主题属性提交。
- 不使用 `document.startViewTransition` 或整页交叉淡化来切换主题。
- 窗口材质同步在主题提交**之后**：`windowMaterialStore` 订阅 `themeStore.flavor`，`setFlavor` / `toggleFlavor` 完成 `data-theme` 提交并 `set({ flavor })` 后才调用 `syncTheme(dark)` → `set_window_material`（Mica 用 `MicaLight` / `MicaDark`，否则只 `set_theme`）。原生调用是异步的，不得放进 `applyThemeDom` 的抑制窗口，也不得阻塞 `data-theme` 写入；`init()` 不触发同步（材质 store 自己的 `init()` 负责首个请求）。组件不得自行调用该命令。

## 4. Validation & Error Matrix

| 条件 | 行为 |
| --- | --- |
| `document` 不存在 | 只执行写入回调，不打标记 |
| localStorage 写入失败 | 与原来一样吞掉，DOM 主题仍然更新；`init()` 保留旧 key 不删除 |
| localStorage 读取抛错 | 跟随 `prefers-color-scheme`，不抛出 |
| 新 key 非法、旧 key 也非法或缺失 | 跟随 `prefers-color-scheme`，并写入新 key |
| 连续两次 `setFlavor` | 第一次动画帧回调不清除标记；第二次回调才清除 |
| `prefers-reduced-motion` | 原有缩短过渡的规则保留；主题提交仍走同一抑制 |
| 标记因动画帧未执行而残留 | 颜色已经是目标值；hover 过渡暂时不起作用 |

## 5. Good / Base / Bad Cases

- Good：Central 网格上点击顶栏主题按钮，背景和卡片阴影直接落到目标色，中段不发灰；标记清除后卡片 hover 阴影仍有过渡。
- Base：`init()` 使用已保存的 flavor，首屏没有 `data-theme-switching`。
- Migration：1.0.x 用户存有 `catppuccin-flavor = frappe`，首启落到 `glass-dark`，旧两个 key 被删除。
- Bad：在 `TopBar` 里单独改 `dataset.theme`，或在 rAF 里先删标记再让浏览器做同一次样式计算。两种都会让 `transition-colors` 和卡片 `box-shadow` 把 glass-dark `#121a20` / `#e7edf3` 插到 glass-light `#eef3f4` / `#1f2a37`，中点发灰并卡住主线程。

## 6. Tests Required

- `src/test/stores/themeStore.test.ts`：`setFlavor` / `toggleFlavor` 在强制布局时标记仍在，捕获的动画帧之后标记消失；连续两次 `setFlavor` 只有最后一帧清除标记；`init()` 不打标记且不调用 `requestAnimationFrame`。两个 flavor、`toggleFlavor`、`fontThemeModeForFlavor`、六种旧 flavor 迁移、旧 key 删除、写入失败保留旧 key、读取抛错降级。
- `src/test/stores/windowMaterialStore.test.ts`：`setFlavor` / `toggleFlavor` 之后各触发一次 `set_window_material`，重复 `init()` 不重复订阅。
- `src/test/contracts/themeSwitchSuppression.test.ts`：`src/index.css` 里该规则只有一条，位于 `@layer` 之外，包含 `transition: none !important`，声明块里没有 `animation`。

## 7. Wrong vs Correct

```ts
// Wrong: 顶栏直接改属性，颜色过渡会插值语义 token
document.documentElement.dataset.theme = "glass-light";

// Correct: 走 store。setFlavor / toggleFlavor 在写入期间抑制过渡，init 除外
useThemeStore.getState().toggleFlavor();
```

```css
/* Wrong: 关掉动画会让加载指示器从头播放 */
html[data-theme-switching] * {
  transition: none !important;
  animation: none !important;
}

/* Correct: 只切断过渡 */
html[data-theme-switching],
html[data-theme-switching] *,
html[data-theme-switching] *::before,
html[data-theme-switching] *::after {
  transition: none !important;
}
```
