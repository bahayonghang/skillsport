# 统一下拉层样式并支持本机字体搜索

## Goal

设置、日志、技能详情和更新中心里的下拉框，打开后必须使用与菜单相同的轻盈毛玻璃弹出层。外观设置里的四个字体选择器还要列出这台机器上已安装的字体，并能滚动、搜索后选中。用户不再看到 Windows 灰底系统菜单盖住字体试样。

## Background

截图（Appearance / Typography，Glass Dark，Display Chinese fallback 打开）显示：闭合控件已用 `rounded-control`、`border-input`、`bg-input-surface` 和薄荷焦点环，弹出层仍是操作系统绘制的灰底列表。试样「SkillPort skill management / Aa 0123」紧贴在列表下方，被这块系统窗口压住。Windows 上 `<select>` 的弹出层不参与页面绘制，CSS 改不了它的底色、字体、圆角和模糊。

根目录 `DESIGN.md` 已是定制后的 `style:glassmorphism`（SkillPort light glass）。弹出层契约在 `DESIGN.md`「其余 primitives」和 `.trellis/spec/frontend/glass-surfaces.md`：Menu / 下拉使用 L3 `.glass-overlay` + `rounded-card`，项使用 `rounded-control`，高亮为 `bg-accent`。`src/components/ui/menu.tsx` 已按此实现。生产代码里没有 Select primitive。`@base-ui/react` 已安装，含 `select` 与 `combobox`。

当前共 15 处原生 `<select>`，清单见 `research/native-select-inventory.md`。`PlatformMultiSelect` 和 `TargetQuickSwitcher` 不是原生 select，不在本次范围内。

字体偏好由 `src/lib/displayFont.ts` 持久化。Display 预设为 `geist | jetbrains | inter | serif | system | custom`，Body 为 `jetbrains | geist | inter | system | custom`，中文 fallback 为 `system | sourceHanSerif | custom`。自定义值是单个 family 字符串，写入既有 `*_custom_*_v2` setting。契约禁止把用户输入拼成任意 CSS stack，禁止为 fallback 新增字体文件。Source Han 只查找系统字体。Geist、Inter、JetBrains Mono、Instrument Serif 由应用打包，不一定出现在系统字体集里。

## Confirmed Facts

- 闭合控件和弹出层是两套视觉。闭合态接近 Input token，弹出态是系统控件。证据：用户截图；`AppearanceSettingsSection.tsx` 的 `FontRoleControl`（约 522、552 行）给 `<select>` 加了 token class，`<option>` 没有对应样式。
- 同形 class 还出现在日志筛选、Central 筛选、更新模式、技能详情仓库/标签、WSL 发行版。`UpdateModePreferenceSelect.tsx` 把 select 嵌在胶囊里，并有 `disabled` 选项。`RemoteTargetsSettingsControls.tsx` 使用空字符串占位选项和禁用项。
- `menu.tsx` 的 `POPUP_CLASS` 是要对齐的弹出层：`glass-overlay rounded-card`、`max-h-(--available-height)`、`z-50`、100ms fade/zoom。项样式是 `ITEM_CLASS`。
- Input 高度契约是 32px（`h-8`）。外观页字体 select 目前是 `h-10`，更新模式内嵌 select 是 `h-6 rounded-full`。共享触发器必须允许 `className` 覆盖高度和圆角，默认对齐 Input。
- 测试已依赖原生 select 行为。`CentralSkillsView.updates-and-search.test.tsx` 对 `central-update-check-mode-select` 使用 `toHaveValue` 和 `fireEvent.change`。`SkillDetailView.test.tsx` 断言 repository/tag select 的 class。
- IPC 新命令必须登记 `ipc_registry.rs`，补 `specta::Type`，跑 `pnpm ipc:codegen`。浏览器演示态未注册命令会 reject。组件不得直接 `invoke`。字体链仍只由 `displayFont.ts` 解析。
- `windows-sys` 0.61 已在 Windows target 依赖中，尚无 `Win32_Graphics_Gdi`。仓库没有 `@tanstack/react-virtual`。Base UI Combobox 文档写明：约 1000 项以内可以 memo 条目；更大才需要 virtualized。本机字体族通常低于这个量级。
- `queryLocalFonts()` 会走浏览器权限条，和桌面壳的设置页不一致。不采用。

