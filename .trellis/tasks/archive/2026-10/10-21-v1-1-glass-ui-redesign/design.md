# 设计：1.1.0 轻盈毛玻璃体系（跨子任务技术设计）

本文件定义所有子任务共享的结构与契约。具体 token 数值以 C1 定稿后的 `DESIGN.md` 为准；这里的数值是**已通过对比度预算的草案**（计算脚本思路见 §6），C1 可微调，但须保持 §6 的预算。

## 1. 分层模型（四层，一条规则：真实 blur 只给“有内容在下面滚过”的层）

| 层 | 名称 | 内容 | 实现 | 真实 blur |
| --- | --- | --- | --- | --- |
| L0 | Window material | 窗口底 | Win11：Tauri `Effect::Mica`；其余：无 | OS 合成，不占 WebView 成本 |
| L1 | Canvas | 全窗渐变 + 2–3 块光斑 | `.glass-canvas`：`linear-gradient` + `radial-gradient` 光斑（**不用 `filter: blur`**）；固定在 AppShell 根，不随内容滚动；Mica 可用时整体带 alpha | 否 |
| L2 | Panel（仿玻璃） | 侧栏、卡片、面板、表格容器、StatTile 容器 | `.glass-panel`：半透明白 / 半透明墨 + 1px 白描边 + inset 顶部高光 + 极淡大阴影 | **否**（滚动内容，07-20 性能结论） |
| L3 | Chrome / Overlay | sticky 条、浮动操作条、Dialog / Popover / Command / Toast / 下拉 | `.glass-overlay`：更高不透明度 + `backdrop-filter: blur(var(--glass-blur)) saturate(140%)` | **是**，仅登记白名单 |

为什么 L2 不用真实 blur：L2 面板下方是 L1 平滑渐变，模糊平滑渐变几乎没有可见变化；而 L2 数量多且随虚拟列表滚动，正是 07-20 实测的掉帧源。L3 才有内容从下方滚过，blur 在这里有可见价值，且数量少。

侧栏属于 L2：它下面是固定 canvas，没有内容滚过。

## 2. Token 草案

命名延续 shadcn 语义 token（`--background`、`--card`、`--primary`…），**不改名**，保证现有 utility（`bg-card`、`text-muted-foreground`、`ring-ring`）直接换值生效；只为新概念新增 token。

### 2.1 颜色（glass-light）

| Token | 值 | 角色 |
| --- | --- | --- |
| `--canvas-from` / `--canvas-to` | `#e6f5ef` / `#ebeafa` | 薄荷 → 薰衣草渐变 |
| `--canvas-blob-1/2/3` | `#cdeee2` / `#dcd8f6` / `#d8ebf6`（radial，alpha 0.7） | 光斑 |
| `--background` | `#eef3f4` | 不支持渐变处的兜底底色、闪屏 |
| `--card` / `--popover` / `--sidebar` | `rgb(255 255 255 / 0.62)` / `0.82` / `0.58` | L2 / L3 / 侧栏表面 |
| `--glass-stroke` | `rgb(255 255 255 / 0.70)` | 1px 白描边 |
| `--glass-hairline` | `rgb(31 42 55 / 0.06)` | 白描边在亮底上不可见时的外圈细线 |
| `--foreground` | `#1f2a37` | 正文 / 标题 |
| `--muted-foreground` | `#5a6575` | 次要小灰字 |
| `--primary` | `#13805a`（填充，白字 4.93:1） | 主强调：薄荷绿 = 完成 / 输入 / 主操作 |
| `--primary-text` | `#11744f` | 绿字 |
| `--primary-tint` | `color-mix(in oklch, #2fb585 12%, transparent)` | 绿色信息块浅底 |
| `--secondary-accent` | `#7c6ce0` | 辅强调：薰衣草紫 = 输出 / 次要数据 |
| `--secondary-accent-text` | `#5b4bc4` | 紫字 |
| `--secondary-accent-tint` | `color-mix(in oklch, #7c6ce0 12%, transparent)` | 紫色信息块浅底 |
| `--warning-foreground` / `--destructive-text` | `#8a5a0f` / `#b4233f` | 告警 / 错误（低饱和，仅状态用） |
| `--ring` | `#13805a` | 焦点环 |

### 2.2 颜色（glass-dark）

| Token | 值 |
| --- | --- |
| `--canvas-from` / `--canvas-to` | `#0f1b1f` / `#18172b`（光斑：薄荷 `#12302a`、紫 `#2a2550`） |
| `--card` | `rgb(28 37 48 / 0.60)`，`--glass-stroke` `rgb(255 255 255 / 0.08)` |
| `--foreground` / `--muted-foreground` | `#e7edf3` / `#a3afbd` |
| `--primary`（填充，深字 `#0b1f18` 8.96:1） / `--primary-text` | `#4fd1a1` / `#5fd6a8` |
| `--secondary-accent` / `--secondary-accent-text` | `#a79bff` / `#b3a8ff` |
| `--warning-foreground` / `--destructive-text` | `#f0c06a` / `#ff8fa3` |

语义映射固定：`success` = primary 家族；`info` 与“输出 / 次要数据”= secondary-accent 家族；chart-1..5 由 C1 定稿，须包含两强调色且色不独立承载信息。

### 2.3 形状、阴影、模糊、字体

