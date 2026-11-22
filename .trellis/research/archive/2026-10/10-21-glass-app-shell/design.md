# C5 设计：应用外壳

## 现状

- `AppShell`：TopBar（全宽 h-12，`bg-sidebar border-b`）+ 下方 Sidebar（`border-r bg-sidebar`，贴边）+ `<main>`。
- `Sidebar.tsx`：顶部一行 = 应用名 + 折叠按钮（`:217-256`）；中部滚动导航；底部 Settings + 右缘 resize handle（`:440-500`）；激活项 = 渐变填充 + 发光 + 3px 左缘条（`:106-121`）。
- `TopBar.tsx`：左应用图标（回 Dashboard）、居中搜索触发器、导入技能按钮、`TargetQuickSwitcher`、快捷键按钮、主题切换按钮（`:88-200`）。
- `SidebarSection.tsx` 直接使用 `@base-ui/react/menu`（项目排序），属于 C4 待迁移清单，由本任务迁移。

## 决策

- **D-S1 布局**：根容器 `.glass-canvas`（`fixed inset-0` 层 + 内容层，canvas 不随 main 滚动）。TopBar 保留（搜索、导入、目标切换、快捷键都是核心功能），改为**透明工具条**：去掉 `bg-sidebar` 与底边框，直接放在 canvas 上；搜索触发器改为 `glass-panel` 胶囊输入外观。下方一行：浮动侧栏（左 / 下各留 12px，`rounded-shell`，L2）+ `<main>`（右 / 下留 12px，内容自带页面 gutter 24px）。
- **D-S2 侧栏结构**：删除顶部“应用名 + 折叠”行（应用名已在 TopBar 图标的可访问名称中）；底部 footer 依次为：设置（NavItem）、分隔线、明暗切换（NavItem 样式，图标 Moon / Sun，文案“深色模式 / 浅色模式”）、收起 / 展开（NavItem 样式，图标 ChevronsLeft / ChevronsRight）。折叠态只显示图标并保留 `aria-label` 与 `title`。
- **D-S3 单一明暗入口**：移除 TopBar 主题按钮；侧栏 footer 是唯一入口，调用 `themeStore.toggleFlavor()`。快捷键（若现有）保持。`TopBar.test.tsx` 中主题按钮断言迁移到 `Sidebar` 测试。
- **D-S4 导航项**：高度 36px，`rounded-full`（展开态）/ 圆形（折叠态）；hover `bg-sidebar-accent`；激活 = `tint-primary` + 1px primary/35 描边 + `text-primary-text` + `aria-current="page"`；删除发光与左缘条。计数 = `Badge size="sm" tone="neutral"` + `tabular-nums`。
- **D-S5 Resize handle**：放在侧栏右缘与 main 之间的 12px 间隙中线上，命中区 8px，可见态仅 hover / focus 显示 2px primary/40 竖线；键盘调宽行为不变。宽度 168–360 / 折叠 56 的数值是**面板宽**，不含留白。
- **D-S6 PageHeader**：已移至 C4（`ui/page-header.tsx`），使 C5–C8 只依赖 C4；本任务不涉及。
- **D-S7 全局浮层**：`GlobalSearchDialog`（command）、`ShortcutsSheet`（改用 `ui/sheet`）、`TargetQuickSwitcher`（改用 `ui/menu`）。
- **D-S8 路由加载占位**（`App.tsx` `RouteLoadingFallback`）：改为 `Badge`/glass 胶囊；`bg-background` 去掉，让 canvas 透出。

## 几何（1280×800，展开）

```
┌ TopBar h-12 透明 ─────────────────────────────────────────┐
│ [icon]      ( 搜索胶囊 ⌘K )         [导入] [目标] [⌨]      │
├──12px──┬───────────────────────────────────────────────12px┤
│ 侧栏    │ main（页面 gutter 24px）                          │
│ 208px  │                                                    │
│ rounded│                                                    │
│ -shell │                                                    │
└──12px──┴────────────────────────────────────────────────────┘
```
