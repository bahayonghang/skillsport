# C7 执行计划

前置：C4 已合入；读 design.md 映射规则与 `platform-grouping.md`、`platform-origin-classification.md`、`skill-card-scenarios.md`、`async-error-feedback.md`。

按页面提交，每个提交独立可回退；每步后跑该区域测试 + `pnpm typecheck` + `pnpm lint`：

1. **Central 主体**（PageHeader、过滤胶囊、分组 sticky、两个菜单迁移）。
2. **Central 侧栏**（CentralSidebar / Blocks / FacetSection）。
3. **Central 批量与浮条**（BulkActionBar、Batch* / Delete 对话框）。
4. **Central 仓库同步 / AI 标签 / 分类 / 任务中心**（含 3 个抽屉迁移 `ui/sheet`）。
5. **Update Center 与 deprecated 对话框**（只替换 primitives）。
6. **Platform**（含 `PlatformSkillToolbarMenus`、`PlatformTransferRail`）。
7. **Projects、Collections**。
8. **技能详情**（含 `SkillDetailModalShell`）。
9. **契约收紧**：从 C4 pending 清单中删除本任务迁移完的文件；确认清单内不再有本任务范围文件。
10. **视觉**：五个路由 × 亮 / 暗 × 1280×800 / 900×600 截图；Central 三档 Scale + ≥ 300 技能滚动观察；存 `research/`。
11. **收尾**：`just ci`。
