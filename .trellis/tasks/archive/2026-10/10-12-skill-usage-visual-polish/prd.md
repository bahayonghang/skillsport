# Skill Usage 布局、控件与热力图优化

## 目标

完成父任务 R1-R3：减少 `/usage` 顶部无效空间，统一标签、数字和按钮的视觉层级，让右栏热力图与卡片宽度匹配。沿用用户已设置的字体、主题和 accent，呈现紧凑、可扫描的分析工作区。

## 背景

证据与源码锚点集中于父任务 `research/ui-analysis.md`。当前 KPI 内容聚拢而背景通栏，右栏比例增长而图形固定宽度，月份标签每次仅占一个周列。当前固定格子/contain-layout 是历史最大化卡顿修复，必须保留。

## 需求

- V1，布局：宽窗的页标题、四项 KPI、target 与刷新操作构成紧凑概要层，平台筛选占下一层；窄窗自然换行。取消内容仅在左端的独立通栏 KPI 背景。全历史、最近 20、16 周和刷新时间仍可见。
- V2，控件：平台筛选与榜单筛选/排序使用统一的尺寸、边界、选中、hover、pressed、focus-visible 和 disabled 规则。平台按钮明确 aria-pressed，禁用 provider 的解释继续可见。
- V3，排版：KPI 作为一级数字，技能名称作为阅读锚点，匹配/来源/范围作为辅助层。所有数字列使用等宽数字并按列右对齐；决策型列头至少 text-xs，不能用缩小文字或省略核心 label 解决布局。
- V4，热力图：收敛右栏最大宽度；月份按有效周跨度占位，避免重叠；星期轴、网格和图例共享外框。保留 16×7 个日期、零调用天、六档颜色、日期/数量 aria、箭头键焦点和 compact 详情变体。
- V5，状态：初载骨架跟最终布局同形；保留空、错误、缓存警告、后台扫描、远程不可达、筛选空集、详情开闭/焦点返回和解绑状态。

## 验收

- [x] VA1，对应 V1：同 fixture、同 viewport、scale=1、无 banner 的 ≥1280 宽视图，标题顶部到排行榜卡片顶部高度减少 ≥25%；记录 before/after DOM 数值。概要不占一整条主要空白的带状容器。
- [x] VA2，对应 V2-V3：普通文本实测/契约对比度 ≥4.5:1；数字与 label 的列对齐；已选、未选、禁用、焦点、按压状态均可辨；按钮热区至少 40px 且不重叠。密集 heatmap 数据点依已有图表键盘语义单独审查，不添加重叠热区。
- [x] VA3，对应 V4：宽屏右栏中轴+网格外框/卡片可用内容宽度 ≥80%，图例和网格右边界差 ≤4 CSS px；月份不互相覆盖，月份/星期/格子基线清楚。小窗口允许图形内部必要横向滚动，页面无横向滚动。
- [x] VA4，对应 V4：112 天全部存在且颜色等级与原语义一致；只有一个 roving tab stop，左右±7/上下±1 的焦点行为、空态与 compact 消费者通过测试。禁止 aspect-square+1fr、宽度驱动格子高度和榜单 row-span 耦合。
- [x] VA5，对应 V1-V5：父任务视觉矩阵中核心窗口、明暗、中英文、scale 三档、长名称和全部可达状态通过；page.scrollWidth===clientWidth；无控件裁切、月份重叠、横幅遮挡或控制台错误。
- [x] VA6：定向组件/状态/字体对比度测试、typecheck、lint、build 和 just ci 通过。浏览器与 Windows WebView2 的首屏、最大化、还原、详情/焦点证据独立记录。

## 范围

拥有 SkillUsageView、UsageMetricStrip、PlatformFilterBar、SkillUsageTable 的样式/几何，ActivityHeatmap 的布局/月标签/legend，必要的 Recent/Detail/Unused 一致性和 i18n。不改扫描算法、排名请求协议、全局主题/字体、其他页面或全局 Button 风格。

## 依赖与规划状态

父任务：`10-12-skill-usage-optimization`。视觉先实施，性能后实施；ActivityHeatmap 的阈值算法由性能子任务负责。当前为 planning，无阻塞产品问题；几何尺寸须从真实渲染收敛，截图像素不可直接用作 CSS 规格。

## 最终验收与关闭

2026-10-13 用户声明人工验证完成并接受当前结果收尾。技术证据见父任务 `research/integration-verification.md`；未勾选的数值指标保持未通过，不作为继续实施的本轮要求。PA7 memory 冷扫中位回退 19.2%，PA8 生产 paint/source/unused 完整对照以及父 AC5 的部分计时证据均按已知限制记录。CI 与 Windows bundle 均通过。
