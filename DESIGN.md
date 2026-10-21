---
version: alpha
name: SkillPort
description: 轻盈毛玻璃（Light Glass）——薄荷到薰衣草的低饱和 canvas 上叠半透明白面板，一主一辅语义色，克制、清新、精致；重度用户的通透工作台。
colors:
  canvas-from: "#e6f5ef"
  canvas-to: "#ebeafa"
  canvas-blob-1: "rgba(205,238,226,0.70)"
  canvas-blob-2: "rgba(220,216,246,0.70)"
  canvas-blob-3: "rgba(216,235,246,0.70)"
  background: "#eef3f4"
  surface-panel: "rgba(255,255,255,0.62)"
  surface-sidebar: "rgba(255,255,255,0.58)"
  surface-overlay: "rgba(255,255,255,0.82)"
  surface-input: "rgba(255,255,255,0.55)"
  surface-hover: "rgba(31,42,55,0.05)"
  glass-stroke: "rgba(255,255,255,0.70)"
  glass-hairline: "rgba(31,42,55,0.06)"
  divider: "rgba(31,42,55,0.10)"
  input-stroke: "rgba(31,42,55,0.54)"
  ink: "#1f2a37"
  ink-muted: "#566170"
  mint: "#13805a"
  mint-hover: "#0f7350"
  on-mint: "#ffffff"
  mint-text: "#0f6e4b"
  mint-tint: "rgba(47,181,133,0.12)"
  mint-stroke: "rgba(19,128,90,0.28)"
  lavender: "#7c6ce0"
  lavender-text: "#5b4bc4"
  lavender-tint: "rgba(124,108,224,0.12)"
  amber-text: "#85570e"
  amber-tint: "rgba(183,134,42,0.12)"
  rose-text: "#b4233f"
  rose-tint: "rgba(194,86,111,0.12)"
  ring: "#13805a"
  chart-1: "#13805a"
  chart-2: "#7c6ce0"
  chart-3: "#3a8fb7"
  chart-4: "#a97a22"
  chart-5: "#c2566f"
  canvas-from-dark: "#0f1b1f"
  canvas-to-dark: "#18172b"
  canvas-blob-1-dark: "rgba(18,48,42,0.70)"
  canvas-blob-2-dark: "rgba(42,37,80,0.70)"
  canvas-blob-3-dark: "rgba(20,37,54,0.70)"
  background-dark: "#121a20"
  surface-panel-dark: "rgba(28,37,48,0.60)"
  surface-sidebar-dark: "rgba(28,37,48,0.56)"
  surface-overlay-dark: "rgba(30,40,52,0.84)"
  surface-input-dark: "rgba(15,23,32,0.40)"
  surface-hover-dark: "rgba(255,255,255,0.06)"
  glass-stroke-dark: "rgba(255,255,255,0.08)"
  glass-hairline-dark: "rgba(0,0,0,0.24)"
  divider-dark: "rgba(255,255,255,0.08)"
  input-stroke-dark: "rgba(255,255,255,0.36)"
  ink-dark: "#e7edf3"
  ink-muted-dark: "#a3afbd"
  mint-dark: "#4fd1a1"
  mint-hover-dark: "#3fc493"
  on-mint-dark: "#0b1f18"
  mint-text-dark: "#5fd6a8"
  mint-tint-dark: "rgba(79,209,161,0.12)"
  mint-stroke-dark: "rgba(79,209,161,0.30)"
  lavender-dark: "#a79bff"
  lavender-text-dark: "#b3a8ff"
  lavender-tint-dark: "rgba(167,155,255,0.12)"
  amber-text-dark: "#f0c06a"
  amber-tint-dark: "rgba(240,192,106,0.12)"
  rose-text-dark: "#ff8fa3"
  rose-tint-dark: "rgba(255,143,163,0.12)"
  ring-dark: "#4fd1a1"
  chart-1-dark: "#4fd1a1"
  chart-2-dark: "#a79bff"
  chart-3-dark: "#7cc4e4"
  chart-4-dark: "#f0c06a"
  chart-5-dark: "#ff8fa3"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  button:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  stat:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariantNumeric: "tabular-nums"
  mono:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  control: "12px"
  inner: "14px"
  card: "18px"
  shell: "20px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  page: "24px"
components:
  button-primary:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.on-mint}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  button-glass:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.ink}"
    borderColor: "{colors.glass-stroke}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  pill-status:
    backgroundColor: "{colors.mint-tint}"
    textColor: "{colors.mint-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "22px"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.ink}"
    borderColor: "{colors.glass-stroke}"
    rounded: "{rounded.card}"
    padding: "16px"
  stat-tile:
    backgroundColor: "{colors.mint-tint}"
    textColor: "{colors.ink}"
    labelColor: "{colors.ink-muted}"
    typography: "{typography.stat}"
    rounded: "{rounded.inner}"
    padding: "12px 14px"
  input:
    backgroundColor: "{colors.surface-input}"
    textColor: "{colors.ink}"
    placeholderColor: "{colors.ink-muted}"
    borderColor: "{colors.input-stroke}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
  nav-item-active:
    backgroundColor: "{colors.mint-tint}"
    textColor: "{colors.mint-text}"
    borderColor: "{colors.mint-stroke}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 12px"
  dialog:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.ink}"
    borderColor: "{colors.glass-stroke}"
    rounded: "{rounded.shell}"
    padding: "24px"
    backdropFilter: "blur(24px) saturate(140%)"
---
<!-- design-md: entry=style:glassmorphism; source=https://github.com/bergside/awesome-design-skills@f631a09; license=MIT -->
<!-- customized: SkillPort 1.1.0 light-glass; tokens from task 10-21-v1-1-glass-ui-redesign design.md §2 (contrast-adjusted: ink-muted, mint-text, amber-text, chart-4; added surface-input/hover, divider, input-stroke, mint-hover/stroke, rounded.inner, typography.button, canvas-blob-3-dark); all catalog generic values replaced; replaces Catppuccin control-room system (backup: .trellis/tasks/10-21-glass-design-source/research/DESIGN.catppuccin-backup.md) -->

