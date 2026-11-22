# skills-manager 主侧栏对照

用户决定：本任务的主侧栏只保留 Global Workspace 和 Project Workspaces。上游的 Lobster Agents 分组不搬过来，本仓库主侧栏也不再渲染龙虾分组或龙虾平台行。

来源：`https://github.com/xingkongliang/skills-manager` 的 `src/components/Sidebar.tsx`（2026-10-12 读取的默认分支）。

## 采用

- Global Workspace 与 Lobster、Projects 都是分组标题。标题是按钮，用 `ChevronDown` / `ChevronRight` 展开和收起子行。
- 项目行是扁平的：文件夹图标、`project.name`、技能数。点击进入该项目路由。没有在侧栏里展开技能。
- 分组没有项目时，上游仍保留标题和「添加项目」。本任务没有项目时不渲染 Project Workspace，因为顶部 Projects 入口已经负责添加。

## 不采用

- 项目顺序由 `@hello-pangea/dnd` 拖拽，并调用 `reorderProjects` 写入后端。本仓库没有该依赖，`projects` 也没有顺序列。用户已选方案 A：置顶优先，再按名称、技能数或最近扫描在本地切换。
- Coding / Lobster 工具行也可拖拽，顺序存在 `localStorage`（`skills-manager:tool-order`、`skills-manager:lobster-tool-order`）。本任务不给平台行加排序。
- 悬停出现的拖拽手柄、删除项目、分组内的「添加项目」、同步健康点、「All Agents」总览行、Presets 分组。
- 折叠状态只用 `useState(true)`，刷新后回到展开。本任务把三个分组的开合和项目排序键记在 localStorage。
