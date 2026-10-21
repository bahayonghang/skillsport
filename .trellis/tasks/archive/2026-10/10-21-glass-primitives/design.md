# C4 设计：玻璃 primitives

## 现状盘点

| 项 | 现状 | 证据 |
| --- | --- | --- |
| `ui/` 组件 | button / button-variants / card / checkbox / command / dialog / inline-confirm-action / input-group / input / radio-group / shortcut-hint / switch / textarea / virtualized-grid / virtualized-list | `src/components/ui/` |
| 无 Badge / Menu / Sheet / Toaster primitive | 状态胶囊靠 `lib/statusTone.ts` 的 `statusChipClass` 等 class map；领域徽标各自实现（`SourceOriginBadge`×2、`ReadOnlyBadge`、`SourceChip`、`TargetBoundaryBadge` 等） | `src/lib/statusTone.ts:16-43` |
| `@base-ui/react/menu` 直接使用 6 处 | `CentralSkillsShellMenus`、`SkillImportLauncher`、`SidebarSection`、`PlatformSkillToolbarMenus`、`CompactCardMoreMenu`、`SkillsCliBatchBar` | grep |
| `@base-ui/react/dialog` 在 `ui/` 外直接使用 6 处（抽屉） | `CategorizeDrawer`、`CentralPlatformManageDrawer`、`TaskCenterDrawer`、`SkillDetailModalShell`、`SkillsCliDetailDrawer`、`SkillsCliUpdateDrawer` | grep |
| arbitrary 圆角在 primitives 内 | `button-variants.ts` xs / sm / icon-xs / icon-sm：`rounded-[min(var(--radius-md),10px)]` 等 | `button-variants.ts` |
| 显式 `strokeWidth` | `checkbox.tsx:26`（3）、`PlatformIcon`（品牌 glyph）、`ActivityPanel`、`InventoryCensus`（图表） | grep |
| Toaster | `main.tsx:53` `<Toaster position="bottom-right" richColors />` | — |

## 决策

- **D-P1 blur 只经 CSS 类**：TSX 中禁止任何 `backdrop-*` utility；真实模糊只存在于 `src/index.css` 的 `.glass-overlay`（浮层）与 `.glass-sticky`（sticky 条）两个类中。契约测试：(a) 生产 TSX 无 `backdrop-`；(b) `index.css` 中 `backdrop-filter` 只出现在这两个规则块内。这样白名单由“使用了哪个类”自然表达，不需要按文件维护列表。
- **D-P2 新 primitives**：
  - `ui/badge.tsx`：`<Badge tone="neutral|primary|secondary|success|warning|destructive|info" size="sm|md" icon?>`；胶囊 + tint + 语义文字色；`statusTone.ts` 改为基于 Badge 的 tone 映射（保留导出名以免一次性改动全部消费方，后续页面任务逐步改用 `<Badge>`）。
  - `ui/stat-tile.tsx`：`<StatTile tone="primary|secondary|neutral" icon label value hint? size="default|compact" />`；`value` 以 `text-display-stat tabular-nums` 渲染；根元素 `role="group"` + `aria-label`（label + 格式化值）；数字格式化由调用方传入字符串或用 `Intl.NumberFormat`（跟随 i18n 语言）。
  - `ui/menu.tsx`：base-ui Menu 的薄封装（Trigger / Popup = `.glass-overlay` + `--radius-card` / Item / Separator / GroupLabel）。
  - `ui/sheet.tsx`：基于 base-ui Dialog 的侧滑抽屉（side、width），Popup = `.glass-overlay` + `--radius-shell`。
  - `ui/page-header.tsx`：`<PageHeader title meta? actions? />`；标题 `font-display text-xl font-semibold`，meta `text-xs text-muted-foreground` 右对齐，actions 用 Button；`<h1>` 语义，每页唯一。
  - `ui/toaster.tsx`：封装 sonner，`toastOptions.classNames` 使用 `.glass-overlay` 与语义 tint；`main.tsx` 改用它。
- **D-P3 Button**：`rounded-full` 作为基础圆角（删除尺寸内 arbitrary 圆角）；新增 `glass` variant（`.glass-panel` 背景 + 描边 + hover 加深）；`outline` 改为透明 + `glass-stroke` 描边；`default` 实色 primary；焦点环 `ring-3 ring-ring/50` 外加 2px offset 以便在半透明底上可见。按压“双轨规则”保留。
- **D-P4 Card**：`rounded-[var(--radius-card)]` 改由 Tailwind `@theme` 暴露的 `rounded-card` utility（C2 在 `@theme inline` 注册 `--radius-card` 等），类为 `glass-panel rounded-card`；`variant="glass|tint-primary|tint-secondary|plain"`；`CardFooter` = 顶部 1px `border-t border-glass-hairline`（C2 在 `@theme inline` 注册 `--color-glass-hairline` / `--color-glass-stroke`，生成命名 utility）+ `text-xs text-muted-foreground`。
- **D-P5 表单控件**：Input / InputGroup / Textarea：`rounded-control`、`bg-card`、`border-glass-stroke` 描边；Checkbox / Radio / Switch 选中态用 primary；`checkbox.tsx` 的 `strokeWidth={3}` 保留（勾选 glyph 需要粗线，属有意例外，写入 DESIGN.md Known Gaps）。
- **D-P6 待迁移清单契约**：`src/test/contracts/glassSurfaceContract.test.ts` 中维护 `PENDING_DIRECT_BASE_UI`（上面 12 个文件）与 `PENDING_HANDWRITTEN_SURFACE`（初始化时扫描得到的文件列表）。规则：清单只能减少不能增加；新文件不得出现；C9 断言两份清单为空。各文件的迁移归属见 C5–C8 PRD 的文件归属。
- **D-P7 手写表面判定规则**（契约测试正则，生产 TSX）：
  - 禁止 `rounded-[`；
  - 禁止 `bg-white/` `bg-black/` 原始色；
  - 禁止同一 className 中同时出现 `rounded-(xl|2xl|3xl)` 与 `(ring-1 ring-border|border border-border)`——这是旧卡片配方，应改用 `<Card>` 或 `glass-panel rounded-card`；
  - `glass-panel` / `glass-overlay` / `glass-sticky` 允许在任何文件使用（它们是 token 化的类）。
- **D-P8 虚拟化高度**：卡片内边距由 16 → 20px、网格 gap 变化会改变 `centralVirtualItemHeight()` 的映射；本任务更新映射常量与 `centralSkillGrid.test.ts`，保持三档 Scale 契约。

## 视觉验证页

临时路由 `/__primitives`（仅 `import.meta.env.DEV` 注册），罗列全部 primitives 的全状态；截图后在同一 PR 内删除或保留为 DEV-only（二选一在实现时决定，DEV-only 需确保不进生产 bundle，`sizecheck` 绿）。
