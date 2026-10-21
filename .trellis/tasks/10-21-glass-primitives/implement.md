# C4 执行计划

前置：C2 已合入；读 `typography-tokens.md`、`icon-control-hit-area.md`、`module-boundaries.md`、DESIGN.md Components 节。

1. **契约测试先行**：`glassSurfaceContract.test.ts`（D-P1、D-P6、D-P7），初始化两份 pending 清单（运行扫描得出实际文件，写死到测试中）。
2. **token utility**：确认 C2 已在 `@theme inline` 暴露 `rounded-control/card/shell` 与 `.glass-sticky`；缺则在此补齐（只加 utility，不改 token 值）。
3. **Button**（D-P3）+ 现有 Button 测试；检查 `inline-confirm-action.tsx`。
4. **Card**（D-P4）。
5. **Badge**（D-P2）+ `statusTone.ts` 映射；单测覆盖 7 个 tone 的类与 aria。
6. **StatTile**（D-P2）+ 单测（aria-label、数字格式化、compact）；**PageHeader** + 单测（h1 语义、窄屏换行）。
7. **表单控件**（D-P5）。
8. **浮层**：dialog / command 改用 `.glass-overlay`；新增 menu / sheet / toaster；`main.tsx` 接 `ui/toaster`。
9. **虚拟化**（D-P8）：更新 `centralVirtualItemHeight()` 与测试；真实浏览器三档 Scale 首末项可达。
10. **视觉验证**：`/__primitives` 亮 / 暗全状态截图存 `research/`；键盘 Tab 遍历焦点环可见。
11. **规范**：新增 `.trellis/spec/frontend/glass-surfaces.md`（分层、blur 只经 CSS 类、手写表面规则、pending 清单只减不增），并在 frontend `index.md` 登记。
12. **收尾**：`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm sizecheck`、`just ci`。

回退：revert 本 PR；页面仍用旧类名，只是失去新 primitives（C2 token 照常生效）。