# Design System: SkillPort

## Overview

**Creative North Star: "轻盈毛玻璃 / Light Glass"**

SkillPort 仍然是重度用户每天住在里面的工作台：把中央目录当作技能的唯一真源，一眼看清每个技能装在哪些平台、一次操作分发到位。1.1.0 改变的是**材质**，不是密度——从深色「控制室」换成「通透的工作台面」：大面积低饱和的薄荷 → 薰衣草渐变 canvas 上，叠放多层半透明白色面板；面板带 1px 白色半透明描边、顶部内高光与极淡的大范围阴影，靠层次而不是颜色制造纵深。

个性来自**材质与克制的语义色**：只有薄荷（主）与薰衣草（辅）两个强调色，各有固定语义；大号数字与粗标题突出重点，次要信息退为小号灰字；留白充足、分组清晰。工具仍然要消失在任务里。

这个系统明确**拒绝**：高饱和霓虹色、厚重阴影、发光与过度炫光、满屏真实模糊；千篇一律的 SaaS 仪表盘（渐变文字大数字、无差别卡片网格）；臃肿的企业级后台；超出圆角阶梯的气泡化玩具感；一眼能看穿的 AI 模板感。轻盈 ≠ 单薄；通透 ≠ 看不清。

**明暗切换规则.** 只有两个主题：`glass-light` 与 `glass-dark`（`html[data-theme]`）。两者**同构**——同一套组件、同一套圆角 / 间距 / 字体 / 层级，只替换颜色 token 的值。frontmatter 中每个颜色 token 都有同名加 `-dark` 后缀的暗色对应；组件里写的颜色引用在 `glass-dark` 下一律解析为其 `-dark` 对应（例如 `{colors.mint}` → `{colors.mint-dark}`）。首启无偏好时跟随 `prefers-color-scheme`；明暗切换的唯一入口在侧栏底部（与「收起」并列）。切换提交遵守 `.trellis/spec/frontend/theme-switch.md` 的过渡抑制契约，不出现颜色渐变闪烁。

**Key Characteristics:**
- 通透层次：canvas → 仿玻璃面板 → 真实模糊浮层，四层模型（见 Elevation & Depth）
- 一主一辅：薄荷 = 完成 / 输入 / 主操作；薰衣草 = 输出 / 次要数据
- 浅底优先：强调色多以 12% 浅底出现，实色只给主按钮、焦点与图形
- 无衬线正文：Geist 承担正文与界面，等宽只给代码 / 路径 / ID
- 大圆角 + 胶囊：卡片 18px、外壳 20px，按钮 / 标签 / 状态 / 激活导航用胶囊
- 本地优先的诚实：界面状态如实映射文件系统真相

**Dashboard 密度定位（沿用 2026-07-06 产品决策）.** Dashboard 单屏多区的高密度是有意的：Hero、就绪度、工作队列、平台、进度、活动、日志并置，让重度用户一屏扫完全局。1.1.0 不删区块，只把就绪度评分盘与计数改为 `stat-tile`，数据契约不变。密度类反馈以此为基准——要动的是层级与可读性，不是信息量。

## Colors

整体以白与浅灰为基调，强调色只有两个。下列取值为 `glass-light`；`glass-dark` 取同名 `-dark` token。所有取值均已按「面板合成在 canvas 最不利点上」的方法算过对比度（结果见 Known Gaps）。

### Canvas（L1，不承载交互）
- **Canvas Gradient**（`{colors.canvas-from}` `#e6f5ef` → `{colors.canvas-to}` `#ebeafa`）：全窗低饱和渐变，薄荷 → 浅薰衣草，方向自左上到右下。暗色为 `#0f1b1f` → `#18172b`。
- **Canvas Blobs**（`{colors.canvas-blob-1}` / `-2` / `-3`）：2–3 块 `radial-gradient` 光斑（alpha 0.70，边缘自然淡出），只点缀、不抢内容。**不得**用 `filter: blur` 生成光斑。
- **Background**（`{colors.background}` `#eef3f4` / 暗 `#121a20`）：不支持渐变处的兜底底色、启动闪屏与窗口初始底色。

### Surface（L2 / L3）
- **Surface Panel**（`{colors.surface-panel}`，白 62% / 暗 `rgba(28,37,48,0.60)`）：卡片、面板、表格容器、StatTile 的容器。
- **Surface Sidebar**（`{colors.surface-sidebar}`，白 58%）：浮动侧栏，比面板略透，退到内容之后。
- **Surface Overlay**（`{colors.surface-overlay}`，白 82%）：Dialog、Popover、Menu、Command、Sheet、Toast、sticky 条、玻璃按钮——不透明度更高，保证叠在任意内容上仍可读。
- **Surface Input**（`{colors.surface-input}`）：输入框内底；亮色比面板更白，暗色是一口更深的「井」。
- **Surface Hover**（`{colors.surface-hover}`）：ghost 按钮、列表行、导航项的 hover 填充（叠在面板上）。
- **Glass Stroke**（`{colors.glass-stroke}`，白 70% / 暗白 8%）：所有玻璃表面的 1px 描边，是材质边。
- **Glass Hairline**（`{colors.glass-hairline}`）：白描边在亮面板之间看不出时，补一圈极淡外细线；只用于区分相邻玻璃，不作装饰。
- **Divider**（`{colors.divider}`）：面板内的细分隔线（卡片 footer、列表分组）。
- **Input Stroke**（`{colors.input-stroke}`）：输入框、开关轨道、复选框等**需要被识别的控件边界**，对相邻表面 ≥ 3:1。

### Text
- **Ink**（`{colors.ink}` `#1f2a37` / 暗 `#e7edf3`）：正文与标题。
- **Ink Muted**（`{colors.ink-muted}` `#566170` / 暗 `#a3afbd`）：次要小灰字、元信息、占位符。占位符同样必须 ≥ 4.5:1，不得再压淡，也不得用 `/60` `/70` 透明前景。

