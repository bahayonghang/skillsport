# 验证记录（2026-10-20）

## 通过

- `just ci`：All checks passed。覆盖 version、docs:gen:check、typecheck、eslint、capability、sizecheck、clippy `-D warnings`、`cargo test`（1604 + 15 个通过）、vitest、trellis-python。
- 新增的后端测试：
  - 422 → `branch_not_found`，Display 文本保持逐字一致；
  - 400/409 → `request_rejected`；
  - 503 和 `Http` → `transport_failed`；
  - tree 回退结论不变；
  - `FailureOnly` 成功时 0 行、失败时 1 行；
  - preview 审计行中不出现 URL、token、owner/repo 和分支名。
- 新增的前端测试：
  - 初始状态提交 `""`；
  - `branch_not_found` 面板的动作以 `""` 重新预览；
  - transport 与 rejected 两种错误的标题和动作不同；
  - 当前步骤带 `aria-current="step"`。
- 浏览器预览（Vite dev，browser mode）的 DOM 测量：
  - 1280px 暗色：弹窗宽 960px；69 字符的 URL 完整显示（输入框 877px，无溢出）；分支分段控件与 Preview 按钮均为 36px 高、上下边对齐。截图见 `screenshots/input-step-1280-dark.jpg`。
  - 900px 亮色：弹窗宽 828px，没有页面级横向溢出；URL 输入框 747px，无溢出；徽章与标题顶部和高度一致（137px / 24px）；徽章距关闭按钮 28px。

## 未验证（UNVERIFIED）

- 原生 Tauri/WebView2 窗口下的截图。应用窗口被隐藏后浏览器 pane 截图超时，因此 900px 亮色只有 DOM 测量，没有截图；`branch_not_found` 错误面板只有单测，没有视觉截图。
- 真实网络下的手动验收：在 master 仓库上执行默认预览和显式 `main` 预览、断网后预览，并在 Operation Log 页面查看对应记录。
- SSH/WSL 目标 preview 的阶段打标只经过编译和类型检查，没有远程环境实测。
