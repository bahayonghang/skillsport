# C9 全量视觉矩阵（父任务 AC8 / 本任务 R4）

> 2026-10-21。环境：`pnpm dev`（Vite，`http://localhost:24200`）+ 浏览器 IPC fixtures；headless Chrome（CDP，`--disable-gpu`，DPR 1）。脚本：`matrix-harness.mjs`（本目录，可复跑：`node matrix-harness.mjs <outDir> [nameRegex]`）。截图：`matrix/*.webp`（quality 80）；逐张度量：`matrix/_report.json`。

## 覆盖

按 C9 `design.md` 的缩减方案：

| 维度 | 范围 | 张数 |
| --- | --- | --- |
| 全路由基线 | 23 个路由键 × 亮 / 暗 × 1280×800 × Scale 1 × zh / en | 92 |
| 高风险扩展 | Dashboard、Central、Settings·Appearance、技能详情（`skill` 浏览器占位 + `skill-content` 注入内容）× 亮 / 暗 × {900×600, 1280×800, 1440×900} × {0.875, 1, 1.125} × zh / en，去掉与基线重复的 1280×800·s1 | 5 × 32 = 160 |
| 合计 | | **256** |

路由键：`dashboard`、`central`、`platform-claude-code`、`platform-codex`、`rules`、`skills-cli`、`projects`（空态）、`projects-detail`、`discover`（重定向到项目页）、`collections`、`marketplace`、`marketplace-import`（GitHub 导入向导打开并填 URL 后点预览）、`skill`、`skill-content`、`obsidian`、`obsidian-vault`、`logs`、`usage`、`settings-appearance` / `connections` / `platforms` / `integrations` / `skill-sources` / `about`。

命名：`matrix/<route>-<theme>-<w>x<h>-s<scale>-<lang>.webp`（theme 为 `light` / `dark`）。

### 演示态注入（仅脚本内，不改仓库）

浏览器 fixture 没有项目数据，技能详情在非 Tauri 运行时显示占位。为覆盖这两个页面，脚本在页面内通过 Vite 模块图注入数据：

- `projects-detail`：向 `useProjectsStore` 写入 2 个项目与 3 个项目技能，并注册 `get_project_skills` fixture，然后点选项目与 Claude Code 分类。
- `skill-content`：向 `useSkillDetailStore` 写入 `detail` 与一份含 **GFM 表格**、行内代码、引用块和代码块的 SKILL.md。仓库内没有任何 fixture 渲染 markdown 表格，此项专为检查表头而加。
- 字号档位通过 `import('/src/lib/displayFont.ts').applyFontScale(s)` 施加（与设置页同一函数）；`_report.json` 的 `fontScale` 字段逐张确认生效。

## 自动度量

每张截图记录：文档 / `<main>` 横向溢出、视口右侧越界元素（排除位于横向滚动容器内的子元素）、控制台错误与未捕获异常、`data-theme`、`--font-scale`。

**256 / 256：无横向溢出、无越界元素、无控制台错误，主题与字号均按预期生效。**

## 人工审阅

方法：每组 6–12 张拼成联系表逐张浏览，可疑处看 1:1 原图或 DPR 2 重拍。全路由亮 / 暗 × 中 / 英全部看过；高风险路由的 900×600 与 1440×900 全部看过。

### 发现并已修复（C9 最小修复）

