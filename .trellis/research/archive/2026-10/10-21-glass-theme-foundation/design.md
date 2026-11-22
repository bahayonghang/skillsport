# C2 设计

共享契约见父任务 `design.md` §2–§3、§5–§6。本文件只写 C2 特有决策。

## D-T1 主题 store 形状

```ts
export type ThemeFlavor = "glass-light" | "glass-dark";
export const THEME_FLAVORS: ThemeFlavor[] = ["glass-light", "glass-dark"];
export function fontThemeModeForFlavor(f: ThemeFlavor): FontThemeMode; // glass-light → light

interface ThemeState {
  flavor: ThemeFlavor;
  setFlavor(f: ThemeFlavor): void; // 保留 applyThemeDom 抑制
  toggleFlavor(): void;            // 顶栏 / 侧栏明暗开关用
  init(): void;
}
```

`setAccent`、`accent`、`ACCENT_NAMES`、`CatppuccinAccent` 删除。TypeScript 编译错误即为完整消费者清单。

## D-T2 迁移

```
readFlavor():
  v = localStorage["skillport-theme"]       → 合法则返回
  legacy = localStorage["catppuccin-flavor"]
    latte | claude-light                     → glass-light
    mocha | macchiato | frappe | claude-dark → glass-dark
  否则 prefers-color-scheme
init(): 写入新 key；删除 "catppuccin-flavor"、"catppuccin-accent"
```

删除旧 key 必须在新 key 写入成功之后；localStorage 不可用时静默降级，与现有行为一致。

## D-F1 正文字体默认值迁移（已决定：方案 A，2026-10-21 用户确认按推荐执行）

问题：`writeFontProfile` 在 v1→v2 迁移时写入全部字段，老用户的 `body_font_{light,dark}_v2` 可能是落盘的默认 `jetbrains`，与“主动选择”无法区分。

方案对比：

| 方案 | 行为 | 代价 |
| --- | --- | --- |
| A（推荐） | 新增一次性迁移标记 `font_defaults_v1_1_applied`；未标记时，若 `body_font_*_v2 === "jetbrains"` 且 `body_font_custom_*_v2` 为空，则改写为 `geist`，然后写标记 | 主动选择 JBM 的用户需要重选一次；CHANGELOG 明示 |
| B | 只改 `DEFAULT_FONT_PROFILE` | 大多数老用户仍是等宽正文，与新视觉割裂 |

迁移必须走现有按 key 串行的写入队列，并尊重 revision 合并保护（`font-preferences.md` §3）。

## D-T3 半透明对比度测试

`themeContrast.test.ts` 新增解析器：支持 `#rrggbb`、`rgb(r g b / a)`、以及 `color-mix(in oklch, <hex> N%, transparent)`（测试中把 oklch 混合近似为 sRGB alpha 合成，误差在注释中说明；若需要精确值则把 tint 改为显式 rgba token）。合成链路：canvas 采样点（from、to、各光斑峰值）→ 面板 → tint → 文字。断言每主题每文字角色在最不利点 ≥ 4.5。

## D-T4 Dashboard 过渡映射

`.surface-glass` 与 `.bg-orbit` 在本任务中改写为新层的别名（`.surface-glass` = `.glass-panel` 规则，`.bg-orbit` = 透明，因为 canvas 已在根上），保证 C2 合入后 Dashboard 视觉不破；C6 删除别名。`.readiness-*` 的 latte / claude-light 选择器随主题删除，暗 / 亮差异改用 token。

## D-T5 闪屏

`index.html` 在 React 之前渲染，只能用字面值；用 `@media (prefers-color-scheme: dark)` 在两套 glass 字面值之间选择。首帧之后 `init()` 写入的主题可能与系统不同（用户选过），闪屏到首帧有一次颜色变化——可接受，但两套字面值必须与 token 一致，测试锁定字面值与 token 同源（读取 index.html 与 index.css 比对）。
