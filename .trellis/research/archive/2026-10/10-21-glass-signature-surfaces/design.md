# C6 设计：签名表面

## 1. UnifiedSkillCard

组成文件（全部归本任务）：`UnifiedSkillCard.tsx`、`.styles.ts`、`.types.ts`、`UnifiedSkillCardParts.tsx`、`UnifiedSkillCardFooter.tsx`、`SkillCardBadges.tsx`、`SkillCardMeta.tsx`、`SkillCardDenseRow.tsx`、`CompactCardMoreMenu.tsx`（C4 pending 清单：改用 `ui/menu`）、`CardTagEditor.tsx`；以及 `index.css` 中 `.central-skill-card-surface` 等卡片专用规则。

信息层级（对应参考截图卡片）：

```
┌ glass-panel rounded-card p-5 ────────────────────────────┐
│ 技能名（title 600）                       [状态 Badge]    │  ← 截图“gpt-6.1-sol / 已完成”
│ 描述（body，2 行截断，muted）                              │
│ [tag][tag]  （Badge neutral sm）                         │
│ LOBSTER  ◯◯◯◯     CODING ◯◯◯◯  （平台图标行，交互不变）  │
│ 元信息小灰字：来源 · 版本 · 更新时间                       │  ← 截图“7分9秒 平均…”
├ hairline ────────────────────────────────────────────────┤
│ 时间 / 来源（xs muted）          主操作文字链接（primary）  │  ← 截图“…  查看详情”
└──────────────────────────────────────────────────────────┘
```

- 状态 Badge 语义：已安装 / 已同步 = primary（绿）；有更新 / 远程变化 = secondary（紫）；冲突 / 孤儿 / 重复 = warning；失败 = destructive。每个附图标。
- 平台图标：已安装 = primary tint 圆底 + 图标；未安装 = 描边空心；按压用 `scale-[0.96]` 双轨规则不变。
- dense 行（`SkillCardDenseRow`）同步语言但保持行高契约（`centralVirtualItemHeight`，C4 已更新）。
- `skill-card-scenarios.md` 的场景 props 接口不变；五场景截图逐一核对。

## 2. Dashboard（`components/dashboard/**`、`DashboardView.tsx`）

| 区块 | 现状 | 新形态 |
| --- | --- | --- |
| `StatusHeader` | `surface-glass rounded-2xl`，状态点 + 上次扫描 + 摘要 + 3 个 CTA | `PageHeader`：标题 + meta（上次扫描 · 摘要）+ actions（3 个按钮：主操作 default，其余 glass） |
| `HealthOrbit`（readiness） | `readiness-card` + 锥形渐变 `readiness-score-plaque` + 4 个因子进度条 | 左：`StatTile tone=primary` 显示 score（label“就绪度”）；右：4 个因子行（文本 + 数值 + 细进度条 primary），进度条不再嵌套盒子；删除锥形渐变与网格 mask |
| 计数（central 总数、updates、aiReview、uncategorized、unassigned、sources） | 散在各面板 | 一行 StatTile：central 总数 = primary；updates / aiReview = secondary；uncategorized / unassigned = neutral。只读 `dashboardCentralSummary`（数据契约 1 不变） |
| `WorkQueuePanel` / `AgentsPanel` / `ActivityPanel` / `TopTagsPanel` / `LogsPanel` | `surface-glass` 面板 | `Card`；列表行用 hairline 分隔；Activity 图表用 chart token；Top tags 用 `Badge` |

信息量不减（DESIGN 旧“密度定位”在新 DESIGN.md 中以“密度但有层级”保留）；只改材质与层级。

## 3. Skill Usage（`components/usage/**`、`SkillUsageView.tsx`）

- `UsageMetricStrip`（calls / skills / projects）→ 3 个 StatTile：calls = primary（输入侧语义）、skills = secondary、projects = neutral。
- `ActivityHeatmap`：色阶改为 primary 的 5 级 tint（亮 / 暗各一套），“今日”保留描边 + `aria-current`；`ProviderHealthList`、`RecentCallsFeed`、`SkillUsageTable`、`UnusedSkillsPanel` 用 Card + Badge。
- `UnusedSkillUnlinkDialog` 用 C4 dialog。

## 4. 运行日志（`components/logs/**`、`OperationLogsView.tsx`）

- `LogsKpiRow` 4 指标 → StatTile：total = neutral、successRate = primary、avgDuration = secondary、failures = neutral 底 + `destructive-text` 数字与图标。StatTile 只提供 primary / secondary / neutral 三种底色，不新增 destructive 底，保持“一主一辅”。
- 级别标签 → Badge；`LogsListRow` 路径 / 消息保留 mono；`RuntimeLogsPanel` 双栏 Card；`OperationLogDetailDialog` 用 C4 dialog。
- 遵守 `observability-console.md`。

## 5. 旧规则清理

删除 `.surface-glass`、`.bg-orbit` 别名（C2 留下）、`.readiness-card`、`.readiness-score-plaque` 及其伪元素规则；`text-display-score` / `text-display-hero*` 若无消费者则从 `@theme` 删除并同步 `typography-tokens.md`。