### Accents（一主一辅）
- **Mint**（`{colors.mint}` `#13805a` / 暗 `#4fd1a1`）：主强调。实色只给主按钮填充（`{colors.on-mint}` 白字 4.93:1；暗色为深字 `#0b1f18`，8.96:1）、焦点环（`{colors.ring}`）、进度与图形。hover 为 `{colors.mint-hover}`。
- **Mint Text**（`{colors.mint-text}` `#0f6e4b` / 暗 `#5fd6a8`）：绿字——完成状态、文字链接「查看详情」、激活导航文字。
- **Mint Tint**（`{colors.mint-tint}`）+ **Mint Stroke**（`{colors.mint-stroke}`）：完成 / 输入类信息块的浅底与激活态细描边。
- **Lavender**（`{colors.lavender}` `#7c6ce0` / 暗 `#a79bff`）：辅强调。**只用于图形**（图标、图表序列、进度、计数点），不承载白字（白字 / 薰衣草实色仅 4.14:1，不达标）。
- **Lavender Text**（`{colors.lavender-text}` `#5b4bc4` / 暗 `#b3a8ff`）：紫字——输出类数据、次要数据标签。
- **Lavender Tint**（`{colors.lavender-tint}`）：输出 / 次要数据信息块的浅底。

### Status（低饱和，只用于状态）
- **Amber**（`{colors.amber-text}` `#85570e` + `{colors.amber-tint}`）：告警、待处理、部分成功。
- **Rose**（`{colors.rose-text}` `#b4233f` + `{colors.rose-tint}`）：错误与破坏性操作。破坏性按钮用「玫瑰浅底 + 玫瑰字」，不是满涂实心红块。

### Charts
| Token | Light | Dark | 角色 |
| --- | --- | --- | --- |
| `{colors.chart-1}` | `#13805a` | `#4fd1a1` | 薄荷，主序列 / 输入 |
| `{colors.chart-2}` | `#7c6ce0` | `#a79bff` | 薰衣草，次序列 / 输出 |
| `{colors.chart-3}` | `#3a8fb7` | `#7cc4e4` | 低饱和天蓝 |
| `{colors.chart-4}` | `#a97a22` | `#f0c06a` | 琥珀 |
| `{colors.chart-5}` | `#c2566f` | `#ff8fa3` | 玫瑰 |

图表序列在面板上 ≥ 3:1；必须同时用形状、标签或图例区分，不依赖色相。

### 代码映射（C2 实现时的唯一对照）
沿用 shadcn 语义变量名，**不改名**，让现有 utility 直接换值生效；只为新概念新增变量。

| DESIGN token | CSS 变量 |
| --- | --- |
| `canvas-from` / `canvas-to` / `canvas-blob-1..3` | `--canvas-from` / `--canvas-to` / `--canvas-blob-1..3`（新增） |
| `background` | `--background` |
| `surface-panel` / `surface-overlay` / `surface-sidebar` | `--card` / `--popover` / `--sidebar` |
| `surface-input` / `surface-hover` | `--input-surface`（新增）/ `--muted`、`--accent`（hover 填充） |
| `glass-stroke` / `glass-hairline` / `divider` / `input-stroke` | `--glass-stroke` / `--glass-hairline`（新增）/ `--border` / `--input` |
| `ink` / `ink-muted` | `--foreground`、`--card-foreground`、`--popover-foreground` / `--muted-foreground` |
| `mint` / `on-mint` / `mint-hover` | `--primary` / `--primary-foreground` / `--primary-hover`（新增） |
| `mint-text` / `mint-tint` / `mint-stroke` | `--primary-text`、`--success-foreground` / `--primary-tint` / `--primary-stroke`（新增） |
| `lavender` / `lavender-text` / `lavender-tint` | `--secondary-accent` / `--secondary-accent-text`、`--info-foreground` / `--secondary-accent-tint`（新增） |
| `amber-text` / `amber-tint` | `--warning-foreground` / `--warning-tint` |
| `rose-text` / `rose-tint` | `--destructive-text` / `--destructive-tint` |
| `ring` / `chart-1..5` | `--ring` / `--chart-1..5` |

frontmatter 用逗号 `rgba()` 以兼容 stitch 解析；代码层写成 `rgb(r g b / a)`，数值一致。tint 在代码层可写为 `color-mix(in oklch, <色> 12%, transparent)`，与 frontmatter 的 rgba 等价。

### Named Rules
**The Two-Accent Rule.** 全应用只有薄荷与薰衣草两个强调色，语义固定：**薄荷 = 完成 / 输入 / 主操作**，**薰衣草 = 输出 / 次要数据**。不得为某个页面引入第三个强调色；琥珀与玫瑰只表达告警与错误状态，不作装饰。

**The Tint-Not-Fill Rule.** 强调色优先以 12% 浅底（`*-tint`）出现，用来区分信息块；实色只给主按钮、焦点环与图形。非激活、非主操作的元素禁止使用强调实色。

**The Color-Is-Never-Alone Rule（沿用）.** 状态与图表除色相外，必须辅以图标、文字或形状。「已完成」胶囊要有文字或图标，输入 / 输出块要有 ↓ / ↑ 图标与标签，色弱用户同样可辨。

## Typography

**Display / Body Font:** Geist Variable（回退 ui-sans-serif / system-ui；中文走用户选择的系统 fallback，见 `.trellis/spec/frontend/font-preferences.md`）
**Mono Font:** JetBrains Mono Variable（回退 ui-monospace / monospace）

**Character:** 一款几何无衬线承担全部界面文字，清爽、现代、易扫读；等宽只作为「这是机器可读的值」的信号出现。用户仍可在设置中替换 Display / Body 字体与三档 `--font-scale`（0.875 / 1 / 1.125）。

