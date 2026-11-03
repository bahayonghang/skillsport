# 分析 just install 的 Vite chunk 体积警告

## Goal

说明 `just install` 期间这条 Vite chunk 警告的来源，并选定能缩小启动 JS 的改法。用户价值是安装日志不再被一条可避免的体积警告打断，同时桌面应用启动时少解析现在被打进首屏的代码。

## Background

警告出现在 Windows `just install` → `just build` → `tauri build` → `pnpm build`（`tsc && vite build`）。Vite 8.2.2 的默认阈值是 minify 后 500 kB。构建不会因此失败。

2026-10-29 的生产构建里，唯一超限的是入口 `index-*.js`：568,181 字节，gzip 177,773 字节。它静态加载的 JS 合计 1,357,828 字节（gzip 422,632）。页面已经用 `React.lazy` 拆开。测量和分组见 `research/chunk-size-warning.md`。

入口里同时有 `src/i18n/locales/en.json` 和 `zh.json`，因为 `src/i18n/index.ts` 静态 import 两份目录，`src/main.tsx` 再静态 import 它。`src/main.tsx` 还静态 import `@/fixtures`；`isTauriRuntime()` 是运行时判断，所以安装出的 Tauri 应用也会带上浏览器演示 fixture。

`vite.config.ts` 的 `manualChunks` 把其余 `node_modules` 收成一个 `ui-vendor`（460,107 字节），并且这个 chunk 是入口的静态依赖。markdown 栈因此在启动时被解析。去掉整个 `manualChunks` 会让入口涨到 604,865 字节，警告更重。

## Requirements

1. 任务记录必须能复述警告来源、超限 chunk、入口静态依赖，以及语言包和 `ui-vendor` 各自的贡献。
2. 后续实现要减少启动时解析的 JS，并让生产 `vite build` 不再报告 chunk 超过 500 kB。
3. 当前语言的文案在首屏渲染前可用。设置里的语言切换仍能在 `en` 和 `zh` 之间切换。
4. 浏览器演示态仍注册 IPC fixtures，且注册早于 store 初始化。Tauri 安装结果不加载 fixture chunk。
5. 现有页面级 `React.lazy` 拆分保持不变。

## Acceptance Criteria

- [x] `research/chunk-size-warning.md` 写明超限 chunk 的 minify 字节、gzip 字节和主要模块来源。
- [x] 选定的实现方案经过一次生产 `vite build`：没有任何 chunk 的 minify 体积超过 500 kB。入口 `index` 为 81,483 字节。
- [x] 同一份构建里，markdown 相关包不在入口静态 import 的 chunk 中。`SkillMarkdownRenderer` 是 154,690 字节的独立 chunk。
- [x] Tauri 生产入口不包含 `src/fixtures` 的模块。fixtures 只出现在入口的 dynamic import 里。
- [x] 切换语言后，界面使用对应语言的现有文案。`backendError.test.ts` 覆盖 `changeLanguage("en" | "zh")`。
- [ ] 非 Tauri 的浏览器演示态仍能完成 fixture 注册后再初始化 store。代码顺序已按这个约束写好，还没有在浏览器里跑演示态。

## Out of Scope

- 只调高 `build.chunkSizeWarningLimit` 来隐藏警告。
- 把已经按页面拆开的路由重新合成一个包。
- 删减文案、替换 markdown 渲染器，或改安装包格式。
- 把 `react-router` 从 `dist/development` 换到 `dist/production`。两边主 chunk 只差 1 字节。

## Decisions

- 2026-10-29：用户要求开始实施。采用研究文档里的建议范围，也就是本文件的验收标准：启动只加载当前语言，取消 catch-all `ui-vendor`，浏览器 fixtures 改为按需加载。不调高 `chunkSizeWarningLimit`。
