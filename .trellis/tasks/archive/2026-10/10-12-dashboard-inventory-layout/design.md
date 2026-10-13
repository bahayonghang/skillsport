# 设计提案

## 布局和排版

沿用Card/PanelHeader/CardContent与surface-glass，无新blur。外壳只有一个拥有者，推荐LocalSkillsCliCensus承载标题和容器，InventoryCensus负责统计内容。
阅读顺序：标题、三项KPI网格、来源/平台分布。下方顶部对齐，来源紧凑、平台minmax(0,1fr)，不让来源环图被长列表撑高后垂直居中。

足够宽时平台完整顺序分为两个连续组，先左后右阅读，两组共享全量maxCount；窄窗回单列。列切换按长标签、font scale 1.125及真实内容宽度验证，优先既有Tailwind/container布局能力，不新增ResizeObserver管线。

保留原生SVG与来源圆环。标签、条形、计数分开布局，条形利用剩余宽度；可用HTML语义文本配SVG图形，不能通过整体拉伸viewBox缩放文字。采用现有text-xs/text-sm/tabular-nums，继承用户字体和根字号，不新增fontSize字面量。环图中心文本也检查缩放。
数值右对齐，长标签允许换行和自然行高，不靠省略号隐藏唯一名称。保留role/aria概述与每点title或等价文本，避免装饰重复朗读。

## 数据与变更边界

候选文件：src/pages/DashboardView.tsx、src/components/skillsCli/InventoryCensus.tsx及对应测试，仅必要时补中英文字符串。复用PanelHeader，不修改所有其他消费者。无需改DashboardShell、全局主题/字体、store或Rust。

linkedCount仍为至少一个agent的技能数；sourceKindCount仍为出现的来源类型数；完整targets顺序、零值、来源bucket保留。不改变Local加载与Central summary。

## 取舍、兼容和回退

整体放大SVG不能同时解决小字、长列表和窄窗；删零值违背现有契约。分栏增加阅读顺序要求，必须验证共同尺度和长名称。来源图种类重设计不在范围。
没有新状态持久化、依赖或迁移；只回退本子任务UI和测试。浏览器fixture与原生WebView2证据分开记录。