### Hierarchy
| 角色 | Token | 规格 | Utility | 用途 |
| --- | --- | --- | --- | --- |
| Display | `{typography.display}` | Geist 600 / 1.6rem / 1.2 / -0.02em | 页面标题 | 页面级标题（PageHeader）、技能详情 / Markdown H1 |
| Title | `{typography.title}` | Geist 600 / 1rem / 1.4 | `text-base` | 卡片标题、面板小标题 |
| Body | `{typography.body}` | Geist 400 / 0.875rem / 1.6 | `text-sm` | 正文、主要控件、状态说明；散文行宽 ≤ 74ch |
| Button | `{typography.button}` | Geist 500 / 0.875rem / 1.2 | `text-sm font-medium` | 按钮文字 |
| Label | `{typography.label}` | Geist 500 / 0.75rem / 1.4 | `text-xs` | 分组标签、表头、胶囊、筛选组、控件标签——**正常大小写** |
| Stat | `{typography.stat}` | Geist 600 / 1.75rem / 1.1 / tabular-nums | `text-display-stat`（新增，登记于 `typography-tokens.md`） | StatTile 大号数字 |
| Mono | `{typography.mono}` | JetBrains Mono 400 / 0.6875rem / 1.5 | `font-mono text-ui-meta` | 代码、路径、ID、keycap、日志正文 |

`text-ui-micro`（0.625rem）保留给紧凑计数与坐标轴，规则沿用 `typography-tokens.md`。

### Named Rules
**The Sans-Body Rule.** 正文默认无衬线（Geist）。等宽只给代码、文件路径、技能 ID / uid、keycap、日志正文与 diff——即「复制出去还要能用」的值。不得把整段说明、按钮或标签写成等宽来「增加技术感」。

**The Big-Number Rule.** 需要突出的数量用 `{typography.stat}`，并且必须放在 `stat-tile`（tint 浅底块）或面板内，旁边配小号灰字标签与图标。数字颜色用 `{colors.ink}`，不用强调色、不用渐变文字（`background-clip: text`）、不加发光。

**The Fixed-Scale Rule（沿用）.** 产品 UI 用固定 rem 阶梯，不用随视口缩放的 clamp 标题；禁止 `text-[...]` arbitrary 字号与 inline `fontSize`（`typographyContract.test.ts` 守卫）。新增语义字号必须先登记 token。

**The Sentence-Case Rule.** 标签与分组头用正常大小写的小号灰字，不再默认全大写加宽字距。确需全大写的极短缩写（如 `MCP`、`CLI`）按原文保留。

## Layout

### Spacing
| Token | 值 | 典型用途 |
| --- | --- | --- |
| `{spacing.xs}` | 4px | 图标与文字间距、胶囊内图标 |
| `{spacing.sm}` | 8px | 同组控件间距、紧凑列表行内距 |
| `{spacing.md}` | 12px | 侧栏浮动留白、StatTile 内距（纵向） |
| `{spacing.lg}` | 16px | 卡片内距、表单字段间距 |
| `{spacing.xl}` | 20px | 卡片网格 gap |
| `{spacing.2xl}` | 24px | 页面分区间距、Dialog 内距 |
| `{spacing.page}` | 24px | 页面 gutter（内容区四周） |

### 结构
- **外壳**：canvas 铺满窗口；侧栏是一整块浮动玻璃面板，与窗口边缘保持 `{spacing.md}` 留白，圆角 `{rounded.shell}`。内容区不画外框，直接坐在 canvas 上。
- **页面标题区（PageHeader）**：粗标题（`{typography.display}`）左对齐；右侧放小号灰字元信息与页面级操作。标题区直接坐在 canvas 上，不包面板。
- **网格**：卡片网格 gap `{spacing.xl}`，列数沿用现有 auto-fill 规则；本次只换视觉，不改信息架构。
- **分组**：用留白与分组标签分组，而不是用嵌套边框。同一面板内的层级不超过两层（面板 → 内层块）。

### Named Rules
**The Density-With-Hierarchy Rule（沿用）.** 信息量不减，但每个密集界面都要有一个视觉焦点（粗标题或 stat）、一层次要信息（小灰字）与一致的节奏。层级靠字号、字重、留白与 tint 块表达，不靠更多边框。

## Elevation & Depth

### 四层模型
| 层 | 名称 | 内容 | 实现 | 真实 blur |
| --- | --- | --- | --- | --- |
| L0 | Window material | 窗口底 | Windows 11：Mica；其余：无 | OS 合成，不占 WebView 成本 |
| L1 | Canvas | 全窗渐变 + 2–3 块光斑 | `.glass-canvas`：`linear-gradient` + `radial-gradient`；固定在 AppShell 根，不随内容滚动 | 否 |
| L2 | Panel（仿玻璃） | 侧栏、卡片、面板、表格容器、StatTile 容器 | `.glass-panel`：半透明表面 + 1px `{colors.glass-stroke}` + 顶部内高光 + 极淡大阴影 | **否** |
| L3 | Chrome / Overlay | sticky 条、浮动操作条、Dialog / Popover / Menu / Command / Sheet / Toast | `.glass-overlay` / `.glass-sticky`：`{colors.surface-overlay}` + `backdrop-filter: blur(20px) saturate(140%)`（Dialog 24px） | **是**，仅白名单 |

L2 不用真实 blur 的理由：L2 面板下方是 L1 平滑渐变，模糊平滑渐变几乎没有可见变化；而 L2 数量多、随虚拟列表滚动，正是 2026-07 在 Windows WebView2 上实测的掉帧源。L3 下方才有内容滚过，模糊在这里有可见价值，且数量少。侧栏属于 L2——它下面是固定 canvas，没有内容滚过。

### Shadow Vocabulary
| 名称 | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `shadow-glass` | `inset 0 1px 0 rgb(255 255 255 / 0.55), 0 12px 40px -16px rgb(30 60 90 / 0.14)` | `inset 0 1px 0 rgb(255 255 255 / 0.06), 0 12px 40px -16px rgb(0 0 0 / 0.45)` | L2 静止 |
| `shadow-glass-hover` | `inset 0 1px 0 rgb(255 255 255 / 0.55), 0 16px 48px -16px rgb(30 60 90 / 0.18)` | `inset 0 1px 0 rgb(255 255 255 / 0.06), 0 16px 48px -16px rgb(0 0 0 / 0.55)` | L2 可交互卡片 hover（只加深一级） |
| `shadow-overlay` | `inset 0 1px 0 rgb(255 255 255 / 0.65), 0 24px 64px -24px rgb(30 60 90 / 0.22)` | `inset 0 1px 0 rgb(255 255 255 / 0.08), 0 24px 64px -24px rgb(0 0 0 / 0.60)` | L3 浮层 |

