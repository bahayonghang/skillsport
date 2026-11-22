# 主题切换卡顿诊断

2026-10-12。用户在 Central Skills（截图约 144 条技能、网格卡片）点击右上角太阳/月亮按钮，切换过程卡顿，过渡中段发灰、不自然。

## 触发路径

右上角按钮只做 flavor 对切，不经过设置页：

- `src/components/layout/TopBar.tsx` `FLAVOR_TOGGLE_MAP`（约 24–31 行）：`mocha|macchiato|frappe → latte`，`claude-dark → claude-light`，反向同理。
- `handleToggleTheme`（约 89–91 行）调用 `setFlavor`。
- `src/stores/themeStore.ts` `applyFlavor`（108–118 行）同步写 `document.documentElement.dataset.theme`，再 `set({ flavor })`。
- 设置页的 flavor / accent 按钮走同一个 `setFlavor` / `setAccent`（`settingsViewBindings.ts` 114–117 行）。

React 订阅面很小：`TopBar`、设置页、`main.tsx` 里按 light/dark 切字体 profile。Central 卡片列表不订阅 theme store，切换不会把 144 张卡片重渲染一遍。卡顿不是整树 React reconcile。

## 颜色为什么会“播动画”

主题不是改 class，而是替换 `<html data-theme>` 上的一整组语义色。Mocha 与 Latte 的端点：

| token | mocha | latte |
| --- | --- | --- |
| `--background` | `#1e1e2e` | `#eff1f5` |
| `--foreground` | `#cdd6f4` | `#4c4f69` |
| `--card` | `#181825` | `#e6e9ef` |

这些 hex 没有注册成可动画的 `@property`。真正在播的是元素自己的 `transition`：计算后的 `color` / `background-color` / `border-color` / `box-shadow` 会在变量跳变时做 sRGB 插值。

会跟上这次跳变的样式包括：

- `src/index.css` `.central-skill-card-surface`（959–967 行）：`transition-property: background-color, box-shadow, scale`，150ms。阴影是三层 `color-mix(in srgb, var(--foreground)|var(--primary)|var(--border) …)`。
- `src/components/ui/button-variants.ts`：全部按钮 `transition-colors duration-150`。
- `UnifiedSkillCard.tsx`、`UnifiedSkillCardFooter.tsx`、`UnifiedSkillCardParts.tsx`：标题 `transition-[color,box-shadow]`，平台图标 `transition-[scale,background-color,color]`。
- 侧栏、顶栏、输入框等大量 `transition-colors`（src 内至少 80 处）。

Central 网格是虚拟化的（`VirtualizedGrid`，`overscanRows = 4`），但视口内仍有多行卡片。每张卡片同时插值背景、三层阴影，以及页脚多个图标的文字色和背景色。`box-shadow` 插值每帧都在主线程重算 `color-mix`，这是卡顿的主体。

## 中段为什么不自然

sRGB 从深色插到浅色，中点落在灰上，而不是“暗画面淡出、亮画面淡入”：

- 背景 `#1e1e2e` → `#eff1f5` 的中点约为 `rgb(135, 136, 146)`。
- 正文 `#cdd6f4` → `#4c4f69` 的中点约为 `rgb(141, 147, 175)`。

中段背景和文字亮度靠近，对比塌掉，整页发灰。卡片阴影、按钮（ease-in-out 150ms）和卡片表面（ease-out 150ms）缓动不同，灰段还对不齐。太阳/月亮图标是条件渲染，当帧就换掉，页面颜色却还在抹 150ms，图标和底色是两套时间轴。

仓库里没有 `startViewTransition` 或主题过渡编排。用户看到的动画是 hover 过渡被主题变量跳变误触发。

## 排除项

- 默认字体 profile 下，`main.tsx` 35–39 行的 `activateFontTheme` 会把 light/dark 写成同一套 `data-display-font` / `data-body-font`。相同 attribute 值不会再触发字体加载。只有用户把亮色和暗色字体设成不同时，同一次点击才会额外做字体布局。字体契约不改。
- `prefers-reduced-motion` 已把过渡压到 0.01ms（`src/index.css` 157–167 行）。本次要修的是默认开启动画的路径。
- `init()` 在首屏绘制前同步写主题，不是这次点击卡顿的来源。

## 结论

点击时不要让已有的 color / shadow 过渡去插值主题 token。在写入 `data-theme` / `data-accent` 的同一时刻关掉过渡，等新颜色提交后再恢复，hover 过渡保持原样。不做整页交叉淡化或圆形揭示：那是另一套动画，而且快照重页面仍可能卡一下。
