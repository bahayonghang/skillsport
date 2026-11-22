# C7 页面迁移 A：库与技能页面

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`。依赖：C4 已合入（含 `ui/page-header.tsx`）。可与 C8 并行。

## 文件归属

`src/pages/CentralSkillsView.tsx`、`PlatformView.tsx`、`ProjectsView.tsx`、`CollectionsListView.tsx`、`SkillDetailPage.tsx` 及其 view-model / bindings；`src/components/central/**`、`platform/**`、`projects/**`、`collection/**`、`skill/**`（**不含** C6 拥有的 `UnifiedSkillCard.tsx` 及其子组件）、`central/UpdateCenterDialog` 等库相关对话框。不得修改 C5 / C6 拥有的文件。

## 需求

- R1 每个页面接入 PageHeader；页面内容区用 C4 primitives 替换手写卡片 / 面板 / 徽标类。
- R2 Central：侧栏 facet、仓库导航、顶部过滤、密度切换、BulkActionBar（L3 白名单）、分组 sticky 头（L3 白名单）迁移；保持虚拟化网格的固定高度契约。
- R3 Platform：分组列表、来源分类导航、`PlatformTransferRail`（L3 白名单）迁移；保持 `platform-grouping.md`、`platform-origin-classification.md` 契约。
- R4 Projects / Collections / 技能详情：卡片、详情 Markdown 区、元信息区迁移；Markdown 标题保持固定 rem 阶梯，代码块保持等宽。
- R5 对话框（Update Center 等）使用 C4 浮层 primitives。
- R6 清理：本范围内 `ring-1 ring-border` + `rounded-xl` 手写卡片配方、arbitrary 圆角、非白名单 blur 清零；`uppercase` 逐处判断。

## 验收标准

- [ ] 五个路由在亮 / 暗 × 1280×800 / 900×600 截图；Central 另做三档字号与 ≥ 300 技能的滚动观察。
- [ ] C4 契约测试（白名单、圆角、手写表面）在本范围内无豁免。
- [ ] 现有页面与组件测试全部通过，无行为回归（安装 / 卸载、批量操作、过滤、保存视图、导出导入）。
- [ ] `just ci` 全绿。

## 规划产物

`design.md`（迁移映射规则、逐页 surface 表、不变量）与 `implement.md`（按页面拆分提交）已补齐。
