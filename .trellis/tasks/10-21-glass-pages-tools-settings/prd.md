# C8 页面迁移 B：工具与设置页面

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`。依赖：C4 已合入（含 `ui/page-header.tsx`）。可与 C7 并行。

## 文件归属

`src/pages/MarketplaceView.tsx`、`RulesView.tsx`、`SkillsCliView.tsx`、`ObsidianVaultView.tsx`、`SettingsView.tsx` 及其 view-model / bindings / sections；`src/components/marketplace/**`、`import/**`、`rules/**`、`skillsCli/**`、`settings/**`、`startup/**`。不得修改 C5 / C6 / C7 拥有的文件。

## 需求

- R1 每个页面接入 PageHeader，内容区换用 C4 primitives。
- R2 Marketplace 与导入（GitHub / ZIP 预览、分支选择、文件树）：卡片、预览面板、进度与错误状态迁移；保持导入控制器契约（`import-intent-controller.md`、`local-archive-import-controller.md`、`github-preview-snapshot-token.md`）。
- R3 Rules、Skills CLI（含 `InventoryCensus` 等）：面板与表格容器玻璃化，路径 / 命令保留等宽。
- R4 Settings：遵守 `settings-structure.md`；Appearance 重做为“主题（亮 / 暗）+ 窗口材质（C3）+ 字体 + 字号”，删除旧主题预览卡；About 页外层容器改用 `--radius-shell` 统一阶梯（旧 Corner Exceptions 已废止）。
- R5 Obsidian 页面与启动相关组件迁移。
- R6 清理：本范围内手写卡片配方、arbitrary 圆角、非白名单 blur 清零；`uppercase` 逐处判断。

## 验收标准

- [ ] 五个路由及全部 Settings 分页在亮 / 暗 × 1280×800 / 900×600 截图；中 / 英各一轮。
- [ ] Appearance：切换主题、窗口材质、字体、字号均实时生效且持久化（测试 + 实机）。
- [ ] C4 契约测试在本范围内无豁免；现有测试全部通过。
- [ ] `just ci` 全绿。

## 规划产物

`design.md`（迁移映射规则、逐页 surface 表、不变量）与 `implement.md`（按页面拆分提交）已补齐。
