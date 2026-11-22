# 实施清单

- [x] 用户明确批准实施；已启动，按 Trellis implement/check 流程执行。
- [x] Local 首页底部记录 before、viewport/DPR、字号、数据规模、面板与图宽、两区域顶部。
- [x] 统一外壳/标题/KPI，消除重复边界，保持相邻日志面板和页面滚动。
- [x] 调整分布区布局与文字角色，解除 242px 图宽限制，保留完整平台和共同尺度。
- [x] 更新 InventoryCensus.test.tsx，覆盖统计值、零值、长名称、多来源、大计数、空库存与可访问文本。
- [x] 保留 DashboardView.test.tsx 的 Local-only 和 Central summary 隔离断言。
- [x] 库存、Dashboard 及 typography/font/theme/i18n 六文件 51 项测试通过。
- [x] typecheck、lint、build 通过；实际渲染矩阵及最终断点两侧测量完成。
- [x] 集成 just ci 通过；after、几何、消费者范围与证据层记录于父任务。

来源并排断点由初稿 48rem 校正为 60rem，平台双列仍为 44rem；避免窗口变宽反而挤回单列。与排序子任务无功能依赖，未添加内部列表滚动。产品实施和检查完成，本地代码已提交，用户已授权归档；原生 WebView2 / 安装器未验证。证据见 ../10-12-sidebar-dashboard-visual-polish/research/implementation-validation.md。
