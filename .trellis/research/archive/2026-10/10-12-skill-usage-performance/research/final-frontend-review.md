# 最终前端性能与交互审查

审查范围：性能与视觉两个任务的 check.jsonl、PRD/design/implement，usage store/DTO/fixture、ranking windowing、shared VirtualizedList、heatmap threshold、页面和详情/最近调用交互。遵守前端 IPC、字体 scale、40px 动作槽及状态契约；不修改 Rust、generated 或 docs 脚本。浏览器与 Windows 原生窗口证据由主会话独立获取。

## Findings (fixed)

### 1. 切换 source 后留下旧 source 详情

- 文件：`src/stores/usageStore.ts`。
- 复现：source 请求期间保留旧页，旧页仍可点选详情。请求开始时清理 detail 不足以保护此后新打开的旧来源详情。新 source 提交时留下旧详情，或因旧详情响应被 source 守卫拒绝而留下永久 `detailLoading`。
- 修复：source 快照提交时再次比较当前 source，失效 detail sequence，并在同次提交清理 selectedSkill/detail/detailLoading。
- 回归：分别覆盖旧详情已成功和仍 pending 两种时序，均先失败后通过；迟到详情不能重新提交。

### 2. 旧 target 的 detail 错误仍可提交

- 文件：`src/stores/usageStore.ts`。
- 复现：active target 已变，而 target-changed 事件尚未到达；旧 detail 成功路径有 target/source/skill 守卫，错误路径只有 sequence 守卫。
- 修复：成功和失败使用相同的 sequence/target/source/selected-skill 条件。
- 回归：旧 target 失败不能覆盖新 target 的错误/详情状态，先失败后通过。

### 3. refresh 的二次 page read 过期后继续触发后续动作

- 文件：`src/stores/usageStore.ts`。
- 复现：filtered refresh 必须追加 page read 时切换 target；page 数据被正确拒绝，但随后仍请求当前 target 的 unused 并显示旧 target 的缓存提示。
- 修复：page read 结束后再检查 refresh sequence/target，过期即返回，不继续 unused 或 toast。
- 回归：该时序下不存在 unused IPC 或旧缓存 toast，先失败后通过。

### 4. recent 详情开闭卸载来源按钮，无法归还焦点

- 文件：`src/pages/SkillUsageView.tsx`。
- 复现：最近调用从右栏顶部移到底部时，两个条件渲染位置没有稳定 key，React 卸载整个 feed；关闭详情的旧 trigger 已断开 DOM。
- 修复：两个 recent section 分支共享 `key="recent"`，让同一父级的重排保留 feed 与按钮身份。
- 回归：pending 和 failed 详情中来源按钮都保持连接，关闭后回到原按钮，先失败后通过。

### 5. 完全相同的调用产生重复 React key 和错误行数

- 文件：`src/components/usage/RecentCallsFeed.tsx`。
- 复现：两个五字段完全相同的调用合法共存，原 skill/time/session key 重复；前插一条不同调用后实际渲染出三个重复调用行，并出现 React console error。
- 修复：使用五字段 tuple + 同组 occurrence ordinal 作为 key；保持 multiplicity、已有节点身份和最新20范围，不去重调用。
- 回归：相同调用均存在，前插不同调用时两条原触发节点保留，console error 为零，先失败后通过。

### 6. 前端状态契约仍描述旧 Promise.all 读取

- 文件：`.trellis/spec/frontend/skill-usage-state.md`。
- 修复：同步 coherent page、完整排名、source 消失 All 二次读取、scan-completed provider/freshness、source commit detail 清理、错误与后续动作 guards、60结果阈值/26rem viewport、scale固定行高、键盘全量可达、单个pin与焦点恢复、recent稳定身份和重复调用key契约。

## 已检查且未发现偏差

