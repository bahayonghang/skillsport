# 侧边栏排序与首页库存概览视觉优化

## 目标与授权

用户要求使用 ui 技能分析截图，并创建两个问题的 Trellis 优化任务：侧边栏排序控件不要有大框；首页最底部样式和排版需要改善。本轮交付为分析和规划，不包含产品实现、实施启动或发布。所有任务保持 planning，PR base 为 dev。

## 背景与证据

- 截图覆盖展开侧栏与 Local Dashboard 底部，原图 2558×1374 是物理像素，不能据此推断 CSS viewport、DPI 或字体设置。
- F1：项目排序为 h-10、max-w-28 的边框 select，占用标题空间。证据：src/components/layout/SidebarSection.tsx:52。
- F2：库存标题在卡片外，与日志面板标题层级不同。证据：src/pages/DashboardView.tsx:34；src/components/dashboard/sections/LogsPanel.tsx:30。
- F3：平台图宽固定 242px、条形区 120px、文字 9px；来源块垂直居中于长列表。证据：src/components/skillsCli/InventoryCensus.tsx:38、:134、:158、:263。
- F4：现有测试要求保留零值平台；库存只在 Local 首页展示，与 Central summary 分开。证据：src/test/components/skillsCli/InventoryCensus.test.tsx:74；src/test/pages/DashboardView.test.tsx:454。

完整分析见 research/ui-review.md。

## 范围与任务映射

| 需求 | 交付 | 子任务 |
| --- | --- | --- |
| R1 | 排序入口轻量化，保留三种排序及记忆 | ../10-12-sidebar-project-sort-compact/prd.md |
| R2 | 库存层级、宽度、对齐与响应式优化 | ../10-12-dashboard-inventory-layout/prd.md |
| R3 | 跨区域字号、主题、可访问性及窗口适配 | 父任务集成验收 |

两子任务无功能依赖，可独立实现、验收和回退；父任务不作为产品实现目标。

## 验收标准

- AC1 / R1：项目标题旁无大面积表单边框；排序入口可发现、当前方式可获知；名称、技能数、最近扫描均可选择且重挂载恢复。
- AC2 / R2：库存标题进入一致面板层级；KPI、来源与平台分布阅读顺序清晰；不再出现固定窄图表集中左侧、右侧大片空白。
- AC3 / R2：来源与平台分布顶部对齐；标签和数值可读；保留全部平台、零值、统计口径及 Local-only 行为。
- AC4 / R3：900×600 最小窗口、1200×800 常规及宽屏，明暗、中英文、字号放大状态无新增横向滚动、文字裁切或热区重叠，底部可滚动到达。
- AC5 / R3：实施后提供同窗口同数据的前后截图及控件/图表几何数据；静态检查与 Vitest 不代替视觉验收。

## 范围外

不重做整页或侧栏导航，不改用户字体与主题、排序算法、持久化 key、平台顺序、统计口径；不删零值平台，不增加 Top N、过滤、图表依赖、后端命令或发布工作。截图未证明加载错误，独立加载/错误状态改造不在本次范围。

## 规划状态与风险

任务创建无阻塞信息。设计为待审阅提案，不表示用户批准实施；本轮仅完成截图及源码分析和任务文档。实际 WebView2、DPI、前后测量、功能测试及 just ci 尚未执行，保留到实施验收。