## Requirements

### R1. 共享玻璃 Select

新增 `src/components/ui/select.tsx`，封装 `@base-ui/react/select`。页面不得直接 import `@base-ui/react/select`。

- 触发器默认对齐 Input：`h-8`、`rounded-control`、`border-input`、`bg-input-surface`、hover 描边加深、焦点为 `border-ring` 加 2px ring outline。右侧是 Lucide chevron，不用系统箭头。
- 弹出层与 `menu.tsx` 共用同一套 overlay class：`.glass-overlay`、`rounded-card`、Portal、`min-w-(--anchor-width)`、`max-h` 取可用高度、可滚动、`z-50`、与 Menu 相同的 100ms 进出场。项为 `rounded-control`，高亮 `bg-accent`，选中标记用 `text-primary-text` 的 check。
- 支持受控 value、disabled 根、disabled 项、空字符串占位项、`className` 覆盖触发器（胶囊内嵌和外观页 `h-10` 都靠它）。
- 短列表不放搜索框。键盘 typeahead 沿用 Base UI。
- 明暗两套主题都只换 token，不写死灰底或白底。

### R2. 替换全部原生 select

把 `research/native-select-inventory.md` 列出的 15 处 `<select>` 换成共享 Select。选项文案、禁用条件、占位项、写入的值保持不变。生产 `src/**/*.tsx`（不含 `src/test`、`src/dev`）不再出现 `<select`。

`PlatformMultiSelect`、已有 Menu 开关（如 Target quick switcher）和 Central 顶部手写玻璃面板不改结构。

### R3. 本机字体识别

新增只读命令 `list_installed_font_families`，分类 `runtime_only(ReadOnly)`。

- Windows：用 GDI `EnumFontFamiliesExW` 收集字体族，去重，去掉空名和以 `@` 开头的竖排别名，按当前区域设置排序。返回 `Vec<String>`，只含 family 名，不含文件路径。
- 非 Windows：返回空列表，命令成功。不在本次实现 fontconfig 或 Core Text。
- 不记录完整字体列表到 info 日志。
- 前端经 `@/lib/ipc` 调用，放在 `src/lib/systemFonts.ts`（或 `displayFont.ts` 旁的同等 lib），不从组件里 `invoke`。结果在会话内缓存；字体选择器提供刷新，刷新使缓存失效并重查。
- 浏览器 fixture 返回一小份固定族名，供演示和测试搜索。未装 Tauri 时不报缺失命令。
- 命令登记后运行 `pnpm ipc:codegen`。按仓库规则，改了 Tauri command 还要运行 `pnpm docs:gen` 并带上生成文件。

### R4. 可搜索、可滚动的字体选择器

外观页四个选择器（Display primary、Display 中文 fallback、Body primary、Body 中文 fallback）改为同一个 `FontFamilyPicker`，基于 `@base-ui/react/combobox`，弹出层视觉与 R1 相同。页面不得直接 import combobox。

- 列表分为两组：置顶预设，然后本机已安装字体。预设仍是现在的 key，这样已保存的 `geist` / `inter` / `jetbrains` / `serif` / `system` / `sourceHanSerif` 继续生效。打包字体即使没装进系统也留在预设组。
- 与预设指向同一 family 的系统项只出现一次，留在预设组。
- 选中预设：写入对应 key，并清空该字段的 custom。选中系统字体：写入 `custom` 和该 family 名，走现有 `saveDisplayFont` / `saveBodyFont` / `saveDisplayChineseFallback` / `saveBodyChineseFallback`。不新增 setting key。
- 触发器显示预设的 i18n 名称，或已存的 family 名。存了 family 时不显示裸的 “Custom”。
- 扫描结果里没有、但 setting 里仍有的 family 继续显示并继续应用，不清除用户的值。
- 弹出层可滚动，高度不超过可用空间。输入框按 family 名和预设标签做不区分大小写的子串过滤。
- 过滤无结果时，提供「使用这个 family 名」动作，把查询写入 custom。写入前仍走 `displayFont.ts` 的单 family 安全序列化，不接受逗号 stack。
- 去掉四个选择器下面那块仅在 `custom` 时出现的独立 Input。自定义入口收进弹出层。
- 每个选项用该 family 渲染自己的名字。预设试样仍由 `displayFont.ts` 的同一条字体链生成，组件不自己拼 stack。
- 中文 fallback 与正文字体使用同一份本机列表，不做 CJK cmap 过滤。搜索用来找「微软雅黑」「Source Han」「Noto」。
- 列表打开和输入保持可用。先 memo 条目，不引入 `@tanstack/react-virtual`。只有实测打开或输入明显卡顿时才虚拟化，并在实现笔记里写明依据。

