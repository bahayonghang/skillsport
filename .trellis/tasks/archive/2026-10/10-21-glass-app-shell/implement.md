# C5 执行计划

前置：C4 已合入；读 `icon-control-hit-area.md`、`theme-switch.md`、`module-boundaries.md`。

1. **测试先行**：Sidebar 测试新增 footer 明暗切换（调用 `toggleFlavor`、aria-label 随主题变化）、收起入口；TopBar 测试删除主题按钮断言、新增“TopBar 不含主题按钮”。
2. **AppShell**（D-S1）：canvas 层、TopBar 行、侧栏 + main 行与留白；确认 `mainRef` 滚动复位行为不变。
3. **Sidebar**（D-S2、D-S4、D-S5）：删除头部行；footer 重排；NavItem 样式；resize handle 几何；`SidebarSection` 排序菜单改用 `ui/menu`（从 C4 pending 清单移除）。
4. **TopBar**（D-S1、D-S3）：透明化、搜索胶囊、移除主题按钮。
5. **全局浮层**（D-S7）与 `RouteLoadingFallback`（D-S8）；`TargetQuickSwitcher` 若直接用 base-ui 则同样迁移。
6. **i18n**：`sidebar.darkMode` / `sidebar.lightMode` / `sidebar.collapse` / `sidebar.expand` 等 en / zh。
7. **视觉与键盘**：三种窗口 × 亮 / 暗 × 展开 / 折叠截图存 `research/`；Tab 遍历顺序记录；`prefers-reduced-motion` 下折叠无过渡。
8. **收尾**：`just ci`；实现与 DESIGN.md Navigation 节有偏差时，在本 PR 内同步修改 DESIGN.md。

回退：revert 本 PR，外壳回到 C4 状态（功能完整）。
