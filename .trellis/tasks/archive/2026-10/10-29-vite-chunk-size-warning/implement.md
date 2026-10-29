# 执行顺序

1. 按 `design.md` 改 `src/i18n/index.ts`：两份目录改为显式动态 import，顶层 await 只加载当前语言，并包装 `changeLanguage`。
2. 按 `design.md` 改 `src/main.tsx`：去掉 fixtures 的静态 import，在 store `init` 之前按需 `await import("./fixtures")`。
3. 按 `design.md` 把 `vite.config.ts` 的 `manualChunks` 换成 `rolldownOptions.output.codeSplitting`。
4. 跑生产构建并核对 chunk：
   - `pnpm exec vite build`
   - 构建日志没有 “Some chunks are larger than 500 kB”。
   - 用 Rolldown 的 chunk `modules` 确认入口不含 `src/fixtures` 和 markdown 包，两份 locale JSON 不在入口静态依赖里。
5. 跑会碰真实 i18n 实例的测试：
   - `pnpm exec vitest run src/test/lib/backendError.test.ts src/test/pages/DashboardView.test.tsx src/test/components/marketplace/githubImportWizardUtils.test.ts src/test/components/logs/logDiagnostics.test.ts src/test/components/central/LocalArchiveImportWizard.test.tsx`
6. 如果 `changeLanguage` 或启动顺序让上述测试失败，先修初始化时序，不要把两份 JSON 重新静态 import 回入口。

不要修改 `package.json` 的版本号、`CHANGELOG.md`、`CHANGELOG.zh.md`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`。

回滚点：上述三个源文件。构建产物 `dist/` 可以重新生成，不要提交。
