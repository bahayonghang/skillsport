# 主题提交与颜色过渡抑制

> 建立于 2026-10-12（任务 10-12-theme-switch-transition）。主题切换不得借用 hover 过渡去插值语义色。

## 1. Scope / Trigger

修改 `data-theme`、`data-accent` 的写入，或给大面积表面加 `color` / `background-color` / `border-color` / `box-shadow` 过渡时适用。

顶栏主题按钮和设置页 flavor / accent 都只调用 `useThemeStore` 的 `setFlavor` / `setAccent`。组件不得自己写 `document.documentElement.dataset.theme` 或 `dataset.accent`。

## 2. Signatures

```ts
setFlavor(flavor: ThemeFlavor): void;
setAccent(accent: CatppuccinAccent): void;
init(): void;
```

提交期间的 DOM 标记是 `document.documentElement.dataset.themeSwitching = ""`，对应选择器 `html[data-theme-switching]`。它不是 Zustand 字段，组件不订阅。

## 3. Contracts

- `setFlavor` / `setAccent` 在同一次提交里：打上 `data-theme-switching`，写入 `data-theme` 或 `data-accent` 与 localStorage，读取 `offsetWidth` 强制样式提交，再在后续动画帧删除标记。
- 删除标记的回调必须核对提交序号。较新的一次提交会使较早的回调直接返回，标记留到最后一次提交之后。
- `html[data-theme-switching]` 规则放在 `@layer` 之外，覆盖 `html`、`*`、`*::before`、`*::after`，并且只设置 `transition: none !important`。
- 该规则不得设置 `animation: none`。加载指示器在切换时继续播放。
- `init()` 在首屏绘制前直接写 `data-theme` / `data-accent`，不打标记，不注册动画帧。
- hover、focus、按下缩放仍留在组件自己的 `transition` 上。抑制只包住主题属性提交。
- 不使用 `document.startViewTransition` 或整页交叉淡化来切换主题。

## 4. Validation & Error Matrix

| 条件 | 行为 |
| --- | --- |
| `document` 不存在 | 只执行写入回调，不打标记 |
| localStorage 写入失败 | 与原来一样吞掉，DOM 主题仍然更新 |
| 连续两次 `setFlavor` | 第一次动画帧回调不清除标记；第二次回调才清除 |
| `prefers-reduced-motion` | 原有缩短过渡的规则保留；主题提交仍走同一抑制 |
| 标记因动画帧未执行而残留 | 颜色已经是目标值；hover 过渡暂时不起作用 |

## 5. Good / Base / Bad Cases

- Good：Central 网格上点击顶栏主题按钮，背景和卡片阴影直接落到目标色，中段不发灰；标记清除后卡片 hover 阴影仍有过渡。
- Base：`init()` 使用已保存的 flavor，首屏没有 `data-theme-switching`。
- Bad：在 `TopBar` 里单独改 `dataset.theme`，或在 rAF 里先删标记再让浏览器做同一次样式计算。两种都会让 `transition-colors` 和卡片 `box-shadow` 把 Mocha `#1e1e2e` / `#cdd6f4` 插到 Latte `#eff1f5` / `#4c4f69`，中点发灰并卡住主线程。

## 6. Tests Required

- `src/test/stores/themeStore.test.ts`：`setFlavor` / `setAccent` 在强制布局时标记仍在，捕获的动画帧之后标记消失；连续两次 `setFlavor` 只有最后一帧清除标记；`init()` 不打标记且不调用 `requestAnimationFrame`。六个 flavor、14 个 accent、localStorage 与 `fontThemeModeForFlavor` 保持原断言。
- `src/test/contracts/themeSwitchSuppression.test.ts`：`src/index.css` 里该规则只有一条，位于 `@layer` 之外，包含 `transition: none !important`，声明块里没有 `animation`。

## 7. Wrong vs Correct

```ts
// Wrong: 顶栏直接改属性，颜色过渡会插值语义 token
document.documentElement.dataset.theme = "latte";

// Correct: 走 store。setFlavor 在写入期间抑制过渡，init 除外
useThemeStore.getState().setFlavor("latte");
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
