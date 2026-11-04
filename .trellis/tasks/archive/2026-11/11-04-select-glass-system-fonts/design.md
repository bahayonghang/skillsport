# 下拉层与本机字体选择器

视觉来源是仓库根目录 `DESIGN.md`（catalog `style:glassmorphism`，SkillPort light-glass 定制稿）。本任务不替换该文件。弹出层对齐「其余 primitives」：Menu 已是 L3 `.glass-overlay` + `rounded-card`，项是 `rounded-control`。原生 `<select>` 的打开层不走这套表面，所以要换成应用内弹出层。

## Architecture

两层控件，一套弹出层皮肤。

```text
ui/select.tsx            @base-ui/react/select
                         short, non-searchable choices
ui/font-family-picker.tsx
                         @base-ui/react/combobox
                         four appearance font fields
ui/overlay-popup.ts      shared popup + item class strings
                         consumed by menu.tsx, select.tsx, font-family-picker.tsx

lib/systemFonts.ts       session cache + invoke("list_installed_font_families")
lib/displayFont.ts       unchanged stack builder and setting keys
commands/fonts.rs        Windows GDI enumeration, empty list elsewhere
```

页面只 import `@/components/ui/select` 和字体选择器。`glass-surfaces.md` 的直接 base-ui 禁令扩到 `select` 和 `combobox`，与现有 menu/dialog 禁令同一条契约测试。

不新增 Popover primitive。Base UI Select / Combobox 自带 Portal + Positioner + Popup，class 复用 Menu，而不是再包一层 popover。

## Select contract

`Select` 是受控的单选。

```tsx
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  ariaLabel: string;
  disabled?: boolean;
  id?: string;
  testId?: string;
  className?: string;
}
```

- 触发器是 button，不是 `<select>`。默认 class 抄 `src/components/ui/input.tsx` 的高度、圆角、描边、井色和焦点 outline。`className` 可以覆盖成 `h-10` 或胶囊里的 `h-6 rounded-full`。
- Popup class 与 `menu.tsx` 的 `POPUP_CLASS` 同源，并加 `min-w-(--anchor-width) w-max max-w-[min(24rem,var(--available-width))]`。列表 `overflow-y-auto`，`max-h-[min(18rem,var(--available-height))]`。
- Item class 与 `ITEM_CLASS` 同源。选中项右侧 check，颜色 `text-primary-text`。禁用项沿用 `data-disabled:opacity-50` 且不可提交。
- 空字符串是合法 value，用来表示「全部」或「请选择」。不要把空值当成 placeholder 而从选项里丢掉。
- 进出场沿用 Menu 的 100ms fade/zoom。不再加按压位移动画。筛选下拉打开频繁，多一段动效会像延迟。
- 短列表不渲染搜索框。Base UI 自带 typeahead。

`data-testid` 留在触发器上，因为现有测试找 `central-update-check-mode-select`。交互从 `fireEvent.change` 改成打开后点选项。断言从 `toHaveValue` 改成触发器文本或 `data-value`。

## Font picker

四个字段共用 `FontFamilyPicker`。数据仍是现在的 key + custom 字符串。

| 用户选的是 | 写入 |
| --- | --- |
| 预设 key | 该 key，custom 清空 |
| 本机 family，或「使用所输入名字」 | `custom` + 该 family 字符串 |

触发器标签：

- 预设：现有 i18n 标签（Geist、System fallback、Source Han Serif SC VF）。
- `custom` 且字符串非空：该 family 名。
- `custom` 且字符串空白：保持现有「应用时按 system」的行为，标签用预设里的 custom 文案。

分组顺序：

1. Bundled / pinned presets for that field（Display、Body、Chinese fallback 的预设数组不变）。
2. Installed families，去掉与预设 family 重复的名字。Source Han 预设链是 `"Source Han Serif SC VF", "思源宋体 VF"`。同名系统项不重复出现。

已保存但不在扫描结果里的 custom family 插在预设组之后、本机列表之前，标签仍是那个名字。不删除 setting。

搜索：Combobox input 过滤预设标签和 family 名，大小写不敏感，子串匹配。无匹配且查询去空白后非空时，列出一条动作项，选中后走 custom 路径。序列化仍调用 `displayFont.ts` 里现有的单 family 转义，组件不拼接 `font-family`。

