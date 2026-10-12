# 主侧栏 Global Workspace 与 Project Workspace

## Goal

主侧栏的平台区只保留两个分组：Global Workspace 与 Project Workspaces。原 Coding 分组改为 Global Workspace，其下新增 Project Workspaces。项目行是扁平的，点击进入现有项目页。这两个分组可以展开和收起。项目顺序置顶优先，并可在名称、技能数、最近扫描之间切换。主侧栏不再出现龙虾分组或龙虾平台。

## User Value

技能装进某个项目后，不必先打开顶部 Projects 页，就能在主侧栏看到这个项目并进入它。全局平台列表仍在原处，标题与参考图的 Global Workspace 对齐。

## Background

参考图与 [skills-manager](https://github.com/xingkongliang/skills-manager) 的主侧栏都把全局 agent 和项目工作区放在同一条侧栏里。对照结论见 `research/skills-manager-sidebar.md`。

- Coding 分组是标题加平台行：`src/components/layout/Sidebar.tsx:345-368`。平台来自 `category !== "lobster"` 的目标，计数来自 `skillsByAgent`。龙虾分组在其上：`Sidebar.tsx:319-343`。默认分类显隐里龙虾是关闭的（`src/lib/platformVisibility.ts:20-24`），打开后主侧栏才会列出 OpenClaw 这类平台。`Sidebar.test.tsx:287-307` 覆盖「显隐关闭时隐藏」，`309-328` 覆盖「两类都关闭时编码平台仍在」。
- `sidebar.categoryCoding` 现为 Coding / 编程类（`src/i18n/locales/en.json:448`，`zh.json:448`）。设置页和技能详情也用这把键（`src/pages/settingsViewModel.ts:129`，`src/components/settings/PlatformDialog.tsx:217`，`src/components/skill/SkillDetailSidebar.tsx:197`）。
- 顶部 Projects 入口进 `/projects`：`Sidebar.tsx:249-256`。项目页用 `project.name` 和 `skillCount`，点击进 `/projects/:id`（`src/components/projects/ProjectsShell.tsx:179-216`，`src/pages/ProjectsView.tsx:92-96`）。
- `list_projects` 的 `skillCount` 是安装行数（`src-tauri/src/services/projects/crud.rs:177-192`）。库内顺序是置顶、最近扫描、添加时间（`src-tauri/src/db/repos/projects_repo.rs:55-64`）。`projects` 没有 `sort_order`。项目 id 是路径哈希的 16 位十六进制（`crud.rs:121-128`）。
- `loadProjects()` 目前只在打开 Projects 页时调用（`ProjectsView.tsx:61-64`）。Central 的 `installSkill` / `batchInstallSkills` 在带 `projectPath` 时写库，但不刷新项目 store（`src/stores/centralSkillsStore.installSlice.ts:48-103`、`105-138`）。Projects 页自己的安装、卸载、添加、删除会改 store（`src/stores/projectsStore.ts:138-164`、`245-258`、`274-312`）。
- 目标切换时 `AppShell` 重置多个 store，其中没有项目 store（`src/components/layout/AppShell.tsx:110-116`）。
- 侧栏整栏收起已经存在（`Sidebar.tsx:116-130`）。分组标题在收起时变成分隔线。
- 已归档任务 `09-10-central-skill-project-destinations` 排除了「主侧栏列出项目」。本次是新的侧栏入口。Central 卡片仍用路径末段，不用 `projects.name`。

## Requirements

- **R1.** 主侧栏原 Coding 分组的可见标题改为 Global Workspace / 全局工作区。其下只保留现在的编码类平台行、路由和计数。这些平台行没有排序控件，也不能拖拽。编码类显隐仍走现有规则，包括「两类显隐都关闭时编码平台仍显示」。
- **R2.** 主侧栏不再渲染龙虾标题，也不渲染 `category === "lobster"` 的平台行。`categoryVisibility.lobster` 为 true 时同样不出现。平台区只有 Global Workspace，其下紧接 Project Workspaces。
- **R3.** 新增 `sidebar.globalWorkspace` 与 `sidebar.projectWorkspace`。英文是 Global Workspace、Project Workspaces；中文是全局工作区、项目工作区。`sidebar.categoryCoding` 与 `sidebar.categoryLobster` 继续给设置页和技能详情用。
- **R4.** Global Workspace 与 Project Workspaces 的标题是可切换的按钮，带展开或收起图标。收起后隐藏该组的行。开合状态写入 localStorage，重新进入后保持。默认都展开。不为龙虾或其他分组增加折叠。
- **R5.** Project Workspace 的每一行是一个已登记项目：显示 `project.name`，悬停标题为完整路径，徽章为 `skillCount`（含 0）。置顶项目在名称旁显示图钉。该项目正在扫描时，徽章位置显示旋转指示。没有任何已登记项目时，不渲染该分组。
- **R6.** 项目排序始终把 `pinned` 放前面。其余顺序由 Project Workspace 标题上的选择器决定，三档为名称升序、技能数降序、最近扫描降序。未扫描的项目在「最近扫描」里排在已扫描之后。选择写入 localStorage，默认名称。同键再按名称升序打破平局。
- **R7.** 点击项目行进入 `/projects/:id`，当前路由匹配时该行选中。顶部 Projects 导航保留。
- **R8.** 应用启动并完成目标加载后就拉取项目列表，不依赖先打开 Projects 页。切换目标时先清空上一目标的项目，再拉取当前目标的列表。Central 安装在带有项目路径且调用成功后刷新项目列表，跳过已存在目标的结果也包括在内。
- **R9.** 主侧栏收成图标条时，忽略这两个分组的开合状态，编码平台行和项目行仍显示为图标，名称在悬停中。排序选择器只在侧栏展开且 Project Workspaces 展开时出现。图标条里也不出现龙虾平台。
- **R10.** 这两个分组标题用文案本身的大小写，不再套 CSS `uppercase`。其余导航项不变。
- **R11.** 用户可见文案走 `src/i18n/` 的 en 与 zh。侧栏组件不直接 `invoke()`。项目数据来自 `useProjectsStore`。

## Acceptance Criteria

- [ ] **AC1.** 展开的主侧栏中，原 Coding 标题显示为 Global Workspace / 全局工作区；其下编码类平台与改前一致，点击仍进入对应 `/platform/:id`。
- [ ] **AC2.** 设置页和技能详情里的编程类 / Coding 文案不变。
- [ ] **AC3.** 已登记项目出现在 Global Workspace 下方。名称是 `project.name`，徽章是安装数（含 0），悬停能看到完整路径，置顶项有图钉。没有项目时不出现该分组。
- [ ] **AC4.** 点击项目行进入 `/projects/:id`，该行选中。顶部 Projects 入口仍在。
- [ ] **AC5.** 冷启动后不先进入 Projects 页，侧栏已能列出项目。带项目路径的 Central 安装成功后，新项目或新的技能数出现在侧栏，无需重启。切换目标后不残留上一目标的项目。
- [ ] **AC6.** Global Workspace 与 Project Workspaces 可各自收起和展开，刷新页面后状态仍在。收起 Project Workspaces 后项目行不可见。主侧栏没有龙虾标题；`categoryVisibility.lobster` 为 true 时也不出现 OpenClaw 等龙虾平台行。
- [ ] **AC7.** 排序选择器在置顶优先的前提下切换名称、技能数、最近扫描，顺序立即改变，刷新后选择仍在。Global Workspace 的平台行顺序不变。
- [ ] **AC8.** 主侧栏收成图标条时，已收起的分组仍然显示图标行，项目行可点击，名称在悬停中。
- [ ] **AC9.** 前端测试覆盖 AC1–AC8 的渲染与 store 刷新。无 schema 变更，不跑 `pnpm docs:gen`。完成前 `just ci` 通过。Windows 安装包与真实 SSH 目标上的侧栏刷新标为 UNVERIFIED。

## Out of Scope

- 删除龙虾平台数据、`/platform/:id` 路由，或设置页、技能详情、全局搜索、安装目标里的龙虾类。
- 去掉或替换顶部 Projects 入口，或重做 Projects 页内部列表。
- 修改 Central 技能卡片上的项目芯片。
- 修改 Install 对话框，或扫描磁盘以发现未登记目录。
- 拖拽排序、`reorderProjects`、项目 `sort_order` 列、侧栏内删除或添加项目、同步健康点、All Agents 总览行。
- 给全局平台行增加排序或拖拽。
- 在侧栏展开某个项目下的已装技能。

## Key Decisions

- 改应用主侧栏，不改 Central 筛选侧栏。
- 主侧栏平台区只有 Global Workspace 和 Project Workspaces。龙虾分组从主侧栏移除，不并入 Global Workspace。
- 分组顺序：Global Workspace 在上，Project Workspaces 在下。
- 交互按方案 A。skills-manager 只提供折叠标题和扁平项目行；它的拖拽排序不进入本任务。
- 行上的名字用 `projects.name`。完整路径只做悬停。Central 卡片继续用路径末段。
- 折叠和排序键存在一个 localStorage 对象里。侧栏收成图标条时不应用折叠，避免无法再展开。
- 列表加载放在 `AppShell` 的启动和目标切换，安装刷新放在 Central install slice 的项目路径成功路径。侧栏只读 store。

## Risks

- 习惯从主侧栏打开龙虾平台的用户，之后要改从设置或其他仍列出龙虾平台的入口进入。`/platform/:id` 本身还在。
- 只落盘、未登记的项目安装不会出现，直到再次安装登记或用户在 Projects 页添加。
- 远程目标的项目列表取决于当前 target 的库。真实 SSH 侧栏刷新不作为完成门。
- `loadProjects()` 会把 `isLoading` 设为 true。Projects 页当前不用这个标志做全页加载；实现时不要让侧栏的刷新清空用户正在看的项目技能缓存。
