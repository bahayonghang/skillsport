# 小型图标控件热区与焦点可见性契约

> 建立于 2026-08-05（任务 08-05-dashboard-central-ui-polish）。统一 `<40px` 图标按钮的有效点击区域扩展方式，并约束 hover 揭示型控件的键盘焦点可见性。

## 1. Scope / Trigger

在 `src/**/*.tsx` 中新增或修改可见尺寸小于 40×40px 的图标按钮（卡片动作、平台开关、标签编辑器控件、侧栏按钮等），或新增 `opacity-0` + hover 才显示的交互控件时适用。

## 2. Convention: 40px 热区伪元素扩展

**What**：可见尺寸 <40px 的图标按钮，用 `after:` 伪元素把有效点击区域扩到至少 40×40px，而不是强行放大可见图标。支持字号缩放的模式（`SidebarSection.tsx` 排序入口，外层还需预留热区槽）：

```tsx
className="relative size-8 after:absolute after:left-1/2 after:top-1/2 after:size-10 after:min-w-[40px] after:min-h-[40px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
```

**几何约束**（防止相邻热区重叠吞点击）：

- 伪元素以按钮中心对称展开（Scale=1 时 `size-10` = 每侧外扩 4px，相对 32px 按钮）。
- 同行相邻按钮的**中心距必须 ≥两者实际热区宽度之和的一半**。Scale=1 时 `size-8`（32px）+ `gap-2`（8px）= 40px 中心距，相邻 40px 伪元素恰好相切；其他字号需重新测量。`size-8 + gap-1`（中心距 36px）或 `size-9 + gap-0.5` 在该字号下都会重叠，禁止。
- 伪元素外扩不得覆盖相邻控件自身的可点击区域（如 tag chip 上的移除 X）。
- 根字号缩放会同时缩小 rem 热区：Scale=0.875 时 `size-10` 实际只有 35px。修改这类控件时，伪元素同时加 `after:min-w-[40px] after:min-h-[40px]`，外层操作槽也保留 `min-w-[40px] min-h-[40px]`，再核对与相邻折叠/导航按钮的真实边界；不能只检查 class 名称。参照 `SidebarSection.tsx` 的排序入口。

**Why**：dense desktop 下 32px 及以下按钮低于 40×40px 热区下限；但盲目扩区会让相邻伪元素重叠，点击落到错误的按钮上。预留实际热区尺寸并测量相邻边界，才能同时满足易点击与不重叠。

## 3. Convention: hover 揭示控件必须有 focus-visible 等价路径

**What**：任何用 `opacity-0 group-hover/...:opacity-100` 做悬停揭示的可聚焦控件（`<button>`、`<a>`），必须同时提供 `focus-visible:opacity-100`（或等价的聚焦可见样式）。

**Why**：`opacity-0` 的按钮仍可被 Tab 聚焦——键盘用户的焦点会落在一个完全不可见的控件上，该操作对键盘不可达。hover 与 focus-visible 必须成对出现。

## 4. Wrong vs Correct

```tsx
// Wrong: 32px 按钮 + gap-1 → 40px 伪元素在中心距 36px 下重叠 4px
<div className="flex gap-1">
  <button className="size-8 after:size-10 ...">…</button>
</div>

// Wrong: hover 才显示，键盘焦点不可见
<button className="opacity-0 transition-opacity group-hover/tag:opacity-100">…</button>

// Correct: 每个按钮独立预留至少 40px 的热区槽，适应字号缩放
<div className="flex gap-2">
  <div className="flex size-10 min-h-[40px] min-w-[40px] items-center justify-center">
    <button className="relative size-8 after:absolute after:left-1/2 after:top-1/2 after:size-10 after:min-w-[40px] after:min-h-[40px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']">…</button>
  </div>
</div>
<button className="opacity-0 transition-opacity group-hover/tag:opacity-100 focus-visible:opacity-100">…</button>
```

## 5. Tests Required

- 暂无自动化契约测试；code review / trellis-check 时按本文件清单核对：
  - diff 中新增 `<40px` 图标按钮 → 必有 `after:size-10`（或可见尺寸本身 ≥40px）；
  - 同行按钮组合 → 按支持字号核算实际热区，至少 40px 且相邻不重叠；
  - diff 中新增 `group-hover` 揭示 → 必有成对的 `focus-visible`。
- 既有参照实现：`src/components/skill/UnifiedSkillCard.tsx`（checkbox）、`UnifiedSkillCardParts.tsx`（CardActionButton）、`UnifiedSkillCardFooter.tsx`（PlatformToggleIcon）、`CardTagEditor.tsx`（标签控件）。