阴影永远是冷色、低不透明度、大半径、负扩散；不得出现实心深色投影、彩色发光（`0 0 Npx <强调色>`）或多层叠加的厚重阴影。

### 真实模糊白名单
真实 `backdrop-filter` 只存在于 `src/index.css` 的两个规则块：
- **`.glass-overlay`**：Dialog、Command、Menu（含下拉 / Popover）、Sheet、Toast、`BulkActionBar`。
- **`.glass-sticky`**：分组头（`CentralGroupedSkillList` / `PlatformGroupedSkillList`）、facet 头（`FacetSection`）、`CentralSidebar` sticky 条、`PlatformTransferRail` 等 sticky 条。

新增使用点必须先在此登记、再加类名。生产 TSX 不得出现任何 `backdrop-*` utility（契约测试守卫）。

### Window Material（Mica）
- Windows 11（22000+）上窗口底使用 OS 的 Mica 材质，canvas 带 alpha 透出 Mica；Windows 10 与其他不支持的环境使用**不透明** canvas 渐变，不使用 Acrylic 降级。
- 状态写在 `html[data-window-material="none" | "mica"]`，**默认 `none`**；只有 Rust 侧经显式命令 `set_window_material` 成功应用 Mica 后才切为 `mica`。方向永远是「先不透明、后通透」，不出现透明穿透或白闪。偏好 key `window_material_v1`；组件不直接 `invoke()`，经 store 获取。
- 主题切换时窗口 theme 同步，Mica 底色与明暗一致。窗口失焦时 Mica 由 OS 自动退化为纯色——这是系统行为，不是缺陷。

### Named Rules
**The Blur-Has-A-Reason Rule.** 真实模糊只给「有内容在下面滚过」的层，且只经 `.glass-overlay` / `.glass-sticky` 两个类。滚动内容里的卡片、面板、列表行、侧栏一律用仿玻璃（半透明 + 描边 + 高光），不得加 `backdrop-filter`。

**The Quiet-Depth Rule.** 纵深靠「canvas → 半透明面板 → 更不透明的浮层」的透明度阶梯与描边表达；阴影只是辅助，hover 只加深一级。

## Shapes

### Radius Scale
| Token | 值 | 用途 |
| --- | --- | --- |
| `{rounded.control}` | 12px | 输入框、分段控件、小图标按钮、下拉项 |
| `{rounded.inner}` | 14px | 卡片 / 外壳内部的块：StatTile、内嵌面板、代码块、图片框 |
| `{rounded.card}` | 18px | 卡片、面板、表格容器 |
| `{rounded.shell}` | 20px | 侧栏、页面级大容器、Dialog、Sheet |
| `{rounded.pill}` | 9999px | 按钮、标签、状态胶囊、激活导航项、开关轨道 |

### Rules
- **同心规则**：内层圆角严格小于外层——外壳 20 → 内层块 14 → 控件 12；卡片 18 → 内层块 14 → 控件 12。内层不得与外层同值，也不得超过外层。
- 阶梯外的圆角值（如 6 / 8 / 10 / 24 / 28px）一律不用；需要新值先改本节。
- **线性图标**：lucide，全局 `stroke-width: 1.75`，尺寸 16px（正文旁）/ 14px（胶囊内）/ 20px（侧栏导航）。不混用填充图标与线性图标；平台品牌图标除外。
- 图片与预览框用 `{rounded.inner}`，不加描边以外的装饰框。

## Components

所有交互组件都要写全 default / hover / focus-visible / active / disabled / loading / error 态（不适用的态注明）。**焦点环统一**：`outline: 2px solid {colors.ring}` + `outline-offset: 2px`，在面板与浮层上对比 ≥ 3:1（亮 4.45、暗 7.82）。按压反馈双轨沿用：`Button` 体系 `active:translate-y-px`；手写图标格 / 磁贴类 `active:scale-[0.96]`（唯一缩放档），过渡写明属性，禁止 `transition-all`。所有过渡 150–200ms，`prefers-reduced-motion` 下取消位移与缩放、只保留瞬切。

**button-primary** — 主操作。
- default：`{colors.mint}` 填充、`{colors.on-mint}` 文字、`{typography.button}`、`{rounded.pill}`、高 32px、内距 `0 14px`；图标 16px、间距 `{spacing.xs}`–`{spacing.sm}`。
- hover：填充 `{colors.mint-hover}`。focus-visible：统一焦点环。active：下压 1px。
- disabled：不透明度 0.5、无 hover 变化、原生 `disabled`。loading：保持宽度，图标位换 spinner，`aria-busy`。
- 单屏只出现一个主按钮。

**button-glass** — 次级操作（白色胶囊）。
- default：`{colors.surface-overlay}` 底、1px `{colors.glass-stroke}` 描边 + `{colors.glass-hairline}` 外细线、`{colors.ink}` 文字、`{rounded.pill}`、高 32px。
- hover：底叠 `{colors.surface-hover}`。focus-visible / active / disabled / loading：同 button-primary。
- 变体：**ghost**（透明底，hover `{colors.surface-hover}`，用于工具条与卡片内操作）；**destructive**（`{colors.rose-tint}` 底 + `{colors.rose-text}` 字，hover 浅底加深到 20%）；**link**（`{colors.mint-text}` 文字链接，hover 下划线，用于「查看详情」）。

**pill-status** — 状态胶囊。
- default：`{colors.mint-tint}` 底 + `{colors.mint-text}` 字、`{typography.label}`、`{rounded.pill}`、高 22px、内距 `0 10px`，前置 14px 图标或圆点。
- 语义变体：完成 / 已安装 = 薄荷；输出 / 次要信息 = 薰衣草（`{colors.lavender-tint}` + `{colors.lavender-text}`）；告警 = 琥珀；错误 = 玫瑰；中性 = `{colors.surface-hover}` + `{colors.ink-muted}`。
- 非交互；作为过滤器使用时按 button-glass 的交互态处理，选中态改为对应 tint + 1px 同色描边。必须带文字，不能只是色点。

