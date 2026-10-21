# C1 设计源：DESIGN.md 与 PRODUCT.md 改写

父任务：`../10-21-v1-1-glass-ui-redesign/prd.md`（决策 D1–D4、源需求、跨子任务验收）。

## 目标

把项目根 `DESIGN.md` 从 Catppuccin「调度台」体系改写为「轻盈毛玻璃」体系，并同步 `PRODUCT.md` 的品牌个性与反参考，使其成为 C2–C9 的唯一视觉依据。本任务只改设计文档，不改产品代码。

## 需求

- R1 用 design-md 技能的 `apply style:glassmorphism --root <repo> --force` 起底（自动生成带时间戳的旧 DESIGN.md 备份），再按父任务 `design.md` §2 的 token 草案深度定制；保留 `apply` 写入的 provenance 注释，并追加 `<!-- customized: ... -->` 说明。catalog 条目里的蓝色 primary、Plus Jakarta Sans 等通用值**全部被替换**，不得残留。
- R2 frontmatter 使用 stitch 格式：`colors`（亮/暗两组，`-dark` 后缀）、`typography`（display / title / body / label / stat / mono）、`rounded`（control / card / shell / pill）、`spacing`、`components`（button-primary、button-glass、pill-status、card、stat-tile、input、nav-item-active、dialog）。
- R3 正文章节按 design-md 格式顺序：Overview（北极星改为“轻盈毛玻璃”，说明明暗切换规则）、Colors（一主一辅的语义规则：绿 = 完成 / 输入，紫 = 输出 / 次要；tint 用法）、Typography（无衬线正文，等宽仅用于代码 / 路径 / ID）、Layout、Elevation & Depth（父任务 design.md §1 四层模型 + blur 白名单 + Mica）、Shapes（圆角阶梯 + 同心规则 + 胶囊）、Components、Do's and Don'ts、Responsive Behavior（900×600 最小窗口）、Iteration Guide、Known Gaps。
- R4 保留并重述仍然有效的旧原则：WCAG AA、色不独立承载信息、`prefers-reduced-motion`、本地优先的诚实、密度但有层级、`UnifiedSkillCard` 唯一实现、固定 rem 阶梯、禁止渐变文字与彩色侧边条。
- R5 明确废止并在 Iteration Guide 记录原因：Theme-Is-Identity、Mono-Body、Glass-Is-Earned、14px 圆角封顶与 Corner Exceptions 登记制、侧栏发光指示条。
- R6 `PRODUCT.md`：Brand Personality 改为“轻盈、清新、克制、精致”，删除“6 主题 × 14 accent 配色即身份”；Anti-references 增加“高饱和霓虹、厚重阴影、过度炫光、满屏真实模糊”；Users / Purpose / Accessibility 保持不变。
- R7 对比度：每一组文字 / 背景对都要在 Known Gaps 或 Colors 中写明比值（按父任务 design.md §6 的合成方法）；调整任何颜色后重算。
- R8 参考截图只作视觉语言参考：DESIGN.md 中不出现其产品名、文案或图像。

## 验收标准

- [ ] 根目录 `DESIGN.md` 为玻璃体系，旧版备份文件存在且未被修改。
- [ ] frontmatter 中所有颜色均为带引号的 hex 或 rgba，亮/暗两组齐全；所有 `{token}` 引用可解析。
- [ ] 文档中不再出现 Catppuccin / Mocha / Latte / Claude 主题 / 14 accent 作为现行规则（只允许出现在“已废止”说明中）。
- [ ] 对比度表覆盖：foreground、muted、primary-text、secondary-accent-text、warning、destructive × 面板 / 绿 tint / 紫 tint / canvas，亮暗全部 ≥ 4.5:1。
- [ ] blur 白名单与父任务 design.md §5 一致。
- [ ] `PRODUCT.md` 已同步；用户审阅通过（这是启动 C2 的门禁）。
- [ ] 文档改动跑过 `just ci`（Markdown 相关检查）。

## 范围外

代码、token 实现、README（由 C9 对齐）、截图。
