# C1 设计：新 DESIGN.md 的结构与内容决策

## 生成方式

1. `python "<design-md skill>/scripts/design_catalog.py" apply style:glassmorphism --root <repo> --force`：备份旧 `DESIGN.md`（时间戳文件名），写入带 provenance 注释的 catalog 条目。
2. 在其上**整体重写**内容，只保留 provenance 注释与 stitch 结构；catalog 条目的通用值（`#1856FF` 蓝、Plus Jakarta Sans、4/8px 圆角、enterprise 措辞）全部替换。
3. 在 provenance 下追加：`<!-- customized: SkillPort 1.1.0 light-glass; tokens from task 10-21-v1-1-glass-ui-redesign design.md §2; replaces Catppuccin control-room system (backup: <file>) -->`。

## frontmatter 草案（键名即角色）

```yaml
name: SkillPort
description: 轻盈毛玻璃——薄荷到薰衣草的柔和 canvas 上叠半透明白面板，一主一辅语义色，克制、清新、精致
colors:
  canvas-from: "#e6f5ef"        canvas-to: "#ebeafa"
  surface-panel: "rgba(255,255,255,0.62)"   surface-overlay: "rgba(255,255,255,0.82)"
  glass-stroke: "rgba(255,255,255,0.70)"    glass-hairline: "rgba(31,42,55,0.06)"
  ink: "#1f2a37"                ink-muted: "#5a6575"
  mint: "#13805a"               mint-text: "#11744f"     mint-tint: "rgba(47,181,133,0.12)"
  lavender: "#7c6ce0"           lavender-text: "#5b4bc4" lavender-tint: "rgba(124,108,224,0.12)"
  amber-text: "#8a5a0f"         rose-text: "#b4233f"
  # -dark 组：canvas-from-dark #0f1b1f / canvas-to-dark #18172b / surface-panel-dark rgba(28,37,48,0.60)
  #        glass-stroke-dark rgba(255,255,255,0.08) / ink-dark #e7edf3 / ink-muted-dark #a3afbd
  #        mint-dark #4fd1a1 / mint-text-dark #5fd6a8 / lavender-dark #a79bff / lavender-text-dark #b3a8ff
  #        amber-text-dark #f0c06a / rose-text-dark #ff8fa3
typography: display (Geist 600, 1.6rem) / title (Geist 600, 1rem) / body (Geist 400, 0.875rem, 1.6)
            label (Geist 500, 0.75rem) / stat (Geist 600, 1.75rem, tabular-nums) / mono (JetBrains Mono 400, 0.6875rem)
rounded: control 12px / card 18px / shell 20px / pill 9999px
spacing: xs 4 / sm 8 / md 12 / lg 16 / xl 20 / 2xl 24 / page 24
components: button-primary, button-glass, pill-status, card, stat-tile, input, nav-item-active, dialog
```

（YAML 实际写成合法多行结构；这里压缩展示。rgba 用逗号写法以兼容 stitch 解析器，代码层用 `rgb(r g b / a)`。）

## 正文要点

- **Overview**：北极星“轻盈毛玻璃 / Light Glass”；一句话说明工具仍是重度用户的工作台（密度但有层级），只是材质从“控制室”变成“通透的工作台面”；明暗切换规则：两主题同构，只换 token 值。
- **Colors**：Named Rules——*Two-Accent Rule*（只有薄荷与薰衣草两个强调色，各有固定语义）、*Tint-Not-Fill Rule*（强调色优先以极浅底色出现，实色只给主按钮与焦点）、*Color-Is-Never-Alone*（沿用）。
- **Typography**：*Sans-Body Rule*（正文无衬线；等宽只给代码 / 路径 / ID / keycap / 日志正文）；*Big-Number Rule*（重点数量用 `stat`，必须在 tint 块或面板内，不得用渐变文字）；固定 rem 阶梯沿用。
- **Layout**：页面 gutter 24px；卡片网格 gap 20px；侧栏浮动留白 12px；900×600 最小窗口。
- **Elevation & Depth**：四层模型 + *Blur-Has-A-Reason Rule*（真实模糊只给 `.glass-overlay` / `.glass-sticky`，即有内容在下面滚过的层）+ Mica 说明。
- **Shapes**：圆角阶梯与同心规则；胶囊用于按钮、标签、状态、激活导航；线性图标 1.75 线宽。
- **Components**：每个 frontmatter 组件一条，写全 default / hover / focus-visible / active / disabled / error。
- **Do's and Don'ts**：Don't 增加“霓虹高饱和、厚重阴影、发光、满屏真实模糊、给滚动卡片加 backdrop-filter、渐变文字、彩色侧边条”。
- **Iteration Guide**：列出 1.1.0 废止的旧规则及原因（Theme-Is-Identity、Mono-Body、Glass-Is-Earned、14px 封顶、Corner Exceptions 登记制、侧栏发光指示条），防止回退。
- **Known Gaps**：对比度表（父任务 design.md §6）、chart-1..5 的最终取值、Win10 无 Mica、截图仅作视觉参考。

## chart 色（定稿）

| token | light | dark | 说明 |
| --- | --- | --- | --- |
| chart-1 | `#13805a` | `#4fd1a1` | 薄荷，主序列 |
| chart-2 | `#7c6ce0` | `#a79bff` | 薰衣草，次序列 |
| chart-3 | `#3a8fb7` | `#7cc4e4` | 低饱和天蓝 |
| chart-4 | `#b7862a` | `#f0c06a` | 琥珀 |
| chart-5 | `#c2566f` | `#ff8fa3` | 玫瑰 |

图表须同时用形状 / 标签 / 图例区分，不依赖色相。
