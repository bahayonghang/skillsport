# 现状分析：1.0.2 视觉体系 vs 「轻盈毛玻璃」目标

> 2026-10-21 规划期调研。所有结论均带源码证据；行号以 `dev@5ba455ca` 为准。

## 1. 参考截图解读（`reference-screenshot.webp`）

截图是另一款产品（非 SkillPort）的“绘画检测记录”页，只作**视觉语言**参考，不复制其信息架构、文案或品牌。

| 观察 | 设计语言要点 | 对应 SkillPort 落点 |
| --- | --- | --- |
| 全窗背景为薄荷绿 → 浅薰衣草紫的低饱和大面积渐变 | L0 canvas，明亮、不抢内容 | `AppShell` 根 canvas |
| 左侧导航是一整块半透明白面板，与窗口边缘留白，圆角大 | 浮动玻璃侧栏 | `Sidebar.tsx` |
| 激活导航项：极浅薄荷底 + 薄荷色细描边 + 薄荷色图标/文字，胶囊/大圆角 | 激活态靠浅底色+描边，不靠实色块与发光 | 替换现有「渐变填充 + 发光 + 3px 左缘指示条」 |
| 侧栏底部「深色模式」「收起」两个次级入口 | 明暗切换放侧栏底部 | 现 TopBar 主题按钮迁移候选 |
| 页面标题粗体，右上角小号灰字元信息（“最新记录在前 · 仅保留近 8 小时”） | 标题区：粗标题 + 次要灰字 | 各页面 header |
| 三列卡片网格，卡片 = 半透明白 + 1px 白描边 + 极淡阴影，圆角约 20px | L2 玻璃内容面板 | `UnifiedSkillCard`、Card |
| 卡片右上角状态胶囊「已完成」：浅绿底 + 绿字 | 语义胶囊标签 | Badge / status pill |
| 图片右下角浮层按钮「放大查看 ↗」：白色胶囊 | 次级操作 = 白色胶囊按钮 | Button outline/glass 变体 |
| 两个并排数据块：「↓ 输入 token 76」浅绿底、「↑ 输出 token 21,870」浅紫底，大号数字 + 小图标标签 | 语义双色：绿 = 输入/完成，紫 = 输出/次要；强调色作极浅底色区分信息块 | 新增 `StatTile`，用于 Dashboard / Usage / 技能卡统计 |
| 元信息行小号灰字（耗时、平均速率、思考 tokens），底部细分隔线 + 时间戳 + 右侧强调色文字链接「查看详情」 | 次要信息降级为小灰字；文字链接用主强调色 | 卡片 footer |
| 图标为细线性（lucide 风格，线宽偏细） | 线性图标、线宽统一 | lucide `strokeWidth` 全局统一 |

## 2. 现行设计源与新方向的冲突（必须在 C1 改写）

`DESIGN.md`（Catppuccin「调度台」）与 `PRODUCT.md` 有以下条款与新方向**直接矛盾**：

| 现行条款 | 位置 | 新方向 |
| --- | --- | --- |
| Theme-Is-Identity：6 主题 × 14 accent 承载个性 | DESIGN.md §2、PRODUCT.md Brand Personality | 完全替换为玻璃亮/暗两主题，固定一主一辅语义色 |
| Mono-Body Rule：正文默认 JetBrains Mono | DESIGN.md §3 | 正文默认无衬线（Geist），等宽仅用于代码/路径/ID |
| Glass-Is-Earned / Flat-By-Default | DESIGN.md §4 | 玻璃是默认材质（分层预算控制真实 blur） |
| 卡片圆角封顶 14px，2xl 仅登记例外，禁止 24px+ | DESIGN.md §5–6 | 统一 16–20px 大圆角，按钮/标签胶囊 |
| 禁止「渐变大数字、hero-metric」 | DESIGN.md §6、PRODUCT.md Anti-references | 允许语义浅底 StatTile 大号数字（非渐变文字），仍禁止渐变文字 |
| 侧栏 active：渐变填充 + 发光 + 3px 左缘条 | DESIGN.md §5 Navigation | 浅底 + 细描边胶囊，无发光 |

仍然保留的原则：WCAG 2.1 AA、键盘可达、色不独立承载信息、`prefers-reduced-motion`、本地优先的诚实、密度但有层级、`UnifiedSkillCard` 唯一实现、固定 rem 字号阶梯、禁止渐变文字与彩色侧边条。

## 3. 主题体系耦合面（完全替换的影响半径）

