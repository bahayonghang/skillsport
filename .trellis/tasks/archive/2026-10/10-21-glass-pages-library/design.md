# C7 设计：库与技能页面迁移

## 迁移映射规则（全任务通用）

| 旧写法 | 新写法 |
| --- | --- |
| `rounded-xl/2xl` + `ring-1 ring-border` / `border border-border` + `bg-card` 卡片或子面板 | `<Card>`，或嵌套子面板 `rounded-xl bg-muted/40`（无描边，内层不重复玻璃） |
| 盒中盒（面板里再套带描边的面板） | 去掉内层描边，用间距与 hairline 分隔 |
| 状态 / 计数小胶囊（`rounded-full px-2 text-ui-meta bg-*/10 text-*`） | `<Badge tone size="sm">` |
| `uppercase tracking-*` 分组眉标 | 普通大小写 `text-xs font-medium text-muted-foreground`；仅保留真正的极短代号（如 `LOBSTER` / `CODING` 平台分组名） |
| 直接 `@base-ui/react/menu` | `ui/menu` |
| 直接 `@base-ui/react/dialog` 抽屉 | `ui/sheet` |
| `sticky ... bg-background/90 backdrop-blur` | `glass-sticky` |
| 页面顶部自制标题行 | `<PageHeader>` |

内层圆角同心：Card（18px，p-5）内的子面板用 `rounded-xl`（14px）；子面板内控件 `rounded-control`（12px）。

## 页面清单与要点

| 页面 / 区域 | 文件（主要） | 旧配方数 * | 要点 |
| --- | --- | ---: | --- |
| Central 主体 | `CentralSkillsView.tsx`、`CentralSkillsShell*.tsx`、`CentralSearchBar.tsx`、`CentralGroupedSkillList.tsx` | — | PageHeader（标题 + “N 个技能 · 上次扫描”）；顶部过滤为 glass 胶囊组；分组头 `glass-sticky`；`CentralSkillsShellMenus`、`SkillImportLauncher` 改 `ui/menu` |
| Central 侧栏 | `CentralSidebar.tsx`、`CentralSidebarBlocks.tsx`、`FacetSection.tsx` | 3 | 作为页内二级导航：`Card` 容器 + 与主侧栏同款激活项；facet 头 `glass-sticky`；底部 sticky 区 `glass-sticky` |
| Central 批量 / 浮条 | `BulkActionBar.tsx`、`Batch*Dialog.tsx`、`DeleteCentralSkillDialog.tsx` | 25 | BulkActionBar = `glass-overlay` + `rounded-full`；对话框统一 C4 dialog，内部清单子面板去描边 |
| Central 仓库同步 / AI 标签 / 分类 | `CentralRepositorySync*.tsx`、`repositorySyncPanelControls.tsx`、`CentralSkillAiTagPanel.tsx`、`CentralSkillCategorizePanel.tsx`、`CategorizeDrawer.tsx`、`TaskCenterDrawer.tsx`、`CentralPlatformManageDrawer.tsx` | 17 | 抽屉改 `ui/sheet`；进度 / 速率限制用 StatTile compact 或 Badge |
| Update Center 及已标 `@deprecated` 的对话框 | `UpdateCenterDialog`、`CentralUpdateConfirmDialog`、`RemoteMissingSkillsDialog`、`CentralRepositorySyncDialog` | 7 | 仍有消费者（`CentralSkillDialogs.tsx`、`SkillDetailView.tsx`），**只做 primitives 替换，不删除**——删除属于行为变更，不在本重构范围 |
| Platform | `PlatformView.tsx`、`components/platform/**` | 2 | 分组列表头 `glass-sticky`；`PlatformTransferRail` = `glass-sticky` 底栏；`PlatformSkillToolbarMenus` 改 `ui/menu`；来源分类导航同 Central 侧栏语言 |
| Projects | `ProjectsView.tsx`、`components/projects/**` | 0（upper 4） | PageHeader；项目卡用 Card；`ProjectInstallDialog` 眉标去 uppercase |
| Collections | `CollectionsListView.tsx`、`components/collection/**` | 0 | PageHeader；集合卡 Card；安装对话框 C4 dialog |
| 技能详情 | `SkillDetailPage.tsx`、`SkillDetailView*.tsx`、`SkillDetailSidebar.tsx`、`SkillDetailPreview.tsx`、`SkillFrontmatterCard.tsx`、`SkillDetailModalShell.tsx` | 1（upper 9） | 正文区 Card、侧栏元信息用小灰字 + Badge；Markdown 标题固定 rem，代码块 mono + `bg-muted/40 rounded-xl`；`SkillDetailModalShell` 改 `ui/sheet` 或 dialog |

\* 旧配方数 = 同一 className 中 `rounded-(xl|2xl)` 与 `ring-1|border ` 共现次数（规划期 grep，仅作工作量参考）。

## 不变量

- 虚拟化固定高度、过滤 / 保存视图 / 批量操作 / 导入导出 / 平台图标即时安装等行为与测试不变。
- `platform-grouping.md`、`platform-origin-classification.md`、`skill-card-scenarios.md` 契约不变。
- 技能卡一律 `UnifiedSkillCard`（C6 拥有），本任务只改其容器与周边。