| ID | 问题 | 位置 | 修复 | 证据 |
| --- | --- | --- | --- | --- |
| F1 | Markdown 引用块用 3px 彩色左侧条（C7 引入），违反 DESIGN.md「无 `border-left/right > 1px` 彩色侧边条」 | `src/index.css` `.skill-markdown blockquote` | 改为中性 callout：`--accent` 底 + 1px `--border` 全描边（底色不变，对比度不变） | `matrix/skill-content-*` |
| F2 | Markdown 表格右侧有约 10px 空带，表头底色提前截断。`.scrollbar-subtle` 的 `scrollbar-gutter: stable` 给只横向滚动的容器预留了竖向滚动条槽位（`dev` 上即存在） | `src/index.css` | `.skill-markdown .skill-markdown-table, .skill-markdown pre.scrollbar-subtle { scrollbar-gutter: auto; }` | `matrix/skill-content-*` |
| F3 | 设置 → 帮助与关于 → 应用更新：「更新状态」胶囊被两个按钮挤成「Not …」/「待检…」。行布局按视口 `sm:` 断点切横排，但卡片本身只有约 330px 宽 | `src/components/settings/AboutSettingsSection.tsx` | 改为按可用宽度换行：`flex flex-wrap items-center justify-between gap-3`，按钮组整体落到状态下方 | `matrix/settings-about-*` |

修复后已重拍受影响的截图（`skill-content-*` 36 张、`settings-about-*` 4 张）。其余截图不渲染受影响组件。

### 专项检查

- **Central PageHeader（actions 槽换行）**：900×600 下三档字号、中英文均正确换行，标题、元信息（计数 · 路径 · 修改位置）、操作按钮行、搜索行、筛选行依次堆叠，无裁切、无重叠；1280×800 下元信息与操作同行右对齐。见 `matrix/central-*-900x600-*`、`central-*-1280x800-*`。
- **Markdown 表头**：`skill-content` 在两主题与三档字号下表头为 label 字重、`muted-foreground`、句首大写，与表体分隔清晰；F2 修复后表头底色铺满容器。
- **玻璃层级**：侧栏、卡片、StatTile、对话框在亮 / 暗下层次一致；GitHub 导入对话框（L3）为唯一有真实模糊的大面积表面。

### 已知问题（未修，需用户确认）

| ID | 现象 | 判断 |
| --- | --- | --- |
| K1 | Skills CLI 页「上次检查 2026-06-26T00:00:00.000Z」直接显示 ISO 时间串 | `dev` 上同样如此（`SkillsCliView.tsx` 把 `lastSuccessAt` 原样传给 i18n），属于数据格式化行为，不属于本次视觉语言替换范围；建议单独开 issue 用 `timeAgo` / 本地化日期格式化。 |
| K2 | 900×600 下 设置 的分区导航变为横向条，右侧被截断 | 该容器为 `overflow-x-auto`（`SettingsSideNav.tsx`），属于 DESIGN.md 允许的「容器内横向滚动」。headless 截图隐藏了滚动条，真机上可滚动；只是除截断外没有额外的可滚动提示。可在后续迭代加渐隐遮罩。 |
| K3 | 技能详情在 < 1024px（`lg`）时右侧元信息栏堆叠到正文上方，900×600 首屏看不到 SKILL.md 正文 | 既有响应式断点（`lg:flex-row`），非本次引入；可接受，建议后续评估是否把正文放前。 |
| K4 | Skills CLI 英文搜索框占位符「Search name, source, or pat…」被截断 | 输入框宽度受工具条挤压，占位符截断不影响功能；轻微。 |
| K5 | 浏览器演示态限制：技能详情（无注入时）、GitHub 预览、窗口材质只显示占位 / 「不支持」状态 | 环境限制，非缺陷；Mica 与真实数据需在安装包中验收（见 `installer.md`）。 |

## 未覆盖 / 未验证

- 截图来自 headless Chrome（Blink），不是 Windows WebView2；字体渲染、`backdrop-filter` 合成与滚动帧率（父任务 AC4）**UNVERIFIED**，需真机。
- 未做交互态全覆盖（hover / focus-visible / 按下），这些由 C4 primitives 截图与契约测试覆盖；本矩阵只抽查了对话框与导入向导。
- 热区重叠只通过视觉检查，没有逐元素测量。
- README 截图（`images/01–06.png`）同样来自 fixture 演示态（1300×900，DPR 2，PNG 256 色量化）；中央库卡片名是排版验证 fixture（`dense-typography-validation-…`）。如需展示真实数据，应在真机安装包中用真实技能库重拍。
