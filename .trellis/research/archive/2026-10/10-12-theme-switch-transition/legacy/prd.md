# 主题切换去掉误触发的颜色插值

## Goal

右上角主题按钮（以及所有写入主题 / 强调色的入口）切换后，页面直接落到目标主题。切换过程不再整页发灰，也不再因为卡片阴影和大量颜色过渡而卡顿。按钮 hover、按下缩放等原有交互动画保持。

## Background

用户在 Central Skills 网格上点击右上角「切换到浅色主题」。切换中段发灰、不自然，并且明显卡顿。

诊断见 `research/theme-switch-jank.md`。要点：

- 按钮调用 `setFlavor`，`applyFlavor`（`src/stores/themeStore.ts` 108–118 行）只改 `<html data-theme>`。
- Mocha 背景 `#1e1e2e`、正文 `#cdd6f4` 与 Latte 背景 `#eff1f5`、正文 `#4c4f69` 被现有 CSS 过渡做 sRGB 插值。中点分别约为 `rgb(135, 136, 146)` 和 `rgb(141, 147, 175)`，对比塌陷，所以中段发灰。
- `.central-skill-card-surface`（`src/index.css` 959–967 行）在 150ms 内插值 `background-color` 和三层 `color-mix()` 阴影。按钮、卡片标题、平台图标、侧栏另有 `transition-colors` 或 `transition-[color,box-shadow]`。虚拟化后视口里仍有多行卡片，主线程连续重算阴影。
- 太阳/月亮图标当帧替换，颜色却抹 150ms，两套时间轴叠在一起。
- Central 列表不订阅 theme store。卡顿不是 144 张卡片的 React 重渲染。
- 仓库没有主题转场编排。这段动画是 hover 过渡被变量跳变误触发。

## Requirements

- R1 主题与强调色提交时不插值颜色和阴影。`setFlavor` 与 `setAccent` 写入 `data-theme` / `data-accent` 时，页面上的 `color`、`background-color`、`border-color`、`box-shadow` 不得播放过渡。新颜色提交后再恢复这些过渡。
- R2 hover、focus、按下缩放保持。抑制只包住主题属性提交，不删除 `transition-colors`、卡片阴影 hover、图标 `active:scale`。
- R3 连续快速切换只恢复最后一次。前一次的恢复回调不得在下一次提交之前把过渡重新打开。
- R4 `init()` 不进入这套抑制。首屏仍同步写主题，避免依赖动画帧。
- R5 六个 flavor 与 14 个 accent 的持久化、`data-*` 结果、字体 mode 分类保持现有契约。亮色 / 暗色字体 profile 仍由 `main.tsx` 的订阅切换。
- R6 无新用户可见文案。

## Acceptance Criteria

- [ ] AC1：`setFlavor` / `setAccent` 在写入新 `data-theme` / `data-accent` 时带有过渡抑制标记；新颜色提交后标记清除。连续两次调用时，第一次的清除不得提前结束第二次的抑制。
- [ ] AC2：`init()` 不设置该标记。
- [ ] AC3：抑制规则覆盖 `html` 自身、后代，以及 `::before` / `::after`，并且压过组件上的 `transition`（含卡片 `box-shadow` 与 `transition-colors`）。规则不把 `animation` 清掉，避免加载指示器被重置。
- [ ] AC4：现有 `themeStore` 测试仍全部通过：六个 flavor、14 个 accent、localStorage、`fontThemeModeForFlavor`。
- [ ] AC5：顶栏图标、设置页 flavor / accent 选择仍只调用原来的 `setFlavor` / `setAccent`，不另写一套 DOM 主题入口。
- [ ] AC6：手工在 Central Skills 网格上点击右上角主题按钮，页面不再经过发灰中段，切换时不再连续卡顿；松开后卡片 hover 阴影和按钮 hover 颜色仍然有过渡。设置页切换 flavor 与 accent 同样直接落色。

## Out of Scope

- 不新增整页交叉淡化、View Transition 或圆形揭示。
- 不改 Catppuccin / Claude 色值、对比度契约、强调色映射。
- 不永久移除 hover / active 过渡，不改卡片阴影的 hover 形态。
- 不改字体 profile 的存储、分类和 DOM 应用契约。
- 不改虚拟列表行高、不改侧栏信息架构。

## Key Decisions

- D1：修法是在主题属性提交期间关掉过渡，而不是做一条新的主题动画。发灰中段来自 sRGB 插值，去掉插值即去掉这段动画。
- D2：抑制放在 `themeStore` 的 DOM 写入边界，顶栏和设置页共用。不在 `TopBar` 单独处理。
- D3：任务按多文件前端行为处理，需要 `design.md` 与 `implement.md`。

## Risks

- 为了让「过渡已关闭」和「新颜色」落在同一次样式计算里，提交时需要一次同步布局。这是单次成本，用来换掉约 150ms 的阴影插值。
- 抑制标记若在颜色提交前被清掉，过渡会照旧播放。测试必须锁住清除时序和连续切换。
- AC6 的观感不能由 jsdom 证明，需在运行中的界面手测。
