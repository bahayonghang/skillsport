# 启动 JS 拆分

## 边界

只改前端打包和启动顺序。不改文案、不改页面路由的 `React.lazy`、不调高 `chunkSizeWarningLimit`、不替换 markdown 渲染器。

版本号和更新日志（`package.json`、`CHANGELOG*.md`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`）是另一项未提交改动，本任务不要动它们。

## 启动顺序

`src/main.tsx` 的静态依赖先求值，然后才执行函数体。顺序必须保持：

1. `src/i18n/index.ts` 用顶层 `await` 只加载当前语言的目录，初始化完成后再放行导入它的模块。
2. 函数体里，非 Tauri 运行时 `await import("./fixtures")` 并调用 `installBrowserIpcFixtures()`。
3. 然后才执行现有的 theme / font / runtime logger / `ReactDOM.createRoot`。

`isTauriRuntime()` 仍是运行时判断。fixtures 不能留在静态 import 里，否则生产入口 chunk 会继续包含 `src/fixtures`。动态 import 会生成独立 chunk；Tauri 启动不执行这个分支，因此不加载它。

## 语言包

`src/i18n/index.ts` 用两个显式动态 import，不要用带变量的 `import(\`./locales/${lng}.json\`)`。变量路径会把两份 JSON 打进同一个被启动等待的 chunk。

```ts
const catalogs = {
  zh: () => import("./locales/zh.json"),
  en: () => import("./locales/en.json"),
};
```

- 检测规则保持现在的 `localStorage` 键 `i18nextLng`、然后 `navigator`、最后 `zh`。
- `supportedLngs: ["zh", "en"]`，`load: "languageOnly"`，这样 `zh-CN` / `en-US` 落到现有两份目录。
- 初始化时只 `addResourceBundle` 当前语言。两份目录键是对齐的，缺 key 不会靠另一份语言补。
- `i18n.changeLanguage` 在初始化后包一层：先加载目标目录，再调用原来的方法。设置页和测试都是 `await i18n.changeLanguage(...)`，调用点不用改。
- 继续同步 `document.documentElement.lang`。

测试里的 `react-i18next` mock 仍然直接读 `zh.json`，不经过这份初始化。直接 `import i18n from "@/i18n"` 的测试会等到顶层 await，再切换语言。

## 分包

删掉 `build.rollupOptions.output.manualChunks`。Vite 8 里它是弃用别名；和 `codeSplitting` 同时存在时 `manualChunks` 会被忽略。

用 `build.rolldownOptions.output.codeSplitting.groups` 的一个 group。`name(moduleId)` 返回 `null` 表示不收进这个 group。不要给空 `test` 以外的 catch-all 名字。

| 返回名 | 模块 |
| --- | --- |
| `react-vendor` | `react`、`react-dom`、`scheduler`、`react-router`、`react-router-dom`、`@remix-run/router` |
| `i18n-vendor` | `i18next`、`react-i18next`、`i18next-browser-languagedetector` |
| `icon-vendor` | `lucide-react`、`@lobehub/*` |
| `tauri-vendor` | `@tauri-apps/*` |
| `shell-vendor` | `@base-ui/*`、`@floating-ui/*`、`tailwind-merge`、`sonner`、`cmdk`、`zustand`、`clsx`、`class-variance-authority`、`@radix-ui/*` |
| `null` | markdown 一系（`react-markdown`、`remark-gfm`、`micromark*`、`mdast*`、`hast*`、`unist*`、`unified`、`vfile`、`property-information`）以及其他 node_modules 和应用源码 |

`react` 的匹配不能误伤 `react-router` 或 `react-i18next`。沿用现在的「目录名整段相等」判断，并同时认 pnpm 的 `.pnpm/<pkg>@` 路径。Windows 路径先换成 `/`。

shell 依赖必须留在独立 chunk 里。对照实验里，完全删掉手动分包会让入口从 568 kB 涨到 605 kB。markdown 必须返回 `null`，让它跟着已经 lazy 的 `SkillMarkdownRenderer` 走。

## 验收构建

生产 `vite build`（不必跑完整 `tauri build`）之后：

- 没有任何 JS chunk 的 minify 字节数超过 500 × 1000。
- 入口 chunk 的模块列表不含 `src/fixtures`、`micromark`、`mdast`、`react-markdown`。
- 入口静态 import 不含 markdown chunk。
- `src/i18n/locales/zh.json` 和 `en.json` 不在同一个被入口静态加载的 chunk 里。
