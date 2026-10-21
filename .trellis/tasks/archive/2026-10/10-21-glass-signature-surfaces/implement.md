# C6 执行计划

前置：C4 已合入（含 `ui/page-header.tsx`）；可与 C5 并行。读 `skill-card-scenarios.md`、`dashboard-data-contract.md`、`skill-usage-state.md`、`observability-console.md`、`typography-tokens.md`。

按 surface 拆提交，每步独立可回退：

1. **UnifiedSkillCard**：卡片骨架 → Badge 语义映射 → 平台图标行 → footer → dense 行 → `CompactCardMoreMenu` 改 `ui/menu`（移出 C4 pending 清单）。验证：UnifiedSkillCard 及五场景相关测试、Central 网格三档 Scale 高度测试；五场景亮 / 暗截图。
2. **Dashboard**：PageHeader 接入 → StatTile 计数行 → HealthOrbit 改造 → 其余面板 Card 化。验证：`DashboardView.test.tsx`（数据契约断言不变）；1280 / 1440 × 亮 / 暗 × 三档字号截图。
3. **Usage**：MetricStrip → Heatmap 色阶 → 列表 / 表格 → 对话框。验证：Usage 测试；heatmap 对比度（tint 级别上的数字若有）≥ 4.5 或改为外置标签。
4. **Logs**：KpiRow → 列表行 / 级别 Badge → Runtime 面板 → 详情对话框。验证：Logs 测试。
5. **清理**（§5）：删除旧类与无消费者的 display token；`rg "surface-glass|bg-orbit|readiness-" src` 为 0；更新 `typography-tokens.md`。
6. **性能观察**：Windows WebView2 下 Central（≥ 300 技能）与 Dashboard 滚动，和 C2 基线对比，记录在 `research/`。
7. **收尾**：`just ci`。
