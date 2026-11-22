# 前端性能实施与交接

日期：2026-10-12。执行者为已 dispatch 的 `trellis-implement` 视觉/前端代理。已加载性能 PRD/design/implement/context 和相关规格；所有 Rust、codegen、schema docs、完整 CI、原生证据由主会话及 Rust 代理拥有。

## 1. 实测门与范围

大榜单有界渲染的门已由主会话实测：同1440×900/root16/视觉完成代码，100/1k/10k排名的DOM约1844/13544/130544，单次dev更新到2RAF约995/2402/7294ms。原始证据在父任务 `research/evidence/browser-ranking-baseline.json`。这是一轮开发构建诊断，不是生产p95或绝对SLA。

因此只优化已确认的热力图重复排序、页面重复读取和大榜单DOM，不引入依赖，不改其他页面样式，也不更改视觉子任务的热力图几何。

## 2. Coherent page 与状态

- 增加 frontend `UsagePageSnapshot { overview, recent, providers }`；fixture为 `usage_get_page({source})` 提供相同快照。getter不包含scope/remote reachability。
- refresh携带当前source。正常来源未改变时直接发布返回的筛选快照，不再先聚合全平台、再重取筛选overview/recent。
- 来源在refresh途中切换、消失，或者新page读取已经越过refresh开始的page序列时，使用coherent getter重新读取。只在guard有效时一次提交overview/recent/providers/freshness/source，避免延迟refresh把较新的后台页盖回旧generation。
- 来源消失时先取得全平台页再切换标签，不能把空filtered payload发布成all。查询失败保留旧页面、来源与缓存警告。
- source选择保留旧面板直到整页读取成功；target、page、refresh、detail、unused各自序列保护继续保留。pending source intent被后台完成接管时维持用户所选来源，旧响应丢弃；接管后的silent失败也清理该显式请求已有的loading，避免永久遮罩。
- scan-completed静默更新providers与`overview.lastScanMs`，无新的loading/refreshing/skeleton/toast。unused在成功page提交后按同source安静读取，silent失败不覆盖unused error或旧报告。
- read-only loadScope冻结target，并保留同target显式refresh已有remoteReachable；不会因乐观getter覆盖远程不可达状态。

## 3. 热力图算法

- `usageHeatmapScale.ts`仅包含数据级scale与每格分类；ActivityHeatmap在days变化时memo一次构建。
- 正数不足5仍使用原max比例分支；其余只排序一次并计算原q25/q50/q75/q90线性插值阈值。每格最多4次比较，O(1)。全量为O(D+M log M)，而非每个正格重新排序M项。
- 全零、1-4正数、重复值、MAX_SAFE_INTEGER极值、分位阈值/阈值之后与冻结旧实现等价。输入不被排序修改，112格分类不额外排序，焦点/compact重渲染不重新计算。
- 未改变16/10px固定轨道、月份跨度、intrinsic plot、日期/颜色语义、图例或键盘格子行为。

## 4. 有界排行

- 全量filter/sort继续在既有memo中执行；结果超过60项才窗口化，普通小集保留全部原生列表结果。
- 真正滚动viewport固定26rem，total-height spacer留在该viewport内，卡片不能被N项总高度撑开。
- 扩展现有VirtualizedList的可选ul/li、单个pinned index和一次reveal请求，默认div语义、overscan与所有旧调用不变。ARIA posinset/setsize覆盖完整结果，没有li嵌套li。
- 行高订阅既有applied font scale；完整列为ceil(max(40,40×scale)+1)，紧凑列为ceil(max(40,58×scale)+1)。只观察排行container宽度，选与CSS @2xl一致的固定行变体；不读取computed font、扫描DOM字体或连续按宽度拉伸格子高度。
- header与viewport使用相同stable scrollbar gutter，避免数值列因实际滚动条占位而错位。
- 每次最多一个窗口外pin：列表持焦点时保留active行；焦点离开列表后保留详情origin。origin独立于selectedSkill，clearDetail不立即卸载来源；页面另保存恢复回调，按最新完整索引reveal/focus，filter已移除来源时落到排行group。
- 大列表采用row roving tab stop，匹配项的显式open action保留独立stop。Up/Down/Home/End及Tab/ShiftTab访问完整结果；末项允许Tab离开列表。鼠标滚动不会卸载正在聚焦的行。

## 5. 检查与证据

- 16文件组合：192tests PASS，覆盖usage store/components/Unused、windowing、heatmap、VirtualizedList/Grid、browser fixtures、Central focus/overview/import、GitHub/LocalArchive真实文件树消费者和字体/对比度契约。
- 最后补充延迟refresh越过新background页的单项store回归，随后定向store34tests重跑PASS；加上该回归，共193项独立测试通过。
- `pnpm typecheck`与`pnpm lint` PASS，`git diff --check` PASS。前端build/完整just ci由主会话集成后运行，不重复全量Rust检查。
- jsdom锁定语义、集合、窗口上界、行高订阅与焦点路径，不能证明真实CSS几何。真实浏览器10k DOM/排序/筛选/键盘/焦点、三档scale/核心窗口和最终截图由主会话继续取证。

## 6. 文件与剩余交接

前端变更：`types/usage.ts`、`lib/ipc/commandMap.ts`、`fixtures/usage.ts`、`stores/usageStore.ts`、`ActivityHeatmap.tsx`及新增scale helper、`SkillUsageTable.tsx`、共有`virtualized-list.tsx`、SkillUsageView两处必要focus wiring及相关测试。

`usage_get_page`现有精确handwritten typed entry仅为并行实现的临时桥接。Rust已注册generated command；主会话codegen后必须删除handwritten重叠和其未用import，并用typecheck/IPC parity检查确认生成DTO与UsagePageSnapshot兼容。没有unknown/string逃逸。

主会话须更新frontend spec原Promise.all实现条款为更强coherent getter不变量，以及上述有界渲染/焦点契约。Windows WebView2、实际provider/remote、安装包和PA8生产profile仍需独立证据，不从Vite/jsdom推断通过。

未commit、push或archive，未改Rust、共享FilterControls、全局style或视觉checker的错误状态修复。
