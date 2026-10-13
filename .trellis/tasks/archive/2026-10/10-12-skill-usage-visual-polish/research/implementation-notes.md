# 视觉实施记录

日期：2026-10-12。执行者：`trellis-implement` 视觉子代理。产品范围为已批准的 V1-V5，主会话负责真实浏览器矩阵、原生证据、完整 `just ci` 与任务收尾。

## 基线冻结

- 已读取完整原生 hook、任务 PRD/design/implement/context、相关 frontend/quality specs、ui 技能及截图/数据可视化/设计参考。
- 在主会话发出 `baseline-ready` 前未写产品源码。主会话实测默认 dark/en/root=16px：1440/1920/1280 的标题 top=60 到排行榜 top=256.375，概要占用 196.375px；900×600 为 230.375px。
- 原热力图网格 252px、轴与间距约 36px，卡片随宽屏扩大。基线截图、详细测量由父任务研究记录保存。

## 阶段一：布局与概要

- 四项 KPI 移入标题/target/刷新同一概要行，取消通栏 KPI surface；平台筛选保留下一层。窄窗按自然宽度换行。
- 初载使用同位置、同高度的 KPI 骨架，不显示数字零；无 overview 的错误态直接显示错误，不保留扫描骨架。
- 主内容 desktop 轨道固定为 `minmax(0,1fr) 24rem`，使用 `items-start`，排行高度不依赖右栏。骨架复用该轨道。
- scope 保持可见；range、freshness、缓存/后台扫描/远程警告和 store 行为均保留。

## 阶段二：控件与排版

- 平台、排行与 Unused 三处筛选复用轻量 `UsageFilterControls`，内部沿用已有 Button，40 CSS px 最小操作尺寸、命名主题前景、统一 primary 选中面和 `aria-pressed`。高频操作不增加过渡动画。
- 排行/Unused 决策列头提升为 `text-xs`，所有数值维持 tabular/right alignment。KPI 使用语义 dl/dt/dd；不新增字体、颜色、字号或全局 Button 样式。
- 排行、Unused 和详情依卡片 container 宽度切换列数，避免桌面 viewport 宽但主栏较窄时完整列撑出页面。
- Recent/排行/详情普通图标操作保留独立 ≥40px 可见槽；Unused 保持小图标+伪元素模式，补齐 min-40px 约束，并为两个操作预留不重叠槽。解绑规范和回调未改变。
- 没有新增/修改公共文案或翻译 key，因此无 README/i18n 变更。

## 阶段三：热力图

- default 轨道统一固定为 1rem（默认 root 时16px）；compact 保留固定0.625rem（10px）。没有 `aspect-square`、fr 轨道、ResizeObserver 或宽度回传高度。
- weekday、month spans、日期网格和 legend 共享 intrinsic `w-max` 外框；删除22rem的多余内部最小宽度。默认卡片宽度上限24rem，必要横向滚动局限于图形内部。
- 月标签按连续周起点分组分配 start/span，单周残月只省略可视标签；112日期与零调用日期完整保留。
- 每格热度分类/分位比较算法完全未改，后续性能任务可接管算法并保留本次几何。

## 本地检查

| 检查 | 结果 |
| --- | --- |
| 六文件定向 Vitest：usage components/Unused/store/typography/contrast/font | PASS，97 tests |
| `pnpm typecheck` | PASS；首次发现 `Array.at` 不在当前 TS lib，已改为普通索引访问后重跑 |
| `pnpm lint` | PASS |
| `pnpm build` | PASS；Vite 提示一个入口 chunk >500kB，未扩大本视觉任务范围 |
| `git diff --check` | PASS，仅 LF/CRLF 自动转换提示 |
| `just ci` | 由主会话统一执行，子代理未重复运行 |

定向新增覆盖：平台 pressed/禁用说明、月份跨度/单周残月、跨年完整日期、上下左右 roving focus、空态、compact fixed tracks、legend/grid共框、header KPI位置、无 overview 错误无零KPI、Unused40px最小槽。

按本任务列出的消费者范围：checked 8 / changed 8 / left 0（SkillUsageView、Metric、Platform、Table、Heatmap、Recent、Detail、Unused）。新增共享控件不计入旧消费者数量。这里的 checked 表示源码和定向语义/契约检查；真实几何不能由 jsdom/class 断言替代。

## 交接与未验证

- 待主会话完成 VA1/VA3 before/after 数值、核心窗口/语言/scale/状态矩阵、月份矩形、40px热区和焦点返回的真实浏览器检查。
- Windows WebView2 首次加载、最小900×600、最大化/还原和缓存后台刷新证据须单独记录；Vite build不证明原生或安装包通过。
- 100/1k/10k榜单全量DOM问题由主会话实测，属于性能任务；本次未偷偷窗口化或更改排序协议。
- 主会话可能继续修改任务/研究文件；本代理未commit、push或archive，没有撤销任何他人改动。
