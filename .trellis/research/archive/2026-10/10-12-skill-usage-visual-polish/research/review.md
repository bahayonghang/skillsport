# 视觉子任务独立审查

日期：2026-10-12。角色：`trellis-check`。已读取完整 native hook、check.jsonl 全部上下文、PRD/design/implement、相关 frontend/quality specs 和仓库构建/交接说明。未改 store、typed IPC、后端、heatmap 阈值算法；并行代理的修改均保留。

## Findings (fixed)

- File: `src/components/usage/UsageFilterControls.tsx`
  - Issue: 共享 `Button size="sm"` 的 `md:min-w-0` 在桌面断点覆盖普通 `min-w-[40px]`，短标签/serif/小字号不能保证 40px 最低宽度。
  - Fix: 显式覆盖 `md:min-w-[40px]`；回归测试检查合并后的最终类不再携带 `md:min-w-0`。真实按钮矩形由主会话补测。
- File: `src/components/usage/UsageFilterControls.tsx`
  - Issue: 共享 ghost variant 的 `dark:hover:bg-muted/50` 未被普通 `hover:bg-primary` 覆盖；暗色选中按钮悬停时会丢失选中面，却保留 `primary-foreground`。
  - Fix: 显式覆盖 `dark:hover:bg-primary`，回归测试检查合并后的最终类无旧 dark-hover fill。主会话补测实际配色。
- File: `src/pages/SkillUsageView.tsx`
  - Issue: 已有 `selectSource` 失败路径保留 overview 并写入 error，但 `error && !overview` 隐藏错误，违反状态契约。
  - Fix: 保留旧排行并显示页级错误；详情错误由详情面板单独承载，避免重复 alert。不改 store 协议。
- File: `src/components/usage/SkillUsageDetailPanel.tsx`, `src/pages/SkillUsageView.tsx`
  - Issue: 详情请求失败后 `detailLoading=false/detail=null` 仍渲染永久 skeleton；pending/error 分支无关闭入口。
  - Fix: 接收现有 error，失败后用 inline alert 替换 skeleton；pending/error/正常状态共享 40px close action，调用既有关闭与焦点返回流程。三个行为回归先复现失败后通过，覆盖错误与旧排行、pending/failed close、failed-detail focus return。
- File: `src/pages/SkillUsageView.tsx`, `src/components/usage/ProviderHealthList.tsx`
  - Issue: provider disclosure 与可交互 provider 行只有 rem padding + line-height，小字号不能保证 40px 高度；provider 行缺少明确 pressed/focus 路径。
  - Fix: 保留 40px 最小高度，并为可交互行加入 `aria-pressed` 与 focus-visible ring；新增可达性回归。折叠时首屏几何不受影响。
- File: `.trellis/spec/frontend/skill-usage-state.md`
  - Fix: 同步 cached-page error、pending/failed detail close、Button responsive/dark 覆盖及 provider 动作热区契约。

## Review coverage

- Checked 9 / changed 9 / left 0 旧消费者：SkillUsageView、Metric、Platform、Table、Heatmap、Recent、Detail、Unused、ProviderHealth；新增共享控件单列，不计入旧消费者数。该计数指源码与语义/契约审查，不等于真实浏览器视觉全部通过。
- 初载 `overview === null && error === null` 为 skeleton authority，KPI 无零闪现；缓存错误保留数据，远程 warning/background hint 仍可达；筛选保持 view-local；解绑语义未变。
- 排行/Unused/Detail 按自身 container 宽度切换列。固定 track、列间 gap、padding 与 40px 动作槽已检查；三档 root scale 的布局结论仍以主会话真实矩形为准。
- Heatmap default 1rem、compact 0.625rem 固定轨道，日期完整、月周跨度与单周残月省略、legend/axis intrinsic wrapper、roving arrows 均保留。已向主会话释放该文件算法区域，性能代理可改分类计算，不得改变已验收几何。

## Findings (not fixed)

无本次审查遗留的产品源码问题。以下为验证缺口，交由主会话完成：

- 修复后的真实浏览器按钮矩形、暗色 hover、错误/detail/焦点与 compact 几何。主会话此前报告的 15-case 矩阵（默认页头到排行下降 44.6%、plot 占比 98.3%、legend delta 0）是修改前的集成证据，不能替代本次补测。
- 虚拟化后来源行卸载时的详情关闭焦点返回由前端性能代理负责；本审查测试证明当前已挂载触发行的返回。
- Windows WebView2 初载、最小窗、最大化/还原、缓存后台刷新没有本代理原生证据；浏览器与 build 不能替代。
- 最终 build 与 `just ci` 由主会话统一执行，review 子代理未重复运行。

## Verification

- Lint: PASS — `pnpm lint`。
- TypeCheck: PASS — `pnpm typecheck`。
- Tests: PASS — 六文件定向 Vitest，103 tests；比实施阶段新增六个回归。
- Diff whitespace: PASS — `git diff --check`，仅行尾转换提示。
- Build / full CI: 未由本审查重跑，主会话最终门。

无 commit、push、archive 操作。
