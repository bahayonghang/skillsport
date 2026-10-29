# 执行计划（父任务：集成与门禁）

父任务不直接改产品代码。它的执行内容是按顺序启动子任务、在每个阶段结束时做集成审查。

## 阶段与顺序

1. **C1 设计源**：`DESIGN.md` / `PRODUCT.md` 定稿。门禁：用户审阅通过后才启动 C2。
2. **C2 主题底座**：门禁 = 两主题对比度契约绿、主题迁移测试绿、`just ci` 绿、亮/暗首屏截图。
3. **C3 窗口材质** ∥ **C4 基础组件**（可并行，文件不重叠）。
   - C3 门禁：Win11 真机 Mica 截图 + Win10 / 不支持路径不透明截图 + 安装包启动无白闪。
   - C4 门禁：primitives 在亮/暗下全状态截图（default / hover / focus-visible / active / disabled / error），表面与 blur 白名单契约测试绿。
4. **C5 外壳** ∥ **C6 签名表面**（可并行）。门禁：Central 网格滚动与 Dashboard 首屏在 Windows WebView2 下的帧率观察记录。
5. **C7 库页面** ∥ **C8 工具与设置页面**（可并行；禁止改 C5 / C6 拥有的文件）。门禁：路由逐页截图。
6. **C9 版本与验收**：全量视觉矩阵（AC8）、安装包验收（AC9）、文档对齐。

## 每个子任务通用流程

- 启动前：补齐该子任务的 `design.md` / `implement.md`（复杂子任务必需），读 `.trellis/spec/frontend/index.md` 及相关规范。
- 迭代中：定向 Vitest + `pnpm typecheck` + `pnpm lint`。
- 结束前：`just ci`；截图存入子任务 `research/`；更新受影响的 spec；PR 指向 `dev`，squash merge。

## 集成审查清单（父任务在 C9 前执行）

- [x] `rg "ctp-|catppuccin|data-accent" src` 仅剩迁移代码与其测试。
- [x] `rg "backdrop-" src --glob '*.tsx' --glob '!src/test/**'` 为 0；`index.css` 中 `backdrop-filter` 只在 `.glass-overlay` / `.glass-sticky`。
- [x] C4 契约测试的两份待迁移清单为空。
- [x] `rg "rounded-\[" src --glob '!src/test/**'` 为 0；圆角只来自登记阶梯。
- [x] `rg "uppercase" src --glob '!src/test/**'` 剩余处均为有意保留的短标签。
- [x] DESIGN.md 中每个组件条目都能在 `src/components/ui/` 找到对应实现。
- [x] README / README_CN 截图与主题描述已更新。

> 2026-10-21 C9 执行，全部通过；结果与命令输出见 `../10-21-v1-1-0-release-prep/research/integration-checklist.md`（待迁移清单机制已在 C9 删除，契约改为零违规断言）。

## 回退点

- C2 合入前：零风险。
- C2 合入后、C3–C8 合入前：revert C2 即恢复 1.0.2 视觉。
- 任一 C4–C8 有问题：revert 对应 PR，其他子任务不受影响（因为都只依赖 C2 / C4 的 token 与 primitives）。
