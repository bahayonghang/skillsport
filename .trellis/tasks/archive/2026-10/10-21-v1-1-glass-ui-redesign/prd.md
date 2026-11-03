# 1.1.0 轻盈毛玻璃界面重构（父任务）

## 目标与授权

用户要求：以 `/design-md` 为入口，为 SkillPort 1.1.0 创建界面重构任务，采用「轻盈毛玻璃」设计语言，达到与参考截图（`research/reference-screenshot.webp`）类似的效果；先深入分析，再创建 Trellis 任务。本轮交付为**分析与规划**：不包含产品实现、`task.py start`、版本发布或远端写入。所有任务保持 `planning`，PR base 为 `dev`。

父任务持有源需求、决策记录、任务映射与跨子任务验收；它本身不是实现目标。

## 源需求：设计语言（用户原文要点）

- **材质**：多层半透明白色面板叠在柔和背景上；面板带背景模糊（约 16–24px）、1px 白色半透明描边、极淡的大范围阴影，营造通透、有层次的纵深。
- **背景**：大面积低饱和冷色渐变（薄荷绿 → 浅薰衣草紫），可点缀几块模糊光斑；明亮干净，不抢内容。
- **色彩**：整体以白和浅灰为基调；只用一主一辅两个强调色并赋予语义（绿 = 完成 / 输入，紫 = 输出 / 次要数据）；强调色同时作为极浅底色区分信息块。
- **形状**：统一大圆角（16–20px）；按钮和标签用胶囊形；线性图标，线条细而一致。
- **层级**：大号数字和粗标题突出重点；次要信息用小号灰字；留白充足，分组清晰。
- **质感**：克制、轻盈、清新、精致；避免高饱和霓虹色、厚重阴影和过度炫光。

截图只作视觉语言参考，不复制其信息架构、文案或品牌（解读见 `research/current-state-analysis.md` §1）。

## 已确认决策（2026-10-21，用户在规划期选择）

| ID | 决策 | 影响 |
| --- | --- | --- |
| D1 | **完全替换**主题体系：只保留「玻璃亮 / 玻璃暗」两个主题；删除 Catppuccin 4 风味、Claude 亮/暗与 14 accent 选择器 | 老用户的 flavor/accent 偏好失效，需一次性迁移到对应明暗；主题契约测试重写 |
| D2 | 1.1.0 **同时交付玻璃暗色** | 两套 token 都要过 AA 对比度矩阵 |
| D3 | 模糊策略 = **分层预算 + Win11 原生 Mica**：真实 `backdrop-filter` 只用于 sticky 条与浮层；滚动内容面板用仿玻璃；窗口底用 Windows 11 Mica，Win10 降级为不透明渐变 | 新增 Rust 窗口材质逻辑与透明窗口；需真机证据 |
| D4 | 正文默认改为**无衬线**（Geist）；代码 / 路径 / ID 仍用等宽 | 字体默认值与迁移策略变更 |

### 规划补完期决策（2026-10-21，用户授权“需要拍板的都按推荐”）

| ID | 决策 | 记录位置 |
| --- | --- | --- |
| D5 | 正文字体迁移采用方案 A：一次性把落盘的旧默认 `jetbrains`（且无自定义）改为 `geist`，带迁移标记 | C2 `design.md` D-F1 |
| D6 | Mica 状态经显式命令 `set_window_material` 获取；默认不透明；偏好 key `window_material_v1`；IPC 策略 `runtime_only(InternalRefresh)`；Win10 不用 Acrylic 降级 | C3 `design.md` D-M1–D-M7 |
| D7 | 真实模糊只经 `.glass-overlay` / `.glass-sticky` 两个 CSS 类；TSX 禁止 `backdrop-*` utility | C4 `design.md` D-P1 |
| D8 | 新 primitives：Badge、StatTile、Menu、Sheet、Toaster、PageHeader（PageHeader 归 C4，使 C5–C8 只依赖 C4） | C4 `design.md` D-P2 |
| D9 | 直接用 base-ui menu / dialog 的 12 个文件与旧卡片配方文件进入“待迁移清单”，只减不增，C9 时必须为空 | C4 `design.md` D-P6 |
| D10 | TopBar 保留为透明工具条；明暗切换唯一入口移到侧栏底部（与“收起”并列）；侧栏头部行删除 | C5 `design.md` D-S1–D-S3 |
| D11 | Dashboard 不删区块：readiness 锥形评分盘改为 StatTile，计数改为 StatTile 行，数据契约不变 | C6 `design.md` §2 |
| D12 | 已标 `@deprecated` 的旧对话框仍有消费者，本次只换 primitives 不删除 | C7 `design.md` |
| D13 | CHANGELOG 沿用 `[Unreleased]` 现状，新增双语 `release-notes/1.1.0.md` | C9 `design.md` |

## 需求

- R1 设计源：`DESIGN.md` 与 `PRODUCT.md` 改写为轻盈毛玻璃体系，成为后续所有子任务的唯一视觉依据（→ C1）。
- R2 主题底座：玻璃亮/暗 token、canvas 背景、表面层级工具类、圆角/阴影/模糊 token、主题 store 与迁移、对比度契约（→ C2）。
- R3 窗口材质：Windows 11 Mica + Win10 不透明降级，主题与材质联动（→ C3）。
- R4 基础组件：按钮/标签胶囊化、玻璃 Card、输入、浮层、开关、Toast，新增语义 `StatTile`（→ C4）。
- R5 应用外壳：浮动玻璃侧栏、顶栏、全局浮层、页面标题区（→ C5）。
- R6 签名表面：`UnifiedSkillCard` 五场景、Dashboard、Skill Usage、运行日志（→ C6）。
- R7 页面迁移：其余全部页面与对话框迁移到新语言，清除旧手写表面类（→ C7、C8）。
- R8 版本与验收：版本号 1.1.0、CHANGELOG / README 对齐、全量视觉矩阵、Windows 安装包验收（→ C9）。