**card** — L2 仿玻璃卡片 / 面板。
- default：`{colors.surface-panel}`、1px `{colors.glass-stroke}`、`shadow-glass`、`{rounded.card}`、内距 `{spacing.lg}`；footer 用 `{colors.divider}` 顶分隔线 + 小灰字 + 右侧文字链接。
- hover（仅可交互卡片）：`shadow-glass-hover`，不位移、不发光。focus-visible：统一焦点环。selected：1px `{colors.mint-stroke}` 描边 + 极浅 `{colors.mint-tint}` 叠底。disabled：不适用。loading：骨架块用 `{colors.surface-hover}`。error：顶部插入玫瑰 tint 提示条，文字说明原因。
- 不得 `backdrop-filter`；不得手写 `bg-white/60 ring-1 ...` 组合，一律经 `Card` primitive。

**stat-tile** — 大号数字块。
- anatomy：顶部 14px 图标 + `{typography.label}` 标签（`{colors.ink-muted}`），下方 `{typography.stat}` 数字（`{colors.ink}`），可选一行小灰字补充。
- default：`{colors.mint-tint}`（输入 / 完成类）或 `{colors.lavender-tint}`（输出 / 次要类）浅底、`{rounded.inner}`、内距 `12px 14px`；放在 card 内时同心递减。中性数量用 `{colors.surface-hover}` 底。
- 非交互；若可点击跳转，按 card 的 hover / focus-visible 处理。loading：数字位骨架，保持高度。error：数字位显示「—」+ 文字说明，不显示 0 冒充。
- 数字不着强调色、不渐变、不发光；输入 / 输出必须配 ↓ / ↑ 图标与文字标签。

**input** — 输入框 / 搜索框 / 选择器触发器。
- default：`{colors.surface-input}` 底、1px `{colors.input-stroke}`、`{colors.ink}` 文字、占位符 `{colors.ink-muted}`、`{rounded.control}`、高 32px、内距 `0 12px`。
- hover：描边加深到 `{colors.ink-muted}`。focus-visible：描边 `{colors.ring}` + 统一焦点环。disabled：不透明度 0.5、禁手势。error：`aria-invalid`，描边 `{colors.rose-text}` + 下方玫瑰字说明。loading（异步校验）：右侧 spinner。

**nav-item-active** — 侧栏导航项。
- default（非激活）：透明底、`{colors.ink-muted}` 文字 + 20px 线性图标、`{rounded.pill}`、高 32px、内距 `0 12px`；计数徽标用等宽 tabular-nums 小灰字。
- hover：`{colors.surface-hover}` 底、文字转 `{colors.ink}`。focus-visible：统一焦点环。
- active（当前路由）：`{colors.mint-tint}` 底 + 1px `{colors.mint-stroke}` 描边 + `{colors.mint-text}` 文字与图标。**无渐变填充、无发光、无左缘指示条**；`aria-current="page"` 与图标、字重共同表达，不只靠颜色。
- disabled：不适用。侧栏底部放「明暗切换」与「收起」两个次级入口，样式同非激活导航项。

**dialog** — Dialog / Sheet（L3）。
- default：`.glass-overlay`——`{colors.surface-overlay}`、1px `{colors.glass-stroke}`、`shadow-overlay`、`backdrop-filter: blur(24px) saturate(140%)`、`{rounded.shell}`、内距 `{spacing.2xl}`；遮罩为 canvas 色 30% 的半透明层，不再叠加模糊。
- 标题 `{typography.title}`，说明 `{typography.body}` + `{colors.ink-muted}`；底部操作右对齐，主操作 button-primary、取消 button-glass。
- open / close：150ms 淡入 + 2% 缩放；`prefers-reduced-motion` 下只淡入。焦点进入首个可操作元素，Esc 关闭，焦点归还触发器。error：内联玫瑰 tint 提示条。

**其余 primitives**（C4 实现，沿用上面的 token）：`Badge`（= pill-status 的计数 / 标签形态）、`Menu` / Popover / Command / `Toaster`（`.glass-overlay` + `{rounded.card}`，菜单项 `{rounded.control}`）、`Switch`（`{rounded.pill}` 轨道，关闭态 `{colors.input-stroke}` 描边，开启态 `{colors.mint}`）、`PageHeader`（见 Layout）。

### Signature: UnifiedSkillCard
全应用所有技能卡的**唯一实现**，通过显式场景 props 覆盖 central / platform / project / marketplace / collection 五种场景。视觉为 card 规格：标题 `{typography.title}`、描述 `{typography.body}` + `{colors.ink-muted}`、ID / 路径用 `{typography.mono}`；右上角 pill-status；平台图标两行（LOBSTER / CODING），点击即时切换安装 / 卸载，已安装为薄荷 tint 胶囊。**禁止**在各页面重建内联卡片。

### Signature: Dashboard
就绪度不再用锥形渐变评分盘，改为 stat-tile；计数行改为 stat-tile 行（输入 / 完成类薄荷，输出 / 次要类薰衣草）。Hero 与其余区块用 card；不再使用页面专属的玻璃表面类与径向背景。

## Do's and Don'ts

### Do
- **Do** 用 `Card` / `StatTile` / `Badge` / `Button` 等 primitives 组合页面；技能卡只用 `UnifiedSkillCard`。
- **Do** 让薄荷只表达完成 / 输入 / 主操作、薰衣草只表达输出 / 次要数据，并优先以 tint 浅底出现。
- **Do** 用透明度阶梯（canvas → 面板 → 浮层）和 1px 白描边表达层次。
- **Do** 用大号数字 + 粗标题突出重点，次要信息退为小号灰字，留足白。
- **Do** 给每个交互组件补齐全部状态，焦点环在任何玻璃表面上都清晰可见。
- **Do** 让界面状态如实映射文件系统真相——安装 / 链接 / 失败 / 跳过 / 冲突都要诚实呈现，不做乐观假象。
- **Do** 让状态与图表除色相外附带图标、文字或形状（WCAG 2.1 AA）。
- **Do** 把动效控制在 150–250ms 且只传达状态；尊重 `prefers-reduced-motion`，降级为淡入或瞬切。

