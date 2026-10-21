# C5 玻璃应用外壳：侧栏 / 顶栏 / 全局浮层

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`。依赖：C4 已合入。可与 C6 并行。

## 文件归属

`src/components/layout/**`（AppShell、Sidebar、SidebarSection、TopBar、GlobalSearchDialog、ShortcutsSheet、TargetQuickSwitcher）、`src/App.tsx` 的路由加载占位。（`PageHeader` 已移至 C4 `ui/page-header.tsx`。）

## 需求

- R1 Canvas：AppShell 根挂 `.glass-canvas`（L1），固定不随 `<main>` 滚动；与 C3 的 `data-window-material` 协作（Mica 时带 alpha）。
- R2 浮动玻璃侧栏：L2 面板，与窗口边缘留白（建议 12px），`--radius-shell`；保留折叠（208 ↔ 56px）与拖拽调宽（168–360px）行为不变。
- R3 导航项：默认小号前景 + 细线图标；hover 浅底；激活 = `tint-primary` 浅底 + primary 细描边 + primary-text，胶囊或 `--radius-control`；删除渐变填充、发光与 3px 左缘指示条。计数徽标用 `tabular-nums` 小胶囊。
- R4 侧栏底部：明暗切换（调用 `toggleFlavor`）与“收起”入口，参照截图；TopBar 主题按钮移除，侧栏底部是唯一明暗入口（design.md D-S3）。
- R5 TopBar：保留为透明工具条（design.md D-S1），与侧栏视觉统一；搜索入口、目标切换器保持现有键盘行为。
- R6 全局浮层：GlobalSearchDialog / ShortcutsSheet / TargetQuickSwitcher 使用 C4 浮层 primitives。
- R7 键盘与可访问性：侧栏全键盘可达，焦点环在玻璃面板上可见；折叠态图标有可访问名称；`prefers-reduced-motion` 下折叠无动画。

## 验收标准

- [ ] 900×600 / 1280×800 / 1440×900 × 亮 / 暗 × 折叠 / 展开截图；与参考截图的侧栏语言一致（浮动面板、浅底激活项、底部明暗与收起）。
- [ ] 折叠、调宽、项目排序（`SidebarSection`）等现有测试全部通过，行为无回归。
- [ ] 只存在一个明暗切换入口（侧栏底部），TopBar 不含主题按钮（测试断言）。
- [ ] 键盘遍历侧栏与全局浮层的录屏或步骤记录。
- [ ] `just ci` 全绿。

## 规划产物

`design.md`（D-S1–D-S8：TopBar 保留为透明工具条、明暗切换唯一入口在侧栏底部、侧栏头部行删除）与 `implement.md` 已补齐。