| Token | 值 | 用途 |
| --- | --- | --- |
| `--radius-control` | 12px | 输入框、分段控件、小图标按钮 |
| `--radius-card` | 18px | 卡片、面板 |
| `--radius-shell` | 20px | 侧栏、页面级大容器、Dialog |
| `--radius-pill` | 9999px | 按钮、标签、状态胶囊、激活导航项 |
| `--shadow-glass` | `inset 0 1px 0 rgb(255 255 255 / 0.55), 0 12px 40px -16px rgb(30 60 90 / 0.14)` | L2 静止 |
| `--shadow-glass-hover` | 同上，第二段改为 `0 16px 48px -16px rgb(30 60 90 / 0.18)` | L2 hover（只加深一级，不浮夸） |
| `--glass-blur` | 20px（Dialog 24px） | L3 |
| 字体 | Display / Body = Geist Variable；Mono = JetBrains Mono（代码 / 路径 / ID / keycap） | D4 |
| `text-display-stat` | 1.75rem / 600 / `tabular-nums` | StatTile 大号数字（新增语义字号，登记于 typography-tokens.md） |
| 图标 | lucide，全局 `stroke-width: 1.75` | 细而一致 |

圆角同心规则：外层 20 → 内层 14 → 控件 12；内层不得与外层同值。

## 3. 主题与迁移契约（C2 实现）

- `ThemeFlavor = "glass-light" | "glass-dark"`；`fontThemeModeForFlavor` 映射为 light / dark。accent 概念整体删除。
- localStorage：新 key `skillport-theme`。首启读取顺序：新 key → 旧 `catppuccin-flavor`（`latte` / `claude-light` → `glass-light`，其余 4 个 → `glass-dark`）→ `prefers-color-scheme`。迁移后删除 `catppuccin-flavor` 与 `catppuccin-accent`。
- `setFlavor` 保持 `theme-switch.md` 的提交抑制机制不变（标记、offsetWidth、rAF 序号）。
- `@custom-variant dark` 改为 `&:is([data-theme='glass-dark'] *)`。

## 4. 窗口材质契约（C3 实现）

- `html[data-window-material="none" | "mica"]`，**默认 `none`（不透明 canvas）**，只有 Rust 侧成功应用 Mica 后才切为 `mica`（canvas 带 alpha）。方向是“先不透明、后变通透”，永远不会出现透明穿透或白闪。
- 材质状态经 store（不在组件内 `invoke`）获取；主题切换时 Rust 同步窗口 theme，让 Mica 底色与明暗一致。

## 5. 表面工具类与 primitives 边界（C2 定义类，C4 封装组件）

- `src/index.css` 只提供：`.glass-canvas`、`.glass-panel`、`.glass-panel-hover`、`.glass-overlay`、`.tint-primary`、`.tint-secondary`（及 warning / destructive tint），全部只消费 token。
- 组件层：`Card`（L2）、`StatTile`（tint + 大号数字）、`Badge` / `StatusPill`（胶囊 + tint）、`Button`（pill）、Dialog / Popover / Command / Sheet（L3）。
- 页面只能组合 primitives 和 utility，不得手写 `bg-white/60 backdrop-blur ...` 组合（C4 契约测试守卫）。
- 真实模糊白名单按“类”而非“文件”表达：`backdrop-filter` 只存在于 `index.css` 的 `.glass-overlay`（Dialog / Command / Menu / Sheet / Toast / BulkActionBar）与 `.glass-sticky`（分组头、facet 头、`PlatformTransferRail` 等 sticky 条）两个规则块；生产 TSX 不得出现任何 `backdrop-*` utility（C4 契约测试守卫，见 C4 design D-P1）。

## 6. 对比度预算（草案已验证）

计算方法：取 L2 面板（alpha 0.62 白）分别合成在 canvas 两端色与两块光斑峰值上，取亮度最不利点；暗色同理取最亮点。草案结果：

| 主题 | 对 | 比值 |
| --- | --- | --- |
| light | foreground / 最不利面板 `#f5f4fc` | 13.27 |
| light | muted-foreground / 面板 | 5.40；/ 绿 tint 4.87；/ 紫 tint 4.72；/ 裸 canvas 4.62 |
| light | primary-text / 绿 tint | 4.76 |
| light | secondary-accent-text / 紫 tint | 5.16 |
| light | 白字 / primary 填充 | 4.93 |
| dark | foreground / 最亮面板 `#18292e` | 12.71 |
| dark | muted / 面板、绿 tint、紫 tint | 6.73 / 5.01 / 5.04 |
| dark | primary-text / 绿 tint；secondary-accent-text / 紫 tint | 6.20 / 5.32 |
| dark | 深字 / primary 填充 | 8.96 |

C2 必须把同一合成算法写进 `themeContrast.test.ts`（解析 rgba / color-mix 合成），而不是只测不透明 hex。

## 7. 兼容与回退

- C2 是硬依赖：一旦合入，旧主题即被删除；回退 = revert C2（及之后依赖它的子任务）。
- C3 独立可回退：revert 后 `data-window-material` 恒为 `none`，界面完整可用。
- C4–C8 每个子任务单独 PR，按 surface 回退。
- 不改路由、store 数据契约、IPC（C3 新增的材质命令除外）。
