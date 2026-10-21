# 语义字号与 no-growth 排版契约

> 建立于 2026-07-18（任务 07-18-dense-typography-wcag）。高密度排版从散落固定 px 收敛为可缩放、可测试的语义层级，并阻止任意字号继续增长。字体 profile/fallback/Scale 选项仍由 [font-preferences.md](./font-preferences.md) 拥有，本规范只治理字号与前景角色。

## 1. Scope / Trigger

修改任何 `src/**/*.ts(x)` 中的字号 utility、新增小字标签/状态/计数、或在 `src/index.css` 的 `@theme inline` 边界增删语义字号 token 时适用。组件不得自行拼 `text-[...]` arbitrary 字号或 arbitrary 颜色，也不得用 inline `style` fontSize 绕过契约。

## 2. Semantic type ladder

| 角色 | Utility | 默认尺寸 | 用途 |
| --- | --- | ---: | --- |
| 正文 / 操作 | `text-sm` 或现有组件尺寸 | 0.875rem | 正文、主要控件、持续阅读的状态说明 |
| Label | `text-xs` | 0.75rem | section、status、action、table header、badge、filter group、dialog/control label 等决策相关标签 |
| UI meta | `text-ui-meta` | 0.6875rem | 次要 metadata、ID、路径、keycap、frontmatter/preview pre、紧凑辅助说明 |
| UI micro | `text-ui-micro` | 0.625rem | 紧凑数字计数、heatmap 坐标轴、冗余 chevron/step marker、`aria-hidden` 装饰 glyph |
| Stat | `text-display-stat` | 1.75rem | StatTile 大号数字（DESIGN.md `typography.stat`）；调用方配 `font-semibold tabular-nums`，数字用 `text-foreground`，不着强调色、不渐变、不发光；只出现在 tint 浅底块或面板内并配小号灰字标签 |

规则：
- `section` / `status` / `action` label 至少 `text-xs`，不落入 `text-ui-meta` / `text-ui-micro`。
- `code` / `path` / `id` / 快捷键 / 重复 metadata 使用 `text-ui-meta`。
- `text-ui-micro` 仅用于紧凑计数、坐标轴或已有等价可访问名称的辅助标记；纯装饰 glyph 必须同时 `aria-hidden`。
- 不要新增 `text-ui-label` 同义 token：标准 `text-xs` 已表达该层级。不要把 11px 一对一替换为 meta；先按角色分类，真正的 label 提升到 `text-xs`，路径/ID/辅助信息才使用 meta。
- 状态重要性通过 weight、foreground、icon 和位置表达，不通过再造 10.5px/11.5px 值表达。
- 1.1.0 C6 起 Dashboard 不再有专属 display 字号：`text-display-hero` / `text-display-hero-xl` / `text-display-score` 已从 `@theme` 与 `cn()` 注册中删除；就绪度评分与计数改用 `StatTile`（`text-display-stat`），页面标题改用 `PageHeader`。不得恢复这三个 token。

## 3. Scale contract

- 所有语义字号 token 在 `src/index.css` 的 `@theme inline` 边界用 `rem` 声明，只定义 `font-size`，不覆盖 `line-height`；`leading-*` 继续由拥有布局语义的组件控制。
- 根级 `font-size: calc(16px * var(--font-scale))`（0.875 / 1 / 1.125 三档）驱动全部 rem token；不得新增 viewport 驱动字号、运行时 DOM 扫描或组件内字号计算。
- 默认 Scale=1 时 `text-ui-meta`（11px）与 `text-ui-micro`（10px）保持迁移前几何，避免机械放大造成密度回退；只有从微型文本提升为真正 label/body 的角色才允许有依据地增大。
- 固定高度虚拟化消费者通过 `subscribeAppliedFontScale()` / `getAppliedFontScale()` 订阅已应用 Scale，不读取 computed style、不扫描 DOM。Central 只在 `centralVirtualItemHeight()` 中维护 list/grid、comfortable/compact 的高度映射；不得把该修正扩散成通用动态测量 virtualizer，也不得改变阈值或 overscan。

## 4. No-growth contract

