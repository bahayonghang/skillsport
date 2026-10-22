# C8 设计：工具与设置页面迁移

迁移映射规则沿用 C7 `design.md`「迁移映射规则」表（Card / Badge / 去 uppercase / `ui/menu` / `ui/sheet` / `glass-sticky` / PageHeader / 同心圆角）。

## 页面清单与要点

| 页面 / 区域 | 文件（主要） | 旧配方数 | 要点 |
| --- | --- | ---: | --- |
| Marketplace | `MarketplaceView.tsx`、`MarketplaceSkillDetail{Content,Drawer,Summary}.tsx` 等 | 4（upper 7） | PageHeader；市场技能卡走 `UnifiedSkillCard`（C6）；详情抽屉 `ui/sheet`；眉标去 uppercase |
| GitHub / ZIP 导入向导 | `GitHubRepoImportWizard{Body,Chrome,Preview}.tsx`、`components/import/**` | 17 | 向导外壳 dialog（`rounded-shell`）；步骤条用胶囊；文件树与 manifest 预览为子面板（无描边）+ mono；分支选择 `ui/menu`；错误态 `Badge destructive` + 说明文字 |
| Rules | `RulesView.tsx`、`components/rules/**` | 0 | PageHeader；规则列表 Card；路径 mono；遵守 `rules-management.md` |
| Skills CLI | `SkillsCliView.tsx`、`components/skillsCli/**`（含 `InventoryCensus`、`SkillsCliBatchBar`、`SkillsCliDetailDrawer`、`SkillsCliUpdateDrawer`） | 0 | KPI 用 StatTile；图表色用 chart token；`SkillsCliBatchBar` 菜单改 `ui/menu`，两个抽屉改 `ui/sheet`；遵守 `skillsCliPageShell.test.ts` 契约 |
| Obsidian | `ObsidianVaultView.tsx` | 0 | PageHeader + Card |
| Settings 框架 | `SettingsView.tsx`、`SettingsSideNav.tsx`、`SettingsSection.tsx`、`settingsPages.ts` | — | 二级导航与主侧栏同款激活语言；每个 section 一个 Card；遵守 `settings-structure.md` |
| Settings · Appearance | `AppearanceSettingsSection.tsx` | — | 重做为四组：**主题**（亮 / 暗两张预览卡，单选，预览卡为缩略 canvas + 面板示意，无 blur）、**窗口材质**（C3 开关 + 不支持说明）、**字体**（Display / Body 及中文 fallback，沿用 `font-preferences.md`）、**字号**（三档）。C2 已删除 flavor 网格与 accent 选择器，本任务负责最终布局 |
| Settings · About / AI / 远程目标 / 同步等 | `AboutSettingsSection.tsx`、`AiSettingsSection.tsx`、`LocalRemoteSyncDialog.tsx`、`RemoteTargetsSettings*.tsx` 等 | 17（upper 8） | About 外层 `rounded-shell` Card，内两级 `rounded-xl` → `rounded-control`（旧 Corner Exceptions 废止）；对话框 C4 dialog |
| Startup | `components/startup/**` | 0 | `StartupGate` 加载 / 错误态与闪屏（C2 字面值）视觉衔接：glass 胶囊状态 + canvas |

## 不变量

- 导入控制器、预览快照 token、Job 关联与取消、异步失败反馈契约不变。
- Settings 的持久化 key 与行为不变（C2 / C3 已定义的新 key 除外）。
- `GitHubPatSettingsSection` / `SecretValueInput` 只改视觉，凭据仍经 `SecretStore`，不在 UI 回显。
