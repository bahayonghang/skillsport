# 国际化与主题

SkillPort 提供两种语言和两套「轻盈毛玻璃」主题。语言与主题可以随时切换且不丢状态。

## 语言

| 语言 | 源文件 |
|------|--------|
| English | `src/i18n/locales/en.json` |
| 简体中文 | `src/i18n/locales/zh.json` |

首次启动时由 `i18next-browser-languagedetector` 检测当前语言，之后持久化。所有面向用户的文案都走 `react-i18next`；源码里出现裸英文字符串会被视为缺陷。

## 主题

SkillPort 1.1.0 采用「轻盈毛玻璃」设计语言：低饱和的薄荷到薰衣草 canvas 上叠半透明面板，只用两个固定语义强调色（薄荷 = 完成 / 输入 / 主操作，薰衣草 = 输出 / 次要数据）。主题只有两套：

| 主题 | `data-theme` | 类型 |
|------|--------------|------|
| 浅色玻璃 | `glass-light` | 浅色 |
| 深色玻璃 | `glass-dark` | 深色 |

在侧栏底部点「深色模式 / 浅色模式」切换，或在 **设置 → 外观** 中选择主题卡片。选择写入根 HTML 元素的 `data-theme`，并以 `skillport-theme` 保存在本地存储；首次启动且没有保存值时跟随系统明暗。

不再提供强调色选择器或自定义配色：两套主题都按 WCAG 2.1 AA 校验，包括半透明面板与浅底信息块上的文字。

### 从 1.0.x 升级

1.1.0 移除了 Catppuccin（Latte / Frappé / Macchiato / Mocha）、Claude 亮 / 暗主题和 14 种强调色。升级后首次启动会一次性迁移已保存的主题：

| 1.0.x 主题 | 1.1.0 主题 |
|------------|------------|
| Latte、Claude 亮色 | 浅色玻璃 |
| Frappé、Macchiato、Mocha、Claude 暗色 | 深色玻璃 |

已保存的强调色会被丢弃，旧的 `catppuccin-flavor` / `catppuccin-accent` 键会被删除。

## 窗口材质（Windows 11 Mica）

在 Windows 11 上，窗口可以让系统 Mica 材质透过玻璃 canvas。默认开启，可在 **设置 → 外观 → 窗口材质** 关闭。窗口总是先以不透明背景启动，Mica 应用成功后才变通透，因此不会出现透明穿透或白闪。

Windows 10 及其他平台不支持 Mica：开关处会说明原因，应用保持不透明的渐变背景。窗口失去焦点时 Mica 退化为纯色，这是系统行为。

## 字体

正文、标题与按钮默认使用无衬线字体 Geist；JetBrains Mono 只用于代码、路径、ID、按键等机器可读的值。**设置 → 外观 → 字体** 可按浅色 / 深色主题分别选择标题与正文字体、中文 fallback 和字号。

从 1.0.x 升级时，如果正文字体仍是旧默认值 JetBrains Mono 且没有自定义字体，会一次性改为 Geist；已自定义的正文字体保持不变。随时可以改回。

## 自定义

| 目标 | 在哪里改 |
|------|----------|
| 新增一条翻译键 | 同时改 `en.json` 与 `zh.json`；只改一边的 PR 会被拦下。 |
| 修改颜色、圆角或模糊 token | 先改仓库根目录 `DESIGN.md`，再改 `src/index.css`；`themeContrast.test.ts` 与 `glassSurfaceContract.test.ts` 守护对比度与表面规则。 |
| 覆盖默认主题 | 在应用启动前给根元素设置 `data-theme="glass-light"` 或 `"glass-dark"`（高级用法，一般不需要）。 |

## 文档站语言

本站点遵循相同约定。英文入口为 `/`，中文镜像在 `/zh/`。文档导航右上的语言切换沿用与桌面应用一致的 locale 路由。

---

Last reviewed: 2026-10-21
