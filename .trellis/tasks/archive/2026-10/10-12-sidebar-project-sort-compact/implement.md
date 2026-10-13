# 实施清单

- [x] 用户明确批准实施；已启动，按 Trellis implement/check 流程执行。
- [x] 浏览器渲染真实 Sidebar，记录 before、标题空间和相邻热区几何。
- [x] 在 SidebarSection 更换入口，保留 props/onChange，补充中英文当前排序提示。
- [x] 更新 Sidebar.test.tsx，通过菜单操作覆盖三种排序、恢复、不误折叠、Esc 和焦点恢复。
- [x] Sidebar + i18n 34 项定向测试通过；含偏好/排序共 40 项通过。
- [x] typecheck、lint 通过；窗口、主题、语言、字号、折叠及实际点击验证见父任务证据。
- [x] build 和完整 just ci 通过；原生 WebView2 / 安装器未验证，已单列报告。

与库存子任务无功能依赖，回退只含本子任务改动。产品实施和检查完成，本地代码已提交，用户已授权任务归档。证据见 ../10-12-sidebar-dashboard-visual-polish/research/implementation-validation.md。