## 约束（继承仓库规则）

- 所有用户可见文案走 `src/i18n/`；公开表述变化时 `README.md` / `README_CN.md` 同步。
- 组件不直接调用 Tauri `invoke()`；状态在领域 Zustand store。技能卡只用 `UnifiedSkillCard`。
- 新增 Tauri 命令后运行 `pnpm docs:gen` 并提交生成物。
- 主题切换继续遵守 `theme-switch.md` 的过渡抑制契约；字号继续遵守 `typography-tokens.md` 的 no-growth 契约（新增的语义字号 token 需登记，不得用 `text-[...]`）。
- Windows x64 Tauri 安装包是一等验收面；前端构建通过不代表打包结果。
- 每个子任务结束前跑 `just ci`；视觉类结论必须有截图证据，不得用静态检查代替。

## 任务映射

| 子任务 | 交付 | 依赖 |
| --- | --- | --- |
| C1 `10-21-glass-design-source` | DESIGN.md / PRODUCT.md 改写、token 定稿 | — |
| C2 `10-21-glass-theme-foundation` | 主题 token、store、迁移、契约测试、闪屏 | C1 |
| C3 `10-21-glass-window-material` | Win11 Mica + 降级 | C2 |
| C4 `10-21-glass-primitives` | ui/ 基础组件 + StatTile + PageHeader | C2 |
| C5 `10-21-glass-app-shell` | 侧栏 / 顶栏 / 全局浮层 / 页面标题区 | C4 |
| C6 `10-21-glass-signature-surfaces` | 技能卡 / Dashboard / Usage / 日志 | C4 |
| C7 `10-21-glass-pages-library` | Central / Platform / Projects / Collections / 技能详情 | C4 |
| C8 `10-21-glass-pages-tools-settings` | Marketplace / 导入 / Rules / Skills CLI / Obsidian / Settings | C4 |
| C9 `10-21-v1-1-0-release-prep` | 1.1.0 版本号、文档、全量视觉与安装包验收 | C1–C8 |

C3 与 C4 可在 C2 之后并行；C5、C6、C7、C8 在 C4 之后可并行，但 C7/C8 不得改 C5/C6 拥有的文件。顺序依赖已写入各子任务 PRD。

## 跨子任务验收标准

- AC1 设计源：`DESIGN.md` 为玻璃体系且与代码 token 一致；旧版有带时间戳的备份；`PRODUCT.md` 不再出现「6 主题 × 14 accent」作为身份表述。
- AC2 主题：应用只存在 `glass-light` / `glass-dark`；任何旧 localStorage flavor 首启后落到对应明暗，不出现无主题或闪烁；accent 选择器不存在。
- AC3 对比度：两主题下正文 ≥ 4.5:1、大字 ≥ 3:1，**按玻璃面板在 canvas 最不利点上的合成色计算**；语义浅底块上的文字同样达标。
- AC4 性能：Central（≥ 300 技能，网格）、Dashboard、Usage 在 Windows 真机 WebView2 上滚动无明显掉帧；真实 `backdrop-filter` 使用点只出现在 DESIGN.md 登记的白名单中（契约测试守卫）。
- AC5 材质：Win11 上窗口底透出 Mica 且随明暗切换；Win10（或模拟“不支持”路径）为不透明渐变，无透明穿透、无白闪。
- AC6 一致性：生产 TSX 中不再有绕过 primitives 的手写卡片表面（判定规则由 C4 契约测试给出）；圆角只使用登记阶梯；不存在渐变文字、霓虹高饱和色与厚重阴影。
- AC7 可访问性：键盘全流程可达，焦点环在玻璃表面上清晰可见；`prefers-reduced-motion` 降级；状态不只靠颜色。
- AC8 视觉矩阵：亮/暗 × 字号三档 × 900×600 / 1280×800 / 1440×900 × 中/英，覆盖全部路由；无横向滚动、裁切、热区重叠；截图存档于 C9 `research/`。
- AC9 发布前置：版本号三处一致为 1.1.0（`pnpm version:check`），CHANGELOG / CHANGELOG.zh / README / README_CN 对齐；NSIS 安装包在 Win11 与 Win10 安装、启动、主题切换验收通过。

## 范围外

- 信息架构、路由、功能与数据契约变更（只换视觉语言，不改行为）。
- 打 tag、发布 GitHub Release、updater 元数据发布（按发布指南另行授权执行）。
- 非 Windows 平台的窗口材质（macOS vibrancy 等）。
- 自定义主题 / 用户自定义强调色。

## 风险

- 完全替换主题会让依赖 Catppuccin 个性的老用户失去偏好 → CHANGELOG 明示，迁移到最接近的明暗。
- 透明窗口 + Mica 在 WebView2 上可能有缩放闪烁、启动白闪、DPI 边缘问题 → C3 独立可回退，C2 产物在无 Mica 时完整可用。
- 全页面迁移工作量大，易出现半新半旧 → C4 先收敛 primitives，再以契约测试约束页面迁移完成度。