选项文字的 `fontFamily` 只用于该行预览：预设行走现有 chain 函数的返回值，系统行走把 family 交给同一个转义函数后的结果。试样块继续用现在的 specimen 链。

加载：选择器第一次打开时取缓存。缓存空则调用命令。四个选择器共享模块级缓存。刷新按钮清缓存再取。命令失败时弹出层仍显示预设和「使用所输入名字」，并显示一行不可选的失败说明。失败不阻塞设置页，也不改已保存的字体。

本机列表不做 CJK 过滤。中文 fallback 和正文字体看到的是同一份族名，搜索负责缩小范围。

条目用 `React.memo`。不加入 `@tanstack/react-virtual`，除非实现时打开或输入在常见字体数量下明显掉帧。若真要虚拟化，优先接 Base UI Combobox 的 `virtualized` 开关，并在 `implement.md` 的笔记里写实测现象。

## Font enumeration

命令：`list_installed_font_families() -> InstalledFontList`。

```rust
struct InstalledFontList {
    families: Vec<String>,
    available: bool, // JSON camelCase
}
```

公开命令在这个仓库走 `IpcResult` 时，新的 `IpcError` 码需要单独评审。字体列表不是失败路径上的用户操作，所以不新增错误码。`available: false` 只表示本机枚举失败（例如 `GetDC` 失败）。非 Windows 返回 `available: true` 且 `families` 为空。前端把 `null`、非对象和抛错都当成不可用；预设和手输名字仍然可用。这和最初草案里的 `Result<Vec<String>, String>` 不同，以这个结构为准。

注册：`src-tauri/src/ipc_registry.rs` 的 `__skillport_runtime_commands` 与 `__skillport_generated_commands` 都要有这一条，分类 `runtime_only(ReadOnly)`。模块 `commands::fonts`。补 `specta::Type` 后跑 `pnpm ipc:codegen`。随后 `pnpm docs:gen`。

Windows 实现放在 `cfg(windows)`，使用已经依赖的 `windows-sys`，增加 feature `Win32_Graphics_Gdi`（以及回调所需的 `Win32_Globalization`，以编译为准）。

算法：

1. `EnumFontFamiliesExW`，`lfCharSet = DEFAULT_CHARSET`，枚举当前屏幕 DC 的字体族。
2. 读取 `LOGFONTW.lfFaceName`。
3. 丢掉空名、以 `@` 开头的竖排别名。
4. 按大小写不敏感去重，保留第一次见到的展示名。
5. 用当前区域设置排序。

纯过滤函数单独可测，不依赖 DC。非 Windows 函数返回 `available: true` 的空列表。

不使用 `window.queryLocalFonts()`。WebView2 的权限条不是这个设置页的表面，而且浏览器演示态和桌面会分叉。

Fixture：在 `src/fixtures/settings.ts`（或相邻字体 fixture）注册 `list_installed_font_families`，返回少量固定名字，例如 `Segoe UI`、`Microsoft YaHei`、`Source Han Serif SC VF`。`installBrowserIpcFixtures()` 已会调用 settings 注册函数时，不要再新增一条忘记挂上的路径。

## Compatibility

- Setting key、v1→v2 迁移、`font_defaults_v1_1_applied`、light/dark 隔离、scale 全局，都不改。
- `sourceHanSerif` 仍只是两个已知 family 名，不打包字体。
- 自定义输入仍是一个 family，不是逗号分隔的 stack。
- 命令只返回名字。不读字体文件，不碰 SecretStore，不进操作日志正文。

## Trade-offs

- 短列表用 Select，长字体列表用 Combobox。若强行一个组件带可选搜索框，胶囊里的两项更新模式也会多出一个输入框。搜索只给字体选择器。
- 系统字体写入既有 custom 字段，而不是新的 key 空间。旧设置不用迁移。代价是「预设 custom」和「选中的系统字体」在存储上相同，靠非空 family 字符串区分。触发器必须显示 family 名，避免再露出无信息的 Custom。
- 非 Windows 返回空列表。macOS / Linux 打包不是当前交付面。预设和手输 family 在那些平台仍然可用。
- GDI 枚举可能把同一家族的不同 charset 回调多次，所以去重是正确性的一部分，不是优化。

## Rollback

前端回退是恢复 `<select>`。持久化形状没变，回退后已选的系统字体仍作为 custom family 生效，只是重新变成原生下拉和独立输入框。命令可以留下不调用，也可以一并删除。删除命令时要同步 codegen 和 fixture。