| 面 | 证据 | 替换动作 |
| --- | --- | --- |
| 6 flavor token 块 + 14 accent 块 + latte/claude-light accent 覆写 | `src/index.css:260-930`（约 670 行） | 删除，新增 `glass-light` / `glass-dark` 两块 |
| `@custom-variant dark` 枚举 4 个暗色 flavor | `src/index.css:9` | 改为 `[data-theme='glass-dark']` |
| `ThemeFlavor` / `CatppuccinAccent` / `ACCENT_NAMES` / `fontThemeModeForFlavor` | `src/stores/themeStore.ts:5-63` | 收敛为 2 值；accent 删除；localStorage 迁移 |
| 主题消费者 | `TopBar.tsx`、`AppearanceSettingsSection.tsx`、`main.tsx`、`settingsPageSections.tsx`、`settingsViewBindings.ts`、`settingsViewModel.ts:54-67`（`--ctp-*` 映射） | 改为明暗切换；删除 accent 选择器 |
| `--ctp-*` 被 TS 引用 | `src/lib/statusTone.ts:5`、`src/pages/settingsViewModel.ts:54+` | 改用语义 token |
| Dashboard 专属表面 | `src/index.css:1376-1560` `.surface-glass` / `.bg-orbit` / `.readiness-*` 与 latte/claude-light 变体 | 由新表面层取代 |
| 契约测试 | `src/test/contracts/themeContrast.test.ts`（6×14 矩阵）、`themeSwitchSuppression.test.ts`、`fontContract.test.ts`、`typographyContract.test.ts`；`src/test/stores/themeStore.test.ts`、`src/test/components/layout/TopBar.test.tsx`、`src/test/pages/SettingsView.test.tsx` | 重写为 2 主题矩阵，保留抑制契约 |
| 规范 | `.trellis/spec/frontend/theme-switch.md`、`typography-tokens.md`、`font-preferences.md` | 签名与默认值更新 |
| 启动闪屏与窗口底色 | `index.html:12` `.startup-card`（字面值 Catppuccin 色）、`src-tauri/tauri.conf.json:23` `backgroundColor: #1e1e2e` | 改为玻璃 canvas 字面值 |

## 4. 性能约束：WebView2 与 backdrop-filter

- 任务 `archive/2026-07/07-20-dashboard-home-overhaul` 实测：8 张卡片 × `blur(22px)` + `blur-3xl` 光斑是 Windows WebView2 滚动掉帧主因，因此 `.surface-glass` 去掉了 `backdrop-filter`（`src/index.css:1376-1378` 注释）。
- 现存真实 blur 使用点 7 处：`BulkActionBar.tsx:64`、`CentralGroupedSkillList.tsx:120`、`CentralSidebar.tsx:536`、`FacetSection.tsx:48`、`PlatformGroupedSkillList.tsx:30`、`PlatformTransferRail.tsx:119`、`ui/dialog.tsx:39`——全部是 sticky 条或浮层，即「内容在其下方滚动」的场景。
- 关键推论：在**低频柔和渐变背景**上，卡片有无 `backdrop-filter` 肉眼几乎无差（被模糊的背景本来就是平滑的）。真实 blur 只在「有内容在其下方滚过」时才产生可见差异。因此分层预算（滚动内容面板用仿玻璃、仅 sticky/浮层用真实 blur）能以近乎零视觉损失避开 07-20 的性能坑。

## 5. 窗口材质（Mica）现状

- `src-tauri/Cargo.toml:24-27`：`tauri = "2"`，无 `window-vibrancy` 依赖、无 `set_effects` 调用。
- `tauri.conf.json:15-24`：单窗口，`visible: false`（启动后显示）、`backgroundColor: #1e1e2e`、无 `transparent`。
- Tauri 2 提供 `WindowEffect::Mica`（Windows 11 22000+），需要窗口 `transparent: true` 且 webview 背景透明才能透出；Windows 10 不支持 Mica，透明窗口无效果时会**真的透明**，所以必须有不透明降级。
- 窗口非激活时 Mica 由 OS 自动退化为纯色——这是系统行为，不是缺陷。

## 6. 字体偏好迁移陷阱

- `src/lib/displayFont.ts:95-113` 默认 `body: "jetbrains"`；`writeFontProfile`（`:617-627`）在迁移时写入 profile 的全部字段。
- 推论：老用户的 v2 key 里可能已经落盘 `body_font_*_v2 = jetbrains`，无法区分“主动选择”与“默认落盘”。只改 `DEFAULT_FONT_PROFILE` 不会影响这批用户。C2 必须在 v2 落盘值上做一次性决策（见 C2 design.md D-F1）。

## 7. 样式表面规模（迁移工作量估计）

- 生产 TSX 约 204 个；组件目录：central 52、skill 23、settings 22、marketplace 17、skillsCli 14、logs 13、usage 13、ui 15、platform 8、layout 7 等。
- 卡片签名 `ring-1 ring-border` 与 `rounded-xl` 分散在 50+ 文件——必须先把卡片/面板语言收进 primitives（C4），页面迁移（C7/C8）才能大量删除手写类而不是逐个改色。
- `dark:` 变体 49 处 / 10 文件，依赖 `@custom-variant dark`，C2 改写变体后会自动跟随。
- `uppercase` 76 处：新风格偏好正常大小写的小灰字，C4/C7/C8 逐处判断（不做机械替换）。
