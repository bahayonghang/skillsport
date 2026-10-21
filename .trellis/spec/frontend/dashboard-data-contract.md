# Dashboard 数据契约

> 建立于 2026-07-20（任务 07-20-dashboard-home-overhaul）。背景：Dashboard 曾并存
> 「后端 bootstrap summary」与「前端全量 centralSkills 重算」两套计数口径，显示
> 结果依赖用户导航历史；Activity「近 14 天」实际只有 5 条日志；viewModel 36 字段
> 中 11 个无人消费。本契约冻结单一数据源与刷新触发点。

## 契约 1：计数唯一来源 = `dashboardCentralSummary`

- Dashboard 的全部计数（central 总数、updates、aiReview、uncategorized、
  unassigned、readiness、sources）只读 platformStore 的
  `dashboardCentralSummary`（后端 `get_dashboard_central_summary_impl` 一次
  SQL 聚合）。**禁止**在前端用全量 `centralSkills`/`repositories` 重算同批
  计数或覆盖 summary 字段。
- Dashboard 不订阅 centralSkillsStore 的 skills/aiTagReviews/updateStatuses/
  repositories；activeJob 进度与 error 除外。

## 契约 2：summary 的三个刷新触发点（缺一不可）

1. Dashboard 挂载（bootstrap ref 防重入）；
2. `scanGeneration` 变化（重扫完成 = 数据必然过期）；
3. 更新类操作完成回调（`centralSkillsStore.updateSlice` 的
   `checkSkillUpdates` / `updateSkills` 成功收尾调
   `refreshDashboardSummary()`）。

禁止用 `refreshCounts()` 充当 summary 刷新——它只更新
skillsByAgent/lastScanAt/scanState（实证：`applyScanSummary` 不碰
dashboardCentralSummary）。

## 契约 3：图表数据 = 专用聚合 IPC，不做前端假窗口

- 需要窗口化统计（N 天趋势、Top N）时，后端提供恰好窗口大小的聚合结果
  （零值填充、时间源注入以便确定性测试），前端不得用小样本列表假装大窗口。
- 现有：`get_daily_operation_counts(days)`（本地日历日分桶，恰好 days 桶）、
  `get_central_top_tags(limit)`（JOIN skills 限定 `is_central = 1`，
  `skill_tag_links` 无 FK，必须防孤儿 link）。
- 生命周期：target 作用域数据放 platformStore（随 reset + scanGeneration
  重载）；跨 target 流水放 operationLogStore（不随 target reset）。加载器
  一律模块级 token latest-wins；多 IPC 独立 invoke、独立 error 态 + 面板级
  重试。

## 契约 4：Dashboard 视觉与性能

- Dashboard 面板一律是 L2 `<Card>`（`.glass-panel`，无 `backdrop-filter`；
  8 卡 × blur(22px) 曾是 Windows WebView2 滚动掉帧主因），不得回退加 blur。
  1.1.0 C6 已删除页面专属的 `.surface-glass` / `.bg-orbit` / `.readiness-*`
  规则；页面标题用 `PageHeader`，就绪度评分与计数用 `StatTile`（只读
  `dashboardCentralSummary`）。装饰性光斑（blur-3xl）禁止出现在常驻面板。
- 图表一律纯 SVG 手绘（不引入 recharts/d3）；SVG 必须 `role="img"` +
  aria 概述 + 数据点文本等价（`<title>`），「今日」类高亮不得只靠颜色
  （描边/纹理 + `aria-current`）。
- viewModel 字段必须全部被 Shell 消费；新增字段先确认消费者，删除区块时
  同步删除其数据加载与订阅。

## 契约 5：Local Skills CLI 库存展示

- `DashboardView` 的 `LocalSkillsCliCensus` 是独立 Local-only 库存面板，数据来自 `useSkillsCliStore`，不属于 Central summary，也不得覆盖其计数。非 Local 不加载、不展示该面板。
- 已装技能为 `skills.length`；linked 为至少有一个 agent 的技能数；来源种类为已出现的 source bucket 数。平台计数按 `target.displayName` 与 `skill.agents` 匹配，完整保留 targets 顺序及零值。
- 面板只有一层外壳，沿用 `Card` / `PanelHeader`；来源和平台区域同排时顶部对齐。平台条形随容器可用宽度伸展，标签与计数使用 HTML 语义字号，不用固定 9px SVG 文字或整体缩放图表塞内容。
- 宽屏平台分栏只改变布局，按连续序列先左后右阅读；所有列共享全量最大值和计数列宽。SVG 仍提供 `role="img"`、可访问名称和每点 `<title>`，不得用删零值或 Top N 掩盖空间问题。
- 验证：`InventoryCensus.test.tsx` 覆盖 KPI、零值、完整顺序、跨列共同尺度、长名称、大计数和空库存；`DashboardView.test.tsx` 保留 Local-only 与 Central summary 隔离。实际浏览器另验容器断点、字体缩放和最小窗口底部可达性。
