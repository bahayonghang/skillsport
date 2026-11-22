# C1 执行计划

1. 读 design-md 技能的 `references/design-md-format.md` §2–§4 与 `references/design-system-core.md`。
2. `apply style:glassmorphism --root <repo> --force`；记录备份文件名。
3. 按 `design.md` 重写 frontmatter 与 11 个章节；保留 provenance 注释，追加 customized 注释。
4. 对比度复算：在 scratchpad 写临时脚本（父任务 design.md §6 的合成方法），把结果表写入 Known Gaps；任一对 < 4.5 则先调色再写。
5. 改写 `PRODUCT.md` 的 Brand Personality、Anti-references、Design Principles 第 2 条（“个性靠主题” → “个性靠材质与克制的语义色”）。
6. 自检：`rg -n "Catppuccin|Mocha|Latte|accent" DESIGN.md PRODUCT.md` 只命中“已废止”段；`{token}` 引用全部可解析。
7. `just ci`。
8. **门禁**：把 DESIGN.md 的 Overview、Colors、Elevation 三节摘要发给用户审阅；通过后合入 dev，C2 才能启动。

回退：revert 本 PR 或用备份文件恢复。
