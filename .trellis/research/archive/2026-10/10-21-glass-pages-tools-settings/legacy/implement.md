# C8 执行计划

前置：C4 已合入；C3 合入后才做 Appearance 的窗口材质分组（未合入时该分组暂缺，不阻塞其他步骤）。读 design.md 与 `settings-structure.md`、`import-intent-controller.md`、`local-archive-import-controller.md`、`github-preview-snapshot-token.md`、`rules-management.md`、`font-preferences.md`。

按页面提交，每步后跑该区域测试 + `pnpm typecheck` + `pnpm lint`：

1. **Marketplace**（含详情抽屉）。
2. **导入向导**（GitHub / ZIP、分支菜单）。
3. **Rules**、**Obsidian**。
4. **Skills CLI**（含 BatchBar 菜单与两个抽屉）。
5. **Settings 框架**（SideNav、Section）。
6. **Settings · Appearance**（四组布局；`SettingsView.test.tsx` 覆盖主题单选、材质开关、字体、字号实时生效与持久化）。
7. **Settings 其余分页**（About、AI、远程目标、同步对话框等）。
8. **Startup**。
9. **契约收紧**：从 C4 pending 清单删除本任务迁移完的文件。
10. **视觉**：五个路由 + 全部 Settings 分页 × 亮 / 暗 × 1280×800 / 900×600 × 中 / 英截图，存 `research/`。
11. **收尾**：`just ci`。
