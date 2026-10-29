# just install 的 Vite chunk 体积警告

测量日期：2026-10-29。生产构建为 Vite 8.2.2（Rolldown），`build.write: false` 的内存构建，产物哈希与当天 `dist/assets` 一致。

## 警告从哪条命令来

`just install` 在 Windows 上走 `justfile` 的 `_install_windows`，它先跑 `just build`。`scripts/build/build.mjs` 调用 `tauri build`。`src-tauri/tauri.conf.json` 的 `beforeBuildCommand` 是 `pnpm build`，而 `package.json` 的 `build` 是 `tsc && vite build`。

警告由 Vite 的 `builtin:vite-reporter` 打出。默认 `build.chunkSizeWarningLimit` 是 `500`（kB，压缩前的 minify 体积）。它不让构建失败。`pnpm sizecheck` 只检查源文件行数，不检查这个 chunk。

## 唯一超限的 chunk

入口静态加载的 JS（`dist/assets/index-CzqB9Xzp.js` 的静态 `import`）：

| chunk | minify 字节 | gzip 字节 | 入口是否静态加载 |
| --- | ---: | ---: | --- |
| `index-*.js` | 568,181 | 177,773 | 自身 |
| `ui-vendor-*.js` | 460,107 | 144,071 | 是 |
| `react-vendor-*.js` | 181,755 | 56,529 | 是 |
| `i18n-vendor-*.js` | 63,044 | 20,441 | 是 |
| `icon-vendor-*.js` | 60,253 | 15,858 | 是 |
| `button-*.js` | 19,840 | 5,892 | 是 |
| `path-*.js` | 3,225 | 1,229 | 是 |
| `backendError-*.js` | 707 | 411 | 是 |
| `rolldown-runtime-*.js` | 716 | 428 | 是 |
| 合计 | 1,357,828 | 422,632 | |

页面 chunk 已经用 `React.lazy` 拆开。`CentralSkillsView` 209,306 字节，`SettingsView` 101,917 字节，都不触发警告。

这是 Tauri 本地页面，没有网络往返。安装包看到的是压缩后的体积；WebView 启动时解析的是 minify 后的原文。入口 gzip 178 kB，真正偏大的是启动时要一起解析的约 1.36 MB。

## 入口 chunk 里是什么

`index-*.js` 有 128 个模块。Rolldown 的 `renderedLength` 是模块渲染长度，合计大于最终 minify 文件，不能直接相加当成文件内字节。

| 分组 | renderedLength |
| --- | ---: |
| 应用源码（components、stores、lib、pages、其余 src） | 438,281 |
| `src/i18n/locales/en.json` | 156,224 |
| `src/i18n/locales/zh.json` | 108,534 |
| `src/fixtures/**` | 45,455 |

两份语言包的源文件是 `en.json` 170,374 字节、`zh.json` 165,708 字节。`src/i18n/index.ts` 静态 import 这两份 JSON，`src/main.tsx` 在渲染前静态 import `@/i18n`。入口 chunk 里能匹配到几乎全部英文和中文文案。

`src/main.tsx` 还静态 import `@/fixtures`。调用包在 `if (!isTauriRuntime())` 里，这是运行时判断。`just install` 装上的 Tauri 应用不会调用它，但 fixture 文案（例如 `fixture-central-skill`）仍在入口 chunk 里。`renderedLength` 约 45 kB，单独拿掉它，入口仍会高于 500 kB。

## ui-vendor 为什么会跟着启动

`vite.config.ts` 的 `build.rollupOptions.output.manualChunks` 把其余 `node_modules` 全部返回 `"ui-vendor"`。Vite 8 里函数形式的 `manualChunks` 已弃用，Rolldown 会把它转成 `output.codeSplitting` 的一个 group。对象形式已经不支持。

壳层用到 `tailwind-merge`、`sonner`、`@base-ui/react` 或 `cmdk` 里的任意一个，整个 `ui-vendor` 就变成入口的静态依赖。markdown 栈因此和壳层绑在一起。`ui-vendor` 的 `renderedLength`：

| 家族 | renderedLength |
| --- | ---: |
| `@base-ui/react` + `@floating-ui/*` | 406,414 |
| markdown（micromark、mdast、hast、unified、react-markdown 一系） | 305,544 |
| `react-router` | 93,200 |
| `tailwind-merge` | 58,178 |
| 其他 | 55,219 |
| `sonner` | 53,465 |
| `@radix-ui/*` | 49,651 |
| `cmdk` | 16,447 |
| `zustand` | 1,868 |

`react-router@7.18.3` 的 exports 指向 `dist/development`，旁边虽有 `dist/production`，两边主 chunk 只差 1 字节。这不是体积来源。`manualChunks` 只匹配了 `react-router-dom` 和 `@remix-run/router`，没有匹配 `react-router`，所以路由库落在 `ui-vendor`，不在 `react-vendor`。

## 对照实验：去掉 manualChunks

同一配置去掉 `manualChunks` 后再构建：

| 结果 | minify 字节 | 入口是否静态加载 |
| --- | ---: | --- |
| 入口 `index-*.js` | 604,865 | 自身，警告仍在，而且更大 |
| `i18n-*.js`（含两份语言包） | 329,218 | 是 |
| `SkillMarkdownRenderer-*.js` | 154,613 | 否 |

去掉手动分包后，markdown 会跟着 `SkillMarkdownRenderer` 走，不再进启动图。React、图标和 Base UI 则并进入口，入口从 568 kB 涨到 605 kB。所以不能只删 `manualChunks`。

## 可选做法

1. 把两份语言包移出入口。启动时只加载当前语言，切换语言时再加载另一份。`AppearanceSettingsSection` 现在直接 `i18n.changeLanguage(value)`。这是能消掉这条警告的改动。安装包总体积基本不变，因为两份 JSON 仍会作为独立 chunk 打进安装包；启动解析量会下降。测试里有同步 `i18n.changeLanguage("en" | "zh")`，实现时要保证测试在断言前已经有对应文案。

2. 保留壳层需要的 vendor group，但不要再用 catch-all `ui-vendor`。markdown 包单独成组，或让它跟随 `SkillMarkdownRenderer`。对照实验里这个 chunk 是 154,613 字节，而且不是入口静态 import。这不单独消掉 500 kB 警告，它减少的是启动时多解析的那一块。

3. `installBrowserIpcFixtures()` 改成在非 Tauri 分支里 `await import("./fixtures")`，并且仍在任何 store `init` 之前完成。静态 import 是为了保证注册早于 store 初始化。这一项单独做完，入口仍然超限。

4. 把 `chunkSizeWarningLimit` 调到 600 以上。日志会安静，安装包和启动解析量不变。

## 建议

同时做 1 和 2。1 对应这条警告的实测来源。2 去掉 catch-all 把 markdown 带进启动包的代价。3 可以作为同一任务里的小项。4 不改变产物。

## 实现时要守住的约束

- 首屏渲染前，当前语言的文案必须已经可用。`src/main.tsx` 现在是同步 import。
- 语言切换仍然覆盖 `en` 和 `zh`。
- 浏览器演示态仍能装上 IPC fixtures，且注册早于 store 初始化。
- Tauri 安装结果不加载 fixtures chunk。
- 路由继续按页面 `lazy()`。不要为了压一个数字把页面再合成单包。
- `manualChunks` 若保留，迁到 `build.rolldownOptions.output.codeSplitting`。函数形式只作为迁移期兼容。
- `codeSplitting.groups[].maxSize` 是目标值，单个模块可以超过它。不能靠 `maxSize` 把一份语言包 JSON 切成两半。
