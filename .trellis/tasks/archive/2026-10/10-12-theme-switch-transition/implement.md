# 执行计划：主题提交时抑制颜色过渡

前置：读 `.trellis/spec/frontend/index.md`、`.trellis/spec/frontend/font-preferences.md`、本任务 `prd.md`、`design.md`、`research/theme-switch-jank.md`。只改渲染层与前端测试。

## 步骤

1. **CSS 抑制规则**  
   在 `src/index.css` 的非 layer 区域加上 `html[data-theme-switching]` 规则，覆盖自身、`*`、`::before`、`::after`，只写 `transition: none !important`。不写 `animation: none`。

2. **DOM 写入边界**  
   在 `src/stores/themeStore.ts` 增加 `applyThemeDom` 与 `themeSwitchEpoch`。`applyFlavor`、`applyAccent` 经它写入 `dataset` 和 localStorage。`init()` 保持直接调用现有写入函数。  
   时序固定为：打标记 → 写入 → `void html.offsetWidth` → `requestAnimationFrame` 里按 epoch 删标记。

3. **测试**  
   - `src/test/stores/themeStore.test.ts`：用 spy 接住 `requestAnimationFrame`，覆盖 AC1、AC2 和连续切换。`afterEach` 继续清 `data-theme` / `data-accent`，并删掉 `data-theme-switching`。  
   - 契约测试读 `src/index.css`，锁住 AC3 的选择器与 `transition: none`。  
   - 不改 `TopBar.test.tsx` 的交互断言，除非实现不得不改顶栏调用方式（按设计不应该）。

4. **手测**  
   启动应用后打开 Central Skills：
   - 点击右上角主题按钮，确认没有发灰中段、没有持续卡顿，图标与页面同时落到目标主题。
   - 再点一次切回。
   - 卡片 hover 阴影、顶栏按钮 hover 颜色仍有过渡。
   - 设置页切换另一个 flavor 和一个 accent，同样直接落色。
   - 若界面上有加载指示器，切换时不要被重置到动画起点。

## 验证命令（迭代期）

```bash
pnpm exec vitest run src/test/stores/themeStore.test.ts src/test/contracts/themeContrast.test.ts
pnpm typecheck
pnpm lint
```

若契约断言写在新文件，把该文件放进同一条 vitest 命令。

## 完成门

```bash
just ci
```

AC6 不在 CI 里。收尾时写明手测是否做过、用的是 `pnpm dev` 还是 `pnpm tauri dev`。

## 审查点 / 回滚

- `init()` 源码不得调用 `applyThemeDom`。
- 抑制 CSS 不得包含 `animation: none`。
- 顶栏和设置页不得新写 `dataset.theme =`。
- 回滚单元是这次主题抑制改动；不要顺手改色值或卡片 hover 阴影。

## 收尾

- Phase 3.3：在 `.trellis/spec/frontend/` 增加短契约，说明 `data-theme` / `data-accent` 的写入必须包在过渡抑制里，hover 过渡仍留在组件上，`init()` 除外。并在 `index.md` 挂上链接。
- Phase 3.4：单 commit，前缀 `perf(theme):`。提交前等用户明确要求。
