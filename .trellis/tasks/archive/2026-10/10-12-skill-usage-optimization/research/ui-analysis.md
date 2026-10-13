# Skill Usage 视觉与渲染分析

日期：2026-10-12。基线 commit：`a77acc92`。证据：用户截图、当前源码、spec 与归档任务。没有启动本机应用或测量 DOM；以下截图比例是视觉估计，代码几何按 root=16px 推导，不冒充实测。

## 修复契约与设计方向

- Target：`/usage` 的页头/KPI、平台筛选、榜单工具条、Recent/Detail、16 周热力图及相同控件在 Unused 的一致性。
- Preserve：外层工具栏和侧栏、路由/target 语义、全历史数据、provider 支持范围、用户字体/主题/字号、解绑安全流程。
- Evidence：保存的 `evidence/user-screenshot.png`，实施时同 fixture 的浏览器与 WebView2 before/after、几何记录和性能 trace。

视觉主张：现有主题下的紧凑分析工作区，靠位置、字重、数字对齐和克制的语义色建立层级。
内容主张：概要与操作 → 平台筛选 → 技能排行及近期调用/活动 → 未使用技能 → provider 次要诊断。
交互主张：高频筛选/排序不添加入场动画；复用现有按钮按压反馈与 focus-visible，加载旋转遵从 reduced-motion，不增加布局属性动画。

五项方向由产品证据确定：用户是查看本机/远程技能调用的桌面用户；沿用当前 palette；signature 是紧凑概要和对齐的数值列；React/TS/Tailwind、i18n、字体 profile 和固定格子为硬约束；微交互为已有按钮反馈。只使用当前 Tailwind 和 CSS token，不新增样式框架。

## 根因及改进顺序

| 问题 | 当前证据 | 根因 | 最小修复 |
| --- | --- | --- | --- |
| 顶部水平空白 | UsageMetricStrip.tsx:31-45；截图统计值集中左端 | 内容宽度的 flex 项放在通栏背景内；历史任务取消均分后保留整条容器 | 在宽窗把 KPI 作为内联概要并入标题/刷新区，取消独占通栏容器；窄窗自然流到下一行 |
| 首屏被多层条带占用 | SkillUsageView.tsx:84、:136、:173 | 标题、筛选、KPI 分三层，有重复 py、mt、mb | 标题/KPI/状态共享第一层，筛选第二层；骨架同步布局，主要内容提前出现 |
| 控件语义/形态不一致 | PlatformFilterBar.tsx:78-88；SkillUsageTable.tsx:63-109 | 平台选中用边框+primary，表格选中用 foreground 反色；平台缺 aria-pressed；禁用整体透明 | 同一页面内统一几何和语义选中态；平台增加 pressed 可访问语义；禁用原因保留，不全局重写 Button |
| 小字层级过弱 | SkillUsageTable.tsx:121；index.css:251 | 决策型列头落在 11px meta；状态点、label 和次要信息难区分 | 按语义角色使用 text-xs / text-ui-meta / text-ui-micro；数字沿用 tabular-nums 和右对齐；使用 primary-text 承载 accent 文本 |
| 热力图只占左侧 | SkillUsageView.tsx:186；ActivityHeatmap.tsx:16-22、:82 | 右轨道 0.85fr 随宽屏变宽，图形保持固定自然宽度 | 右栏改为有上限的轨道；限定图形内部 wrapper，月份和图例与之对齐；必要时统一一个更大的固定 default 格子 |
| 月份重叠/图例远离图形 | ActivityHeatmap.tsx:85-98、:161、:179-191 | 月份 span 固定占一个周列且 overflow-visible；图例对齐整个卡片 | 月份按真实覆盖周数分组放置或边界检测后取舍标签，不能改变日期数据；图例对齐图形 wrapper |
| 重复阈值排序 | ActivityHeatmap.tsx:114、:195-224 | 每个非零格子重新排序全部非零数值 | 性能子任务预计算 max/分位阈值，每格 O(1) 分类，保持当前插值和比较边界 |
| 大榜单 DOM | SkillUsageTable.tsx:35-39、:136；UnusedSkillsPanel | 已有 memo 排序，无有界 DOM | 先测 100/1k/10k 行；仅数据证明必要才分页/窗口化，并保持所有行可达和筛选/排序全量语义 |

## 热力图几何与历史回归

当前 16 个周列，default 格子 0.75rem，gap-1=0.25rem。root=16 时网格宽 `16×12 + 15×4 = 252px`，加星期轴 w-7 和 gap-2 约 288px；`min-w-[22rem]` 是 352px，因此在组件自己的最小 wrapper 中已有约 64px 非图形宽度，宽屏右栏还会继续扩大。compact 格子 10px 对应网格 220px。均为源码推导，不含字体度量/缩放/浏览器边框的实测。

归档 `.trellis/tasks/archive/2026-08/08-16-usage-maximize-layout-jank/research/resize-jank-diagnosis.md` 曾指出 aspect-square+1fr 和 row-span 的布局反馈。当前实现/spec 已禁止这些模式，不能为了填满卡片重新使用它们。优先匹配容器宽度与图形自然宽度。若固定 default 格子从 12px 调整到 16px，16 周网格为 316px，加轴约 352px；须验证窄窗、字体 scale 与 compact 消费者，具体尺寸由实际图形测量收敛。

`buildMonthLabels` 对每周首日生成标签，若起始周位于月底，会在相邻周列放两个宽度超过 16px 的月份。截图左端月份已挤在一起；只把字体变小不能解决占位逻辑。

## 复用与边界

- tokens：src/index.css:191-193（font）、:236-242（radius）、:251-252（meta/micro）；主题、字体和 accent 来自用户设置，不根据截图猜硬编码颜色。
- Button：src/components/ui/button-variants.ts 的 150ms color 与按压反馈；只在 usage 需要时增加 class/动作槽，不改变全局消费者。
- UsageMatchStatus 已用于榜单、详情和 Unused，保持文字+statusTone 点；unmatched 是中性，不当成错误。
- 排名过滤 state 依 spec 留在视图，本轮不因样式改动迁入 store；组件不直接 invoke。
- 普通动作热区需要 40px，图标行必须预留不重叠槽。112 个密集热力图格子不能逐个套 40px 重叠伪元素；保持数据网格 roving focus/aria 语义，单独记录图表密集点例外。

## 实施验证矩阵

| 轴 | 状态 |
| --- | --- |
| 窗口 | 原图接近宽屏、1920×1080、1440×900、1280×720、1024×768、900×800、1200×600、900×600；另测 xl 两侧 1279/1280 |
| 字体/主题 | en/zh；dark/light；scale=0.875/1/1.125；额外覆盖用户 serif profile 和最长 provider/技能名称 |
| 数据 | 空、零调用、稀疏热力图、跨月/跨年、正常 fixture、144/1k/10k 技能、匹配三态 |
| 交互 | 初载、缓存首屏、后台扫描、显式刷新、平台切换、筛选空集、详情开闭及焦点返回、错误缓存保留、远程不可达 |
| 几何证据 | 页头至卡片高度、轴+网格/卡片内容宽度、月份占位/重叠、图例边界、scrollWidth/clientWidth、热区矩形 |

核心窗口全部测默认状态；状态/语言/字体组合用风险驱动的代表矩阵，不把所有轴做笛卡尔积。交付时报告 checked/changed/left 消费者数；浏览器 fixture 与 Windows WebView2 证据分开。

## 当前未验证

未测真实 CSS viewport、DOM 几何、首次绘制、最大化 trace、实际扫描耗时、安装包或 provider 连接。不能仅凭截图或源码断言优化后的观感与速度已经通过。
