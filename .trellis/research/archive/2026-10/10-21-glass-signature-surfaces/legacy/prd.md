# C6 签名表面：技能卡 / Dashboard / Usage / 日志

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`。依赖：C4 已合入。可与 C5 并行。

## 文件归属

`src/components/skill/UnifiedSkillCard.tsx` 及其直接子组件 / 样式、`src/components/dashboard/**`、`src/pages/DashboardView.tsx`、`src/components/usage/**`、`src/pages/SkillUsageView.tsx`、`src/components/logs/**`、`src/pages/OperationLogsView.tsx`；`src/index.css` 中 `.surface-glass` / `.bg-orbit` / `.readiness-*` 别名与旧规则的删除。

## 需求

- R1 UnifiedSkillCard（central / platform / project / marketplace / collection 五场景）：L2 玻璃卡；标题粗体；右上状态胶囊；平台图标行保持即时安装 / 卸载交互与 LOBSTER / CODING 分行；次要元信息小灰字；footer 细分隔线 + 时间 / 来源 + primary-text 文字操作。保持 `skill-card-scenarios.md` 的显式场景接口不变。
- R2 Dashboard：用 StatTile 表达关键数量（语义：绿 = 已安装 / 完成，紫 = 次要统计），删除 `.readiness-score-plaque` 锥形渐变等旧控制室装饰，改为玻璃面板 + tint 信息块；保持 `dashboard-data-contract.md` 与“密度定位”的信息量（只改层级与材质，不删区块）。
- R3 Skill Usage：指标行改为 StatTile；热力图 / 排行 / 图表配色改用 C1 定稿的 chart token，色不独立承载信息；保持 `skill-usage-state.md` 交互契约。
- R4 运行日志：Operation / Runtime 两栏玻璃化；级别标签用 StatusPill；日志正文与路径保留等宽字体。
- R5 删除 C2 留下的 `.surface-glass` / `.bg-orbit` 别名与 `.readiness-*` 旧规则，确认无其他消费者。
- R6 `uppercase` 微标签在本范围内逐处判断：真正的短标签可保留，其余改为正常大小写小灰字。

## 验收标准

- [ ] 五种卡片场景在亮 / 暗下截图；安装 / 卸载、pin、标签编辑等交互测试全部通过。
- [ ] Dashboard、Usage、日志在 1280×800 与 1440×900 × 亮 / 暗 × 三档字号截图；无裁切、无横向滚动。
- [ ] Central（≥ 300 技能，网格）与 Dashboard 在 Windows WebView2 下滚动观察记录（与 C2 基线对比）。
- [ ] `rg "surface-glass|bg-orbit|readiness-score-plaque" src` 为 0。
- [ ] 相关现有测试（`DashboardView.test.tsx`、Usage、Logs、UnifiedSkillCard）全部通过；`just ci` 全绿。

## 规划产物

`design.md`（卡片信息层级与状态语义、Dashboard / Usage / Logs 区块映射表、旧规则清理清单）与 `implement.md` 已补齐。
