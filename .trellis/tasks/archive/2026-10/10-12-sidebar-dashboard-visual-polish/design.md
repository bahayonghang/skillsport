# 设计与边界

## 视觉方向

- Visual thesis：延续 SkillPort 的紧凑工具界面、现有强调色与分层表面，辅助排序动作低调，数据区域易读。
- Content plan：分区标题与操作；库存标题；三项统计；来源和平台分布。无装饰性占位内容。
- Interaction thesis：沿用 hover、按下、focus-visible 和展开反馈，不增加入场或图表动画。
- CSS：现有 Tailwind utilities 与 theme tokens，不引入新字体栈或样式系统。

## 修复契约

Target：展开侧栏的 Project Workspaces 排序入口、Local Dashboard 库存面板。
Preserve：相邻导航、折叠行为、其他 Dashboard 卡片、全部统计与排序语义。
Evidence：用户截图、当前源码及实施后的实际渲染和几何测量。

## 推荐方案与取舍

排序 A（推荐）：无常驻边框的 ArrowUpDown 图标，菜单展示三项及当前选择。
排序 B（备选）：无边框图标加当前方式短文本，直接可读但多占标题宽度。
A 更贴合用户对排序图标和大框的反馈，实施前随方案审阅。

库存统一外壳与头部，KPI 采用可伸展网格。下方来源区紧凑、顶部对齐，平台区占剩余宽度，条形伸展而非整体缩放 SVG。足够宽时完整平台序列分两列，使用共同最大值尺度；窄窗退回单列。保留来源圆环，避免扩大为图表产品重设计。

现有 surface-glass、字体 profile 和图表色是产品上下文，不按通用审美建议替换；不新增 blur。

## 数据流与兼容

排序仍通过 SidebarSection.sort.onChange 和现有 Sidebar workspace prefs 完成；库存仍来自 useSkillsCliStore 的 skills/targets，Local 判断和加载路径不改，不碰 Central summary。无后端、schema、持久化格式或依赖变更。两子任务分别回退其 UI 与测试，不回退其他工作。
