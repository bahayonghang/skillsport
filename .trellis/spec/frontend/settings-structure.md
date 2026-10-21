# Settings 页面结构约定

> 建立于 2026-07-12（任务 07-12-theme-default-fonts）。目标是维持紧凑、可扫描的产品设置界面，同时保持各业务 section 的行为边界。

## 页面层级

- `SettingsView` 用 `PageHeader` 渲染当前页面唯一的 `h1`（`font-display`）与 description，直接落在 canvas 上，不再添加通用 Settings banner。
- `SettingsSideNav` 是一块 `glass-panel rounded-card` 导航面板：桌面纵向 sticky、窄窗口横向滚动；item 为胶囊按钮，active 用 `tint-primary border-primary-stroke text-primary-text` 并带 `aria-current="page"`。
- 页面内容使用受约束的单一内容列。自 1.1.0 玻璃改版（C8）起，每个 section 是一块 L2 `glass-panel rounded-card`；不得在 section 外再套卡片或给单个导航项加卡片。
- `activePageId` 变化时必须把 Settings 自有的可滚动 `<main>` 归零，不能把 Appearance 底部等旧 scrollTop 带到下一页。只有显式 legacy hash（如 `#remote-targets-section`）或 `section=remote-targets` query 才在归零后调用 `scrollIntoView`；普通 `/settings/connections` 不自动跳过页面标题。

## Shared Section 契约

`src/components/settings/SettingsSection.tsx` 是可折叠设置区的共享容器：

```ts
interface SettingsSectionProps {
  sectionId: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}
```

- 折叠状态继续写入 `settings.sectionCollapsed.v1`，并保留 `aria-controls`、`aria-expanded` 与 hidden content。
- `SettingsSection` 的 `<section>` 自带 `glass-panel rounded-card px-5 py-4`。section 内部的子块用 `rounded-inner bg-accent`（无描边），行用 `rounded-control bg-input-surface`，分割线用 `border-border`；信息框用 tint（`bg-warning-tint` / `bg-destructive-tint` / `bg-primary-tint`）。禁止 per-section gradient、glow、`blur-*` orb、decorative bar、`border-l-2` 色条，以及 section 内再套 `glass-panel`。
- 状态 chip（存储方式、凭据、目标类型等）用 `Badge` + `BadgeTone`，tone 由 `src/lib/statusTone.ts` 或 section 内的 `*Tone()` helper 给出，不手写颜色 class。
- 路径、URL、命令、仓库地址用 `font-mono`（行内用 `text-ui-meta`）；说明文字不用 mono。
- 非 Appearance 页面替换共享容器时，不得顺带改变 children、事件流、字段顺序或 store 调用。

## Appearance 结构

- 固定按 Theme、Language、Typography、Font size（i18n `densityGroup` = 字号）分组；每组是一块 `glass-panel rounded-card`（Appearance 不经 `SettingsSection`，自带 `SettingGroup`）。
- Theme 组：两张主题预览卡（`ThemePreviewCard`，`button[aria-pressed][data-theme-preview]`，可访问名称只取主题名）+ 下方 `WindowMaterialSetting`。预览卡内部用 `data-theme={flavor}` 子树和 token 渐变绘制，不用 `.glass-canvas`（Mica 透明时会被挖空）；切换只调 `setFlavor`。旧的 flavor 文字卡已删除。
- 窗口材质只从 store 读取，不在 Appearance 中复制状态。
- 分组说明栏使用约 10-12rem 固定轨道，内容列占剩余空间；禁止嵌套比例 label/value 网格制造宽屏中间空洞。
- Typography 顶部提供 Light/Dark segmented editor，默认当前主题 mode；按钮以可见“当前”文字标明 active mode，切换 editor 不得切换 Theme flavor。
- Display 与 Body 各自提供 Primary、Chinese Fallback、按需 Custom 输入和混排 specimen；宽内容区并排、窄内容区堆叠，不增加 role 卡片。内部 auto-fit 网格必须写 `minmax(min(14rem,100%),1fr)`，否则在 1280 宽、两列并排时 select 会溢出 section。
- Segmented 控件统一为胶囊轨道 `rounded-pill bg-accent p-0.5`，选中项 `border-primary-stroke bg-primary-tint text-primary-text`，并带 `aria-pressed`。
- active mode 编辑实时应用；inactive mode 只更新其 setting 与 specimen。specimen 必须复用字体边界的安全解析结果。
- 选择控件和按钮最小 hit area 40px，必须有可访问名称与可见 focus；窄窗口允许 label/value 换行，但不得产生水平不可达内容。
- Flavor、accent、language、font、scale 的业务语义继续由原 store/API 负责，视觉组件不新增第二套状态模型。

## Tests Required

- `SettingsView.test.tsx` 锁定单一 `h1`、扁平导航、section 折叠持久化、Appearance 控件、切页 scrollTop 归零、legacy anchor 仍滚动和非 Appearance 业务行为。
- 视觉变更检查 900x600、1200x800（或 1280x800）、1440x900、440x900，浅色与深色；自动化工具不可用时必须明确记录未验证项，不得声明通过。
- 浏览器 fixture 下 `set_setting` 是 no-op：字体与字号的实时应用可在浏览器验证，跨 reload 持久化只能在 Tauri 运行时验证；主题 flavor 走 `localStorage`，可在浏览器验证 reload 持久化。

## Wrong vs Correct

```tsx
// Wrong: section 外再套卡片和装饰层；section 内再套 glass-panel
<Card><GradientHeader /><SettingsSection>...</SettingsSection></Card>
<SettingsSection ...><div className="glass-panel rounded-card">...</div></SettingsSection>

// Correct: 共享 section 自身就是 glass-panel；内部子块用 rounded-inner bg-accent
<SettingsSection sectionId="github-pat" title={title}>
  <div className="rounded-inner bg-accent p-3">...</div>
</SettingsSection>
```
