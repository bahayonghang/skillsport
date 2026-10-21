# C4 玻璃基础组件与 StatTile

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`。依赖：C2 已合入。可与 C3 并行。

## 目标

把轻盈毛玻璃的形状与材质语言收进 `src/components/ui/`，让后续页面迁移以“换组件 / 删手写类”为主，而不是逐处改色。

## 文件归属

本任务拥有：`src/components/ui/**`、`src/main.tsx` 中的 `Toaster` 配置、`src/index.css` 中 primitives 相关规则、新增的契约测试。不改页面与业务组件（它们只在 API 破坏时做最小适配）。

## 需求

- R1 Button：主操作与次级操作统一为胶囊（`--radius-pill`）；variants：`default`（primary 填充）、`glass`（新增：白色半透明胶囊 + 描边，对应截图中的“放大查看”）、`outline`、`ghost`、`destructive`（低饱和 tint）、`link`（primary-text）。保留尺寸体系与“双轨按压”规则，焦点环在玻璃表面上可见。
- R2 Badge / StatusPill（新增或收敛现有实现）：胶囊 + 语义 tint + 语义文字色；状态必须附图标或文字，不只靠颜色。
- R3 Card：L2 `.glass-panel`，`--radius-card`，内边距 20px，hover 只加深一级阴影；CardFooter 改为细分隔线 + 小灰字（截图卡片底部样式）。
- R4 StatTile（新增）：tint 背景（primary / secondary）、线性小图标 + 小号标签、`text-display-stat` 大号数字（`tabular-nums`）、可选副文本；支持紧凑尺寸；数字带可访问名称。
- R4b PageHeader（新增，`ui/page-header.tsx`）：`<PageHeader title meta? actions? />`；粗标题（固定 rem）+ 右侧 `text-xs` 灰字元信息 + 操作区；窄于 900px 时 meta 换到标题下。供 C6–C8 页面接入，本任务不接入页面。
- R5 输入类：Input / InputGroup / Textarea / Checkbox / RadioGroup / Switch 适配玻璃表面（`--radius-control`），error / disabled / focus 全状态。
- R6 浮层类：Dialog / Command / Popover / 下拉 / Sheet 使用 L3 `.glass-overlay`（真实 blur，`--radius-shell`）；Toast（sonner）主题对齐。
- R7 虚拟化网格 / 列表：卡片间距与圆角在新尺寸下的高度映射保持 `centralVirtualItemHeight()` 契约（`typography-tokens.md` §3），三档字号回归。
- R8 契约测试（新增）：
  - blur：生产 TSX 中不得出现任何 `backdrop-*` utility；`index.css` 中 `backdrop-filter` 只出现在 `.glass-overlay` / `.glass-sticky` 两个规则块；
  - 直接使用 `@base-ui/react/menu|dialog` 与旧手写卡片配方的文件进入“待迁移清单”，清单只减不增，C9 时必须为空；
  - 圆角：禁止 `rounded-[...]` arbitrary 值；
  - 手写表面：禁止页面直接组合 `bg-white/<n>` + `backdrop-*` 等玻璃配方（规则在 design.md 定稿）。
- R9 i18n：新增组件的可见文本与 aria 文案走 i18n。

## 验收标准

- [ ] 每个 primitive 在亮 / 暗下 default / hover / focus-visible / active / disabled / error 截图存档（可用测试页或 Storybook 式临时路由，合并前删除）。
- [ ] StatTile 在两主题、三档字号下数字不裁切，tint 上文字对比度 ≥ 4.5:1（复用 C2 合成测试）。
- [ ] 新增契约测试绿；现有 UI 测试全部通过。
- [ ] Central 网格三档字号的固定高度映射测试绿，真实浏览器首末项可达。
- [ ] `pnpm typecheck`、`pnpm lint`、`pnpm build`、`just ci` 全绿。

## 规划产物

`design.md`（现状盘点、D-P1–D-P8：blur 只经 CSS 类、新增 Badge / StatTile / Menu / Sheet / Toaster、待迁移清单只减不增契约）与 `implement.md` 已补齐。