- entry/TTL/force/source/background 均保留完整51/144/1k技能集合；无只取前50逻辑。
- source/target/page sequence 与 pending source intent 的刷新/后台交接；source 消失必须读取 All 后才提交，不把 filtered 快照更名为 All。
- provider health、freshness、overview、recent 同次提交；后台更新不启用页面 skeleton/toast，也不把 DB-only page read 当作远程可达探测。
- filter/sort 始终作用于全集。>60列表采用有界 DOM，既有 overscan不变，单个额外pin；ul/li + aria-posinset/setsize有效，首末、双向Tab、Arrow/Home/End可达。
- fixed row geometry订阅已应用font scale；一次card ResizeObserver处理列布局，不逐行观察或从computed style读取scale。
- origin卸窗后关闭、排序后定位、过滤移除后的ranking group焦点回退；focused row在pointer scroll期间保留。
- shared VirtualizedList旧消费者继续默认div、原spacing/overscan/viewport行为；新增语义/reveal/pin均为可选。
- heatmap阈值只随dataset排序一次，render-only更新不重算；冻住旧classifier作为等价oracle，112cells与compact几何不变。
- 40px控件、dark pressed hover、pending/failed detail可关闭、page error保留与初载KPI skeleton；现有字体与主题策略未变化。

## Verification

- `pnpm typecheck`: PASS。
- `pnpm lint`: PASS，全仓前端ESLint无warning。
- 定向Vitest：10文件155测试PASS，覆盖usage组件/store/windowing/heatmap、shared virtualizer、Unused、字体/对比度/字号和browser fixture。
- `git diff --check`: PASS（仅Git LF/CRLF提示，没有whitespace错误）。
- 第一次加入IPC契约的11文件运行：165 PASS / 1 FAIL。唯一失败为新 `usage_get_page` 尚未进入生成产物；Rust registry已包含它。这是主会话明确拥有的 `pnpm ipc:codegen` 和临时handwritten项清理依赖，未手改generated或削弱测试，生成后应重跑覆盖契约。
- 主会话共享18组浏览器布局数据：1360/1380/1400宽的ranking clientWidth与scrollWidth各为690/690、710/710、730/730，未发现完整列门槛溢出；42rem无需调整。最后Recent修复触发HMR，主会话将重新确认最终console/截图。
- `just ci`、最终generated determinism、完整browser状态、Windows WebView2与benchmark质量门由主会话收口；本报告不将jsdom代替真实几何/桌面证据。

## Findings (not fixed)

没有未修复的前端产品问题。真实环境/全仓质量门属于主会话集成工作，在完成前不能将整项优化任务标记完成。

## 浏览器检查后补充

- 主会话实测Unused Open/Unlink可见按钮28px。旧实现虽有独立40px槽和40px伪元素热区，本次统一为按钮本体 `size-10 min-h-[40px] min-w-[40px] md:size-10`，使视觉边界和有效热区一致；保留两槽、gap-2与至少88px动作列，不扩列或覆盖相邻动作。
- 对应20个Unused测试PASS，明确同时覆盖Open和Unlink本体/槽；全仓lint PASS。frontend spec同步可见按钮契约。
- 主会话已验证recent重复3行场景无console错误，以及18组窗口无page/region/ranking横向溢出；Unused修改后的窄窗几何由主会话重跑。
- 该时点codegen产物已经生成，typecheck暂FAIL：生成的 `UsageKpis` count为`number | null`，而实际前端领域类型要求`number`；错误出现在get_page四处store提交。已交主会话/Rust DTO拥有者修正源契约，不cast或手写generated。此前typecheck PASS保留为生成前历史，不代表当前集成门已通过。
- 随后主会话源契约/生成物同步到位，重跑 `pnpm typecheck` PASS。上条FAIL作为并行集成时的历史记录保留。
- `ipcCommandCoverage.test.ts` 重跑12/12 PASS，已确认新命令的生成登记、handwritten无重叠与runtime/frontend覆盖契约。