- 生产 `src/**/*.ts(x)`（排除 `src/test/**`）禁止整个 `text-[...]` arbitrary 家族：包括 `text-[Npx]`、`text-[Nrem]`、`text-[Nem]`、`text-[calc(...)]`、`text-[clamp(...)]` 与 arbitrary `text-[#hex]` 颜色。
- 不保留按文件/行号或按数值的 allowlist；确需保留的 deliberate display 几何也必须使用命名语义 token（如 `text-display-*`），不得继续写 arbitrary class。
- 颜色必须通过 theme token / named utility 表达，不能借 arbitrary syntax 绕过字号或颜色契约。
- 生产 TS/TSX 同时禁止 inline `fontSize`；scale specimen 直接使用 `text-base` 并自然继承根字号，不能把 `scale rem` 再叠加到已缩放 root 上。
- 守卫由 `src/test/contracts/typographyContract.test.ts` 在 CI 期读取源码实现，不进入生产 bundle，不增加运行时 observer / resize listener / 扫描逻辑。

## 5. Contrast contract

- 承载标签、状态、路径、错误、来源、操作或用户决策的小字，在实际 `background` / `card` / `popover` / `sidebar` / 状态 surface 上达到 WCAG 2.1 AA 普通文本 4.5:1。
- 有意义文本默认不使用 `/60` `/70` `/80` 透明前景色；`primary` 用于填充/强调，薄荷强调文字使用已测的 `text-primary-text`，薰衣草（输出 / 次要数据）文字使用 `text-secondary-accent-text`；`success` / `warning` / `info` 使用现有 semantic foreground，不新增硬编码组件色。
- Destructive 分为两个角色：普通 surface 上的错误文字/图标使用 `text-destructive-text`；`bg-destructive` 填充上的反色文字使用 `text-destructive-foreground`。不得用填充色 `text-destructive` 直接承载小字错误信息。
- `disabled` 或纯装饰例外必须同时具有不可操作语义/等价 label 并记录在任务 research 决策表；不建立按行号 allowlist。
- 1.1.0 起只有 `glass-light` / `glass-dark` 两个主题，表面是半透明的。对比度一律在**合成色**上计算（sRGB source-over，与 WebView2 一致）：canvas 取样点 = `canvas-from`、`canvas-to`、每块光斑分别叠在两端色上；`card` / `sidebar` / `popover` 叠在每个取样点上；四种 12% tint 叠在每个 panel / sidebar / overlay 合成色上；取全部合成点的最小比值。不得只测不透明 hex。
- 测试基线为 `src/test/contracts/themeContrast.test.ts`（两主题 × 文字角色 × canvas / panel / sidebar / overlay / hover 叠层 / 四种 tint 的合成矩阵，另含填充前景、焦点环、input 描边与 chart ≥ 3:1、闪屏字面值与 token 同源），新治理扩展该测试，不引入第二套颜色或字体模型。

## 6. Tests Required

- `src/test/contracts/typographyContract.test.ts`：扫描生产 TS/TSX，断言无任何 `text-[...]`、无 arbitrary size/color、无 inline `fontSize`、`--text-ui-meta`/`--text-ui-micro` 存在、无 viewport 字号。
- `src/test/contracts/fontContract.test.ts`：token 在 `@theme inline` 用 rem 声明、不覆盖 line-height、阶梯 `micro < meta < xs`、由根 `--font-scale` 驱动。
- `src/test/contracts/themeContrast.test.ts`：两主题全部文字角色（foreground / muted / primary-text / secondary-accent-text / success / info / warning / destructive-text …）在 canvas、panel、sidebar、overlay、hover 叠层与四种 tint 的最不利合成点上 ≥ 4.5:1；`primary-foreground` / `destructive-foreground` 在各自填充上 ≥ 4.5:1；`ring`、input 描边、chart-1..5 ≥ 3:1。
- `src/test/contracts/fontContract.test.ts`：`--text-display-stat` 为 rem、不带 line-height。
- `src/test/lib/centralSkillGrid.test.ts`：三档 Scale 下锁定 Central list/grid、comfortable/compact 固定高度映射；真实浏览器另验相邻边界、scroll overflow 与首末项可达。
- 改动后至少运行定向 Vitest、`pnpm typecheck`、`pnpm lint`、`pnpm build` 与 `just ci`。

## 7. Wrong vs Correct

```tsx
// Wrong: arbitrary px/rem 字号 + alpha 前景，绕过 token 与对比度契约
<span className="font-mono text-[11px] text-muted-foreground/80">{path}</span>

// Wrong: 用 arbitrary color 绕过颜色契约
<span className="text-[#a6adc8]">label</span>

// Wrong: 把填充色直接用于普通 surface 上的错误文字
<span className="text-xs text-destructive">Failed</span>

// Correct: 次要路径用 meta + 完整已测 foreground；状态/section label 至少 text-xs
<span className="font-mono text-ui-meta text-muted-foreground">{path}</span>
<span className="text-xs font-medium text-muted-foreground">Source</span>
<span className="text-xs text-destructive-text">Failed</span>
```
