# 轻盈毛玻璃表面与 primitives 契约

> 建立于 2026-10-21（任务 10-21-glass-primitives，1.1.0 C4）。视觉依据是根目录 `DESIGN.md`（Elevation & Depth / Shapes / Components）；本规范只治理“代码里怎样表达表面”，token 数值以 `src/index.css` 为准。

## 1. Scope / Trigger

在 `src/**/*.ts(x)` 中新增或修改任何表面（卡片、面板、浮层、sticky 条、胶囊、数字块），使用圆角 / 阴影 / 模糊，或直接引用 `@base-ui/react/menu|dialog` 时适用。

## 2. 四层模型与类名

| 层 | 用途 | 表达方式 | 真实 blur |
| --- | --- | --- | --- |
| L1 canvas | 全窗渐变 + 光斑 | `.glass-canvas`：AppShell 根下独立的 `fixed inset-0 -z-10` 层（`data-slot="app-canvas"`，根容器 `isolate`），不随 `<main>` 滚动；Mica 透明化规则作用在这个元素上 | 否 |
| L2 panel | 卡片、面板、表格容器、侧栏 | `<Card>` 或 `glass-panel rounded-card`；可交互加 `glass-panel-hover` | **否** |
| L3 overlay | Dialog / Sheet / Menu / Command / Toast / BulkActionBar | `.glass-overlay`（Dialog / Sheet 再加 `.glass-overlay-dialog` 换 24px） | 是 |
| L3 sticky | 分组头、facet 头、transfer rail 等 sticky 条 | `.glass-sticky` | 是 |

- 真实模糊**只**存在于 `src/index.css` 的 `.glass-overlay` 与 `.glass-sticky` 两个规则块；新增使用点先在 DESIGN.md「真实模糊白名单」登记，再加类名。
- 生产 TS/TSX 不得出现任何 `backdrop-*` utility。
- tint（`.tint-primary` / `-secondary` / `-warning` / `-destructive`）是 background-image 浅底，叠在元素自身底色之上；`bg-primary-tint` 等 utility 用于没有自身底色的块（Badge、StatTile）。tint 必须坐在 panel / sidebar / overlay 上，直接放在 canvas 上不在对比度矩阵内。

## 3. Primitives（`src/components/ui/`）

| 组件 | 签名要点 |
| --- | --- |
| `Button` | variants `default`（薄荷填充）/ `glass`（白色胶囊）/ `secondary`（= glass，兼容）/ `outline` / `ghost` / `destructive`（玫瑰 tint）/ `link`（`text-primary-text`）；文字尺寸胶囊，`icon*` 尺寸 `rounded-control`；焦点 = 2px `ring` outline + 2px offset；按压 `active:translate-y-px` |
| `Card` | `variant="glass" | "tint-primary" | "tint-secondary" | "plain"`，`interactive` 打开 hover 一级阴影 + focus ring；`CardFooter` = divider 顶线 + `text-xs` 灰字 |
| `Badge` | `tone="neutral|primary|secondary|success|warning|destructive|info"`，`size="sm|md"`，`icon?`；children 文字必填（色不独立承载信息） |
| `StatTile` | `tone="primary|secondary|neutral"`，`label`，`value: number | string | null`，`hint?`，`size="default|compact"`，`loading?`；`role="group"` + `aria-label="<label>: <value>"`；`null` 显示「—」而不是 0 |
| `PageHeader` | `title`，`meta?`，`actions?`，`titleId?`；唯一 `<h1>`；容器宽 < 900px 时 meta / actions 换到标题下 |
| `Menu*` | base-ui Menu 薄封装：`Menu` / `MenuTrigger` / `MenuContent`（Portal + Positioner + `.glass-overlay rounded-card`）/ `MenuItem`（`variant="destructive"`）/ `MenuCheckboxItem` / `MenuRadioGroup` / `MenuRadioItem` / `MenuGroup` / `MenuGroupLabel` / `MenuSeparator` / `MenuShortcut` / `MenuSubmenu` / `MenuSubmenuTrigger` |
| `Sheet*` | base-ui Dialog 侧滑抽屉：`SheetContent side="right|left"`（浮动 8px、`rounded-shell`、`.glass-overlay-dialog`）+ Header / Title / Description / Body / Footer / Close |
| `Dialog*` / `Command*` | `.glass-overlay glass-overlay-dialog rounded-shell p-6`；遮罩 `bg-overlay`（canvas 30%，无 blur） |
| `Toaster` | 封装 sonner；每个 toast 带 `.glass-overlay`；palette / 状态 tint / 图标色在 `index.css` 的 Toaster 段映射；不开 `richColors` |
| 表单控件 | Input / InputGroup / Textarea：`rounded-control bg-input-surface border-input`，hover 描边加深，focus = `border-ring` + 统一 outline，error = `aria-invalid` 玫瑰描边；Checkbox 保留 4px `rounded` 与 `strokeWidth={3}`（glyph 尺度的有意例外）；Switch 胶囊轨道，关 = input 描边，开 = 薄荷 |

