# 主侧栏工作区分组

## Boundaries

只改渲染层和现有 store。不改 Rust、schema、IPC 合同，也不改 Central 卡片。

| 模块 | 职责 |
| --- | --- |
| `src/lib/sidebarWorkspacePrefs.ts` | 读写折叠和排序键。非法值回退默认。 |
| `src/lib/sidebarProjectOrder.ts` | 纯函数排序。置顶优先，再按所选键。 |
| `src/components/layout/SidebarSection.tsx` | 分组标题按钮：箭头、文案、可选的右侧排序 `<select>`。 |
| `src/components/layout/Sidebar.tsx` | 读 store 和偏好，只渲染 Global Workspace 与 Project Workspaces。龙虾目标在这里滤掉，不改 `getPlatformTargetGroups`。不 `invoke()`。 |
| `src/components/layout/AppShell.tsx` | 启动后 `loadProjects()`；目标切换时先清空再拉取。 |
| `src/stores/projectsStore.ts` | 增加 `resetForTargetChange`，只清列表和当前 id，不清掉无关的进行中约定。 |
| `src/stores/centralSkillsStore.installSlice.ts` | `projectPath` 非空且安装调用成功后 `loadProjects()`。 |

## Data flow

1. `AppShell` 在目标列表加载完成后调用 `loadProjects()`。侧栏订阅 `projects`、`scanningProjectIds`。
2. 目标 id 变化时，`resetForTargetChange()` 立即把 `projects` 置空，然后 `loadProjects()` 填入当前库。
3. Projects 页的添加、删除、置顶、安装、卸载继续直接改 store。侧栏跟着变。
4. `installSkill` 与 `batchInstallSkills` 在传入的 `projectPath` 去空白后非空、且 `invoke` 成功（含 skip）之后调用 `loadProjects()`。刷新失败只记项目 store 的 `error`，不把已经成功的安装改判为失败。
5. 排序和折叠不进数据库。`localStorage` 键 `sidebar.workspaceSections.v1`：

```ts
type SidebarProjectSort = "name" | "skillCount" | "recent";

interface SidebarWorkspaceSections {
  globalWorkspace: boolean;
  projectWorkspace: boolean;
  projectSort: SidebarProjectSort;
}
```

默认两个分组都为 `true`，`projectSort` 为 `"name"`。缺键、坏 JSON、未知排序值都回退默认，不抛到界面。不保存龙虾开合。

## Sort

`compareSidebarProjects(left, right, sort)`：

1. `pinned === true` 在前。
2. `name`：`localeCompare`，`sensitivity: "base"`。
3. `skillCount`：数值降序，然后名称升序。
4. `recent`：有 `lastScannedAt` 的在前，时间字符串降序；都没有则 `addedAt` 降序；再按名称升序。

侧栏用这份结果渲染。不改 `list_projects` 的 SQL，也不改 Projects 页自己的名称排序。

## UI

- Global Workspace 的行是 `getPlatformTargetGroups` 的结果里 `category !== "lobster"` 的目标。共享过滤函数不改，避免设置页和技能详情丢龙虾平台。
- 两个标题去掉 `uppercase`。按钮含箭头和文案，`min-h-10`，`aria-expanded` 反映开合。展开用 `ChevronDown`，收起用 `ChevronRight`。
- Project Workspace 展开且侧栏处于加宽状态时，标题行右侧是原生 `<select>`，三个选项对应排序键。`aria-label` 走 i18n。选择器与标题按钮之间 `gap-2`。这是表单控件，不是小于 40px 的独立图标按钮。
- 项目行复用 `NavItem`。图标是 `Folder`。`pinned` 时在名称和徽章之间显示 `Pin`，`title` 用现有 `projects.menuPin` 文案。`scanningProjectIds` 命中时徽章改为 `Loader2`。
- 侧栏宽度处于收起档时不读开合状态，编码平台行和项目行都渲染，标题仍是分隔线，不渲染 `<select>`。龙虾行在这一档也不渲染。
- 活跃项目：`pathname === /projects/${id}`。id 是 16 位十六进制，导航与 `ProjectsView` 一样使用 `encodeURIComponent`。

## Compatibility

- 旧的 `sidebar.categoryCoding` 键保留。
- 没有迁移。已有 `pinned` 继续生效，并压过本地排序键。
- 不引入 `@hello-pangea/dnd`。

## Rollback

改动都在前端。回退提交后，侧栏回到 Coding 标题，`sidebar.workspaceSections.v1` 留在本机也无读者。