### R5. 文案与契约

- 新增搜索占位、空结果、预设组、本机字体组、使用所输入 family、刷新、字体列表不可用，全部走 `src/i18n/locales/en.json` 与 `zh.json`。
- 更新 `.trellis/spec/frontend/glass-surfaces.md`：登记 Select / FontFamilyPicker，并把「禁止页面直接 import base-ui」扩到 `select` 和 `combobox`。
- 更新 `.trellis/spec/frontend/font-preferences.md`：写明四个选择器的预设、本机字体、custom 映射，以及独立 custom Input 已移除。持久化 key、迁移、mode 隔离、禁止打包 fallback 字体这些条款保持不变。

## Acceptance Criteria

- [ ] Glass Dark 与 Glass Light 下，打开外观页任一字体选择器：弹出层是 `.glass-overlay rounded-card`，文字用主题前景色，选中项有薄荷 check，列表可滚动。不再出现系统灰底菜单，试样不再被系统窗口挡住。
- [ ] 字体选择器能按名称搜索。选中一台机器上真实存在、且不属于预设的字体后，触发器显示该 family 名，对应 custom setting 写入该名字，当前主题的试样改用这条链。切到另一明暗主题不会改掉那一套 profile。
- [ ] 已保存的预设（含默认 Geist）加载后触发器仍显示预设名，DOM 字体链与改动前一致。
- [ ] 过滤无匹配时，可以把输入当作单个 family 保存；带引号、反斜杠或控制字符的输入仍被序列化成一个 family，不能注入额外 CSS stack。
- [ ] 日志筛选、Central 快捷筛选、更新模式、更新中心工具条、技能详情仓库/标签、WSL 发行版这几处打开后使用同一弹出层。禁用项不可选。空占位项仍可表示「全部」或「请选择」。更新模式里 sync 被禁用时行为与现在相同。
- [ ] 生产 TSX 中没有残留 `<select`。`glassSurfaceContract` 不允许页面直接 import `@base-ui/react/select` 或 `combobox`。
- [ ] Windows 命令返回去重后的 family 名，且不含 `@` 竖排名。非 Windows 构建中该命令返回空列表且成功。浏览器演示态有 fixture，不抛 `IpcFixtureMissingError`。
- [ ] `pnpm ipc:codegen` 与 `pnpm docs:gen` 的生成文件已纳入改动。定向 Vitest（字体、设置页、玻璃 primitive、上述调用点）通过。完成前跑 `just ci`。

## Out of Scope

- 重写 `DESIGN.md`，或把玻璃主题换成目录里的另一套风格。
- 改 Menu、Dialog、Command、Toast、`PlatformMultiSelect`、已有 Menu 型开关的视觉。
- 为 Source Han 或任何 fallback 添加字体文件、下载或安装。
- 用 cmap 判断字体是否覆盖中日韩，并因此隐藏拉丁字体。
- macOS Core Text / Linux fontconfig 枚举。
- 字体缩放三档、主题切换、窗口 Mica 材质。
- 给短筛选下拉加搜索框。

## Technical Notes

- 设计与调用点清单：`design.md`、`research/native-select-inventory.md`。
- 执行顺序与验证命令：`implement.md`。
- 本任务含新的只读 Tauri 命令，scope 为 `frontend+tauri`。不触碰凭证、Central 写锁或更新签名链。
