# 实施清单

## Order

1. 加 `sidebarWorkspacePrefs` 与 `sidebarProjectOrder`，先写单元测试：默认值、坏 JSON、三种排序、置顶优先、未扫描排后。
2. 给 `projectsStore` 加 `resetForTargetChange`。在 `AppShell` 启动路径调用 `loadProjects()`，在目标切换路径先 reset 再 load。
3. 在 `installSkill` 和 `batchInstallSkills` 的项目路径成功分支调用 `loadProjects()`。刷新失败不推翻安装结果。补 store 测试。
4. 抽 `SidebarSection`，改 `Sidebar`：只保留 Global Workspace 与 Project Workspaces 的开合、项目行和排序选择器。删掉龙虾分组渲染。图标条忽略这两个分组的折叠。`Sidebar.test.tsx` 改为：龙虾显隐打开时主侧栏仍没有 OpenClaw；编码平台在两类显隐都关闭时仍在。补 projects store mock。
5. 补 en/zh 文案。确认 `categoryCoding` 的旧字符串还在。
6. 跑侧栏、偏好、排序、projects store、central install、AppShell 相关测试。实现完成前跑 `just ci`。

## Validation

```bash
pnpm exec vitest run src/test/lib/sidebarWorkspacePrefs.test.ts src/test/lib/sidebarProjectOrder.test.ts src/test/components/layout/Sidebar.test.tsx src/test/components/layout/AppShell.test.tsx src/test/stores/projectsStore.test.ts src/test/stores/centralSkillsStore.test.ts
just ci
```

迭代中可以只跑第一行。宣布仓库工作完成前跑 `just ci`。

## Risky files

- `src/components/layout/Sidebar.tsx`：平台路由和收起布局已有测试，改标题时保留 `platformRoute` 与图标条行为。
- `src/components/layout/AppShell.tsx`：目标切换已经串联多个 reset。项目 reset 必须和其他 reset 一起发生，避免只清项目、平台仍是旧目标。
- `src/stores/centralSkillsStore.installSlice.ts`：只在 `projectPath` 成功后刷新。全局 agent 安装不触发 `loadProjects()`。

## Rollback

前端提交可单独回退。无 schema，无生成文档。

## Follow-up before start

- 实现前读 `.trellis/spec/frontend/index.md` 指向的 module boundaries、icon hit area、typography、async UI test stability。
- 不跑 `task.py start`，直到这份规划和 `prd.md`、`design.md` 被用户接受。