`cn()`（`src/lib/utils.ts`）已向 tailwind-merge 注册 `text-ui-meta|ui-micro|display-*`、`rounded-control|inner|card|shell|pill`、`shadow-glass|glass-hover|overlay`；新增同类 token 时同步注册，否则 `cn("text-ui-meta", "text-muted-foreground")` 会把字号当颜色丢掉。

## 4. 手写表面规则（契约测试守卫）

`src/test/contracts/glassSurfaceContract.test.ts` 扫描生产 `src/**/*.ts(x)`（排除 `src/test/**`）：

| 规则 | 禁止 | 改用 |
| --- | --- | --- |
| blur | 任何 `backdrop-*` utility | `.glass-overlay` / `.glass-sticky` |
| 圆角 | `rounded-[...]` arbitrary | `rounded-control` / `inner` / `card` / `shell` / `pill` |
| 原始色 | `bg-white/<n>`、`bg-black/<n>` | surface token（`bg-card` / `bg-popover` / `bg-accent` …） |
| 旧卡片配方 | 同一 class 字符串里 `rounded-(xl|2xl|3xl)` + `ring-1 ring-border` 或 `border border-border` | `<Card>` 或 `glass-panel rounded-card` |
| 直接 base-ui | `src/components/ui/` 外 import `@base-ui/react/menu` / `dialog` | `ui/menu`、`ui/sheet`、`ui/dialog` |

另断言 `index.css` 中 `backdrop-filter` 只在 `.glass-overlay` / `.glass-sticky` 两块，`.glass-canvas` 不用 `filter`。

### Pending 清单只减不增

C4 落地时已违规的文件写死在测试的 `PENDING_*` 清单里（`PENDING_BACKDROP_UTILITY` 6、`PENDING_ARBITRARY_ROUNDED` 2、`PENDING_RAW_WHITE_BLACK` 0、`PENDING_HANDWRITTEN_SURFACE` 20、`PENDING_DIRECT_BASE_UI` 12）。测试同时断言：

- 清单外的文件不得违规（新文件、新违规一律失败）；
- 清单里的文件必须仍存在且仍违规——迁移完成就**必须**把它从清单删掉；
- 清单长度不超过 `PENDING_CEILING`（落地时的大小）；只许调低，不许调高；
- `src/components/ui/**` 永远不进清单（primitives 自己必须合规）。

C5–C8 按各自文件归属迁移并删减清单；C9 把所有 ceiling 设为 0 并断言清单为空。

## 5. Wrong vs Correct

```tsx
// Wrong: 手写玻璃配方 + TSX 里真实模糊 + 阶梯外圆角
<div className="rounded-2xl bg-white/60 backdrop-blur-md ring-1 ring-border">…</div>
<div className="rounded-[10px] border border-border">…</div>

// Wrong: 页面直接用 base-ui 菜单
import { Menu } from "@base-ui/react/menu";

// Correct
<Card>…</Card>
<div className="glass-panel rounded-card p-4">…</div>
<div className="glass-sticky sticky top-0">…</div>
<StatTile tone="secondary" icon={<ArrowUpFromLine />} label={t("usage.output")} value={total} />
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
```

## 6. Tests Required

- `src/test/contracts/glassSurfaceContract.test.ts`（本契约）。
- `src/test/contracts/themeContrast.test.ts`（tint / panel / overlay 合成对比度，backdrop 只在两块）。
- `src/test/components/ui/GlassPrimitives.test.tsx`（Badge 7 tone、StatTile aria / 格式化 / compact / loading / 不可用、PageHeader h1 与换行、Card variants、Button 形状与焦点、Menu / Sheet、`cn` token 合并）。
- 视觉：DEV-only 路由 `/__primitives`（`src/dev/PrimitivesGallery.tsx`，`?overlay=menu|dialog|sheet|command|toast`）截图；生产 bundle 不含该 chunk。