### Don't
- **Don't** 用高饱和霓虹色、彩色发光（`box-shadow: 0 0 …` 强调色）、厚重或深色实心阴影、过度炫光。
- **Don't** 满屏真实模糊：不给滚动卡片、列表行、侧栏加 `backdrop-filter`；不在 TSX 里写 `backdrop-*` utility。
- **Don't** 用渐变文字（`background-clip: text`），也不给数字着强调色或加发光。
- **Don't** 用 `border-left/right > 1px` 的彩色侧边条装饰卡片、列表、告警或激活导航。
- **Don't** 引入第三个强调色或任何「主题 / 配色可选」入口。
- **Don't** 用阶梯外圆角，或让内层圆角 ≥ 外层。
- **Don't** 把正文、按钮、标签写成等宽，或把标签默认全大写加宽字距。
- **Don't** 用 `filter: blur` 做 canvas 光斑，或让 canvas 随内容滚动。
- **Don't** 手写 `bg-white/60 backdrop-blur ring-1 ...` 之类的表面组合绕过 primitives。
- **Don't** 用 fluid clamp 标题、`text-[...]` arbitrary 字号或 `/60` `/70` 透明前景承载有意义文字。
- **Don't** 用装饰性动效或不传达状态的 page-load 编排；工作台直接载入任务。

## Responsive Behavior

桌面应用，最小窗口 900×600（`tauri.conf.json` 的 `minWidth` / `minHeight`），默认 1200×800。

| 名称 | 窗口宽度 | 布局变化 |
| --- | --- | --- |
| compact | 900–1179px | 页面 gutter 降为 16px；侧栏浮动留白降为 `{spacing.sm}`；卡片网格先减列再缩卡片；PageHeader 元信息换到标题下一行 |
| regular | 1180–1439px | 默认 gutter `{spacing.page}`、侧栏留白 `{spacing.md}` |
| wide | ≥ 1440px | 同 regular，网格按 auto-fill 增列；散文行宽仍 ≤ 74ch |

- 侧栏折叠 / 拖拽调宽沿用现有行为（208px ↔ 56px，168–360px）；折叠后激活项仍是 tint 胶囊（仅图标）。
- 页面主体不得横向滚动；表格、代码块、日志在自身容器内横向滚动。
- 热区：可见尺寸 < 40px 的图标按钮用伪元素把热区扩到 ≥ 40×40px，相邻热区不得重叠（见 `.trellis/spec/frontend/icon-control-hit-area.md`）。
- 验收矩阵：亮 / 暗 × 字号三档 × 900×600 / 1280×800 / 1440×900 × 中 / 英，覆盖全部路由；无横向滚动、裁切、热区重叠。

## Iteration Guide

1. 先改本文件，再改代码；代码 token（`src/index.css`）必须与 frontmatter 一一对应，不得漂移。
2. 改任何颜色后，按 Known Gaps 的合成方法重算两主题全部文字 / 背景对；任一对 < 4.5:1（大字 < 3:1、控件边界与焦点 < 3:1）先调色再合入。`themeContrast.test.ts` 必须实现同一合成算法。
3. 新增强调色、主题、圆角值、语义字号、真实模糊使用点前，先在本文件对应章节登记并写明理由。
4. 新组件先查 primitives；确需新增，写全状态并在 Components 登记。
5. 改动 `PRODUCT.md` 的品牌表述时同步本文件 Overview。

### 1.1.0 已废止的规则（防止回退）
以下规则来自 1.0.x 的 Catppuccin「调度台」体系，已在 1.1.0 废止；不得以「恢复旧规则」为由重新引入。

| 已废止 | 原内容 | 废止原因 |
| --- | --- | --- |
| Theme-Is-Identity | 个性由 Catppuccin 4 风味（Mocha / Macchiato / Frappé / Latte）+ Claude 亮 / 暗共 6 套主题、14 种可切换 accent 承载 | 1.1.0 决策 D1：只保留玻璃亮 / 暗；多主题 × 多 accent 让对比度矩阵与视觉一致性无法收敛，个性改由材质与固定语义色承载 |
| Mono-Body | 正文默认 JetBrains Mono | 决策 D4：等宽正文在大段中文与说明文字上扫读成本高，与轻盈清新的方向冲突；等宽收窄为「机器可读的值」 |
| Glass-Is-Earned / Flat-By-Default | 玻璃只是 dashboard 营造点，表面默认扁平 | 玻璃成为默认材质；性能风险改由 Blur-Has-A-Reason 分层预算控制，而不是禁止玻璃 |
| 14px 圆角封顶 + Corner Exceptions 登记制 | 卡片封顶 `rounded-xl`，18px 仅限登记例外 | 新方向统一 16–20px 大圆角与胶囊；改为固定阶梯 + 同心规则，不再逐个登记例外 |
| 侧栏发光指示条 | 激活项渐变填充 + 强调色发光 + 左缘 3px 指示条 | 与「无发光、无彩色侧边条」冲突；改为 tint 浅底 + 细描边胶囊 |

## Known Gaps

### 对比度（合成法，2026-10-21 复算）
**方法**：canvas 取样点 = `canvas-from`、`canvas-to`，以及每块光斑（alpha 0.70）分别叠在两端色上；表面 = panel / sidebar / overlay 按各自 alpha 叠在每个取样点上；tint = 12% 浅底叠在每个 panel 合成色上。亮色取亮度最低的合成点（对深字最不利），暗色取亮度最高的合成点。所有混合为 sRGB source-over，与浏览器一致。表中为各表面在所有取样点上的**最小**比值。

最不利合成色：亮 canvas `#e0ddf7`、panel `#f3f2fc`、overlay `#faf9fe`、mint-tint `#dcebee`、lavender-tint `#e5e2f9`；暗 canvas `#112a27`、panel `#18272c`、overlay `#1c2832`、mint-tint `#1e3b3a`、lavender-tint `#303250`。

**glass-light**

