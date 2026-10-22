# Phase 3.4 提交计划（用户已确认，代码已提交）

## 1. `fix(sidebar): 🐛 简化项目排序入口并保留可访问热区`

- `src/components/layout/SidebarSection.tsx`
- `src/i18n/locales/en.json`
- `src/i18n/locales/zh.json`
- `src/test/components/layout/Sidebar.test.tsx`
- `.trellis/spec/frontend/icon-control-hit-area.md`

## 2. `fix(dashboard): 🐛 优化库存概览的响应式布局`

- `src/pages/DashboardView.tsx`
- `src/components/skillsCli/InventoryCensus.tsx`
- `src/test/components/skillsCli/InventoryCensus.test.tsx`
- `.trellis/spec/frontend/dashboard-data-contract.md`

未识别的脏文件：无。以上均属于本次实施。

三个任务目录（父任务与两个子任务）的 PRD、设计、实施记录、上下文、截图和测量证据属于 Trellis bookkeeping；保留到代码提交后的归档步骤，由 task archive 单独提交。本次确认只执行以上两个本地 work commits，不 push、不 amend。原生 WebView2 和安装器未验证，详见 implementation-validation.md。

执行结果：侧栏 e2a83f44；首页 9205fd7b。用户同时明确授权两个子任务及父任务归档；归档和 journal 使用独立 bookkeeping commits。未推送远端。
