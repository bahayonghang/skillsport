# C2 执行计划

前置：C1 `DESIGN.md` 已合入 dev；读 `.trellis/spec/frontend/index.md`、`theme-switch.md`、`typography-tokens.md`、`font-preferences.md`。

## 步骤

1. **测试先行**：改写 `src/test/stores/themeStore.test.ts`（两主题、toggle、6 种旧值迁移、旧 key 删除、localStorage 抛错）与 `themeContrast.test.ts`（D-T3 合成器 + 两主题矩阵）。此时预期失败。
2. **token 层**：`src/index.css` 删除旧 flavor / accent 块，新增两 glass 块与 §2 新 token；改 `@custom-variant dark`；新增 L1–L3 与 tint 工具类；lucide 线宽规则；`.surface-glass` / `.bg-orbit` 别名（D-T4）。
   - 验证：`pnpm vitest run src/test/contracts`。
3. **store**：重写 `src/stores/themeStore.ts`（D-T1、D-T2），保留 `applyThemeDom`。
   - 验证：themeStore 测试 + themeSwitchSuppression 测试。
4. **消费者**：按 `pnpm typecheck` 报错逐个修 `TopBar.tsx`、`AppearanceSettingsSection.tsx`、`settingsViewModel.ts`、`settingsViewBindings.ts`、`settingsPageSections.tsx`、`main.tsx`、`lib/statusTone.ts`；i18n en / zh 同步删除 accent / flavor 名称 key，新增亮 / 暗文案。
   - 验证：`pnpm typecheck`、`TopBar.test.tsx`、`SettingsView.test.tsx`、`i18nLocales.test.ts`。
5. **字体**：`displayFont.ts` 默认值 + D-F1 方案 A 迁移（标记 key `font_defaults_v1_1_applied`，走按 key 串行写入队列）；更新 `displayFont.test.ts`：旧默认 jetbrains → geist、有 Custom 不改、已有标记不重复执行、迁移期间用户保存获胜。
6. **闪屏 / 窗口底色**：`index.html`、`src-tauri/tauri.conf.json` `backgroundColor`；新增闪屏字面值与 token 同源的契约断言。
7. **规范**：更新三份 spec。
8. **视觉证据**：`pnpm dev` 打开 Dashboard / Central / Settings，亮 / 暗截图存 `research/`；切换主题观察无闪灰。
9. **收尾**：`pnpm lint`、`pnpm build`、`just ci`。

## 回退点

- 步骤 2–4 必须在同一个 PR 内合入（中间态无法编译）。
- 合入后回退 = revert 整个 PR；后续子任务尚未合入时无连带影响。