| 文字 \ 表面 | canvas | panel | sidebar | overlay | mint-tint | lavender-tint | amber-tint | rose-tint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ink `#1f2a37` | 11.02 | 13.12 | 12.98 | 13.86 | 11.86 | 11.48 | 11.71 | 11.37 |
| ink-muted `#566170` | 4.77 | 5.68 | 5.62 | 5.99 | 5.13 | 4.97 | 5.06 | 4.92 |
| mint-text `#0f6e4b` | 4.75 | 5.66 | 5.59 | 5.97 | 5.11 | 4.95 | 5.05 | 4.90 |
| lavender-text `#5b4bc4` | 4.90 | 5.84 | 5.77 | 6.16 | 5.28 | 5.11 | 5.21 | 5.06 |
| amber-text `#85570e` | 4.73 | 5.63 | 5.57 | 5.95 | 5.09 | 4.93 | 5.02 | 4.88 |
| rose-text `#b4233f` | 4.89 | 5.83 | 5.77 | 6.15 | 5.27 | 5.10 | 5.20 | 5.05 |

**glass-dark**

| 文字 \ 表面 | canvas | panel | sidebar | overlay | mint-tint | lavender-tint | amber-tint | rose-tint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ink `#e7edf3` | 12.90 | 13.06 | 13.05 | 12.70 | 10.18 | 10.53 | 10.04 | 10.51 |
| ink-muted `#a3afbd` | 6.83 | 6.91 | 6.91 | 6.72 | 5.39 | 5.57 | 5.32 | 5.56 |
| mint-text `#5fd6a8` | 8.46 | 8.56 | 8.55 | 8.32 | 6.67 | 6.90 | 6.58 | 6.89 |
| lavender-text `#b3a8ff` | 7.22 | 7.31 | 7.30 | 7.10 | 5.69 | 5.89 | 5.62 | 5.88 |
| amber-text `#f0c06a` | 9.02 | 9.13 | 9.13 | 8.88 | 7.12 | 7.36 | 7.02 | 7.35 |
| rose-text `#ff8fa3` | 7.04 | 7.12 | 7.12 | 6.92 | 5.55 | 5.74 | 5.48 | 5.73 |

**填充与非文字**

| 对 | Light | Dark | 门槛 |
| --- | --- | --- | --- |
| on-mint / mint 填充 | 4.93 | 8.96 | 4.5 |
| ring / panel、overlay | 4.45 | 7.82 | 3.0 |
| input-stroke（叠在 input 底上）/ panel 与 input 底 | 3.17 | 3.08 | 3.0 |
| chart-1..5 / panel | 4.44 / 3.73 / 3.27 / 3.44 / 3.90 | 8.03 / 6.43 / 7.96 / 9.12 / 7.11 | 3.0 |
| 白字 / lavender 实色 | 4.14（不达标，故禁止） | — | 4.5 |

**组件状态对**（同一方法，取最小值）

| 对 | Light | Dark |
| --- | --- | --- |
| on-mint / mint-hover（主按钮 hover） | 5.85 | 7.79 |
| ink / panel + surface-hover | 11.98 | 10.94 |
| ink-muted / panel + surface-hover（中性胶囊、导航 hover） | 5.18 | 5.79 |
| ink-muted / sidebar + surface-hover（导航默认 / hover） | 5.13 | 5.79 |
| ink / overlay + surface-hover（玻璃按钮 hover） | 12.64 | 10.61 |
| ink-muted 占位符 / input 底（面板上 / 浮层上） | 6.01 / 6.15 | 7.41 / 7.29 |
| mint-text / mint-tint 叠在 sidebar 上（激活导航） | 5.06 | 6.67 |
| mint-text / mint-tint、lavender-text / lavender-tint 叠在 overlay 上 | 5.37 / 5.37 | 6.49 / 5.72 |
| rose-text / rose 浅底 20%（破坏性按钮 hover） | 4.57 | 4.73 |
| ink-muted / background（启动闪屏） | 5.62 | 7.89 |

### 相对父任务草案的调整
- 草案未把光斑叠在 `canvas-to` 上取样；补上后亮色 `ink-muted` / `mint-text` / `amber-text` 在裸 canvas 上降到 4.48 / 4.38 / 4.48。已分别从 `#5a6575` / `#11744f` / `#8a5a0f` 微调为 `#566170` / `#0f6e4b` / `#85570e`。
- 亮色 `chart-4` 从 `#b7862a`（对面板 2.93:1）调为 `#a97a22`（3.44:1）。
- 新增 `input-stroke`（控件边界 ≥ 3:1）、`surface-input`、`surface-hover`、`divider`、`mint-hover`、`mint-stroke`、`rounded.inner`、`typography.button` 与暗色第三块光斑 `canvas-blob-3-dark`。

### 尚未确定 / 未覆盖
- **Mica 下的对比度**：Mica 底色随壁纸与系统变化，无法穷举。按 canvas alpha 0.80 叠在代表性 Mica 底（亮 `#f3f3f3` / `#e9edf3` / `#f1ece6`，暗 `#202020` / `#1b2230` / `#262019`）上估算，所有文字对仍 ≥ 4.84（亮）/ ≥ 5.33（暗）。C3 选定 canvas alpha 时不得低于 0.80，除非用真机取样重算并更新本节。
- **Win10 无 Mica**：Windows 10 只有不透明 canvas；非 Windows 平台的窗口材质（如 macOS vibrancy）不在范围内。
- **触控热区**：桌面密集界面采用 40×40px 热区下限（低于通用 44px），沿用 `icon-control-hit-area.md`。
- **disabled 态**：不透明度 0.5 的文字不满足 4.5:1，按 WCAG 豁免处理，必须同时有不可操作语义。
- **中文字体**：Geist 无中文字形，中文走系统 fallback（可选系统已安装的 Source Han），不随安装包分发。
- **性能**：真实模糊白名单的滚动表现需 Windows 真机 WebView2 证据（Central ≥ 300 技能网格、Dashboard、Usage），本文件不能代替实测。
- **视觉参考**：规划期参考截图只用于提炼视觉语言（材质、配色语义、圆角、层级），不复制其产品、信息架构或文案。
