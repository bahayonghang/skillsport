# 一键清理：前端入口、确认对话框与进度

父任务：`11-02-central-clear-all`。IPC 契约见父目录 `design.md` §3–§6。
依赖：后端子任务 `11-02-central-clear-backend` 实现步骤 2（类型与命令签名）完成后开工；service 未完成前用 fixture。

## 范围

- 三个入口：工具栏 `⋯` 菜单危险项、中央仓库为空时的空状态按钮、命令面板动作。
- `ClearCentralSkillsDialog`：预览 → 确认 → 执行进度 → 结果，四个阶段。
- store slice、IPC adapter、fixture、i18n（中英文）、Vitest 测试。

## 不在范围

- 后端逻辑；CLI；Settings 页面入口。

## 验收标准

- [ ] `⋯` 菜单最底部（分隔线之后）出现危险样式"一键清理中央仓库…"，`data-testid="central-clear-all-open"`。
- [ ] 中央仓库总数为 0 且无筛选条件时，空状态出现次级按钮"检查残留安装"，打开同一对话框。
- [ ] 命令面板可搜索到"一键清理中央仓库"。
- [ ] 对话框标题显示当前目标（Local / SSH 名称 / WSL 发行版），防止误删其他目标。
- [ ] 预览按 Agent 聚合展示，不逐 skill 渲染；路径明细默认折叠、限高滚动；`truncated` 时显示"仅显示部分"。
- [ ] copy 安装默认保留，可逐 Agent 勾选删除；项目链接、孤儿链接、未登记中央条目各有开关（默认开启）。
- [ ] 确认需输入 i18n 定义的确认短语；预览全空或短语不匹配时确认按钮禁用；取消不调用 apply。
- [ ] 提供"先导出备份"链接，打开现有 Portability 对话框。
- [ ] 执行中显示阶段 + 进度条 + 取消按钮；对话框不可通过遮罩/ESC 关闭（只能取消）。
- [ ] 完成后只调用一次 skills 刷新与一次 `refreshCounts`；清空选中状态与仓库筛选。
- [ ] 部分失败：对话框保持打开，列出失败项（名称/路径 + 错误码，经 `formatBackendError`），提供"重新预览"。
- [ ] 所有文本在 `src/i18n/` 中英文齐全；组件不直接调用 `invoke()`。
- [ ] Vitest 覆盖下方 design §6 全部用例；`pnpm lint`、`pnpm typecheck`、`pnpm test` 通过。
