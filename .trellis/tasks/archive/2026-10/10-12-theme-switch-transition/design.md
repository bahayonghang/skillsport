# 技术设计：主题提交时抑制颜色过渡

## 边界

- 只改渲染层：`src/stores/themeStore.ts`、`src/index.css`、对应 Vitest。
- `TopBar` 与设置页继续只调用 `setFlavor` / `setAccent`。
- 不改 `displayFont.ts`、i18n、Rust。

## 方案

在 `applyFlavor` / `applyAccent` 写 `dataset` 之前打上抑制标记，强制本次样式提交，再在后续帧清标记。`init()` 仍直接写 DOM，不打标记。

### 1. 标记与 CSS

`document.documentElement.dataset.themeSwitching = ""`，选择器 `html[data-theme-switching]`。

`src/index.css` 在基础层之外（不进 `@layer`，以便压过 `@layer utilities` / `@layer components`）增加：

```css
html[data-theme-switching],
html[data-theme-switching] *,
html[data-theme-switching] *::before,
html[data-theme-switching] *::after {
  transition: none !important;
}
```

- 使用 `transition` 简写，同时清掉 `transition-property: box-shadow` 这类非颜色过渡。
- 不设置 `animation: none`。`animate-spin` / `animate-pulse` 在切换当帧继续，避免动画被移除后重头播放。
- `!important` 用来压过内联过渡和更高优先级的工具类。伪元素必须单独写，`*` 匹配不到它们。

### 2. 提交时序

```ts
let themeSwitchEpoch = 0;

function applyThemeDom(mutate: () => void): void {
  if (typeof document === "undefined") {
    mutate();
    return;
  }
  const html = document.documentElement;
  const epoch = ++themeSwitchEpoch;
  html.dataset.themeSwitching = "";
  mutate();
  void html.offsetWidth;
  requestAnimationFrame(() => {
    if (epoch !== themeSwitchEpoch) return;
    delete html.dataset.themeSwitching;
  });
}
```

顺序的原因：

1. 点击处理函数里同时改标记和 `data-theme` 还不够。`requestAnimationFrame` 发生在样式计算之前；若在 rAF 里删标记，浏览器会在同一次样式计算里看到「新颜色 + 过渡开着」，插值照旧开始。
2. `offsetWidth` 在标记仍在时强制样式和布局。新颜色以 `transition: none` 提交，不会生成过渡。
3. 下一次 rAF 再删标记。此时计算色已经是目标色，恢复 `transition` 没有颜色差，不会补播一段动画。
4. 连续点击递增 `epoch`。过期回调直接返回，标记留到最新一次提交之后再删。

`applyFlavor` 与 `applyAccent` 都走 `applyThemeDom`。localStorage 写入放在 `mutate` 里，和现在一样同步发生。

`init()` 不调用 `applyThemeDom`。启动时没有上一帧颜色，不需要抑制，也不把首屏绑到 rAF。

### 3. 不采用的做法

- 整页 `document.startViewTransition` 交叉淡化：快照本身要绘制当前这帧卡片阴影，Central 网格上仍可能顿一下，而且中段会变成两张画面的混合，不是这次要的「直接落到目标主题」。
- 永久删掉 `.central-skill-card-surface` 的阴影过渡：hover 抬起会变成硬切，超出 R2。
- 只在 `TopBar` 包一层：设置页 accent 色板走 `setAccent`，同样会插值 `--primary` 和卡片阴影。

## 数据流

无新 store 字段、无 IPC。`themeSwitching` 只是提交期间的 DOM 标记，不进入 Zustand state，组件不订阅它。

字体订阅保持原样：`set({ flavor })` 之后 `main.tsx` 仍按 `fontThemeModeForFlavor` 调用 `activateFontTheme`。默认 profile 下 attribute 值不变。

## 测试

| 文件 | 变更 |
| --- | --- |
| `src/test/stores/themeStore.test.ts` | `setFlavor` / `setAccent` 调用返回时 `data-theme-switching` 仍在，主题属性已是新值；执行捕获到的 rAF 后标记消失。连续两次 `setFlavor` 只执行第一次回调时标记仍在，执行第二次回调后才消失。`init()` 不写该标记。 |
| `src/test/contracts/themeContrast.test.ts` 或同目录新契约 | 读 `src/index.css`，断言存在 `html[data-theme-switching]` 规则，覆盖 `*`、`::before`、`::after`，且含 `transition: none`。 |

jsdom 不计算真实过渡，所以 AC6 用运行中的界面手测，不写像素断言。

## 兼容与回滚

标记只在点击后的一帧内存在。异常路径若 rAF 没跑，标记会留下，后果是 hover 过渡暂时消失，颜色仍然正确。测试与手测要确认标记会被清掉。

回滚即还原 `themeStore.ts` 与 `index.css` 的这次改动。色板与持久化 key 不变。
