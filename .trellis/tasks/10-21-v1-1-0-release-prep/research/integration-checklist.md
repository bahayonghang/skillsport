# C9 集成审查清单（父任务 R5）

> 2026-10-21，分支 `feat/v1.1-glass-ui`（HEAD `651252ce` + C9 工作区改动）。清单来源：父任务 `implement.md`「集成审查清单」。命令均在仓库根目录执行。

| # | 检查项 | 命令 / 方法 | 结果 |
| --- | --- | --- | --- |
| 1 | `ctp-|catppuccin|data-accent` 只剩迁移代码与其测试 | `rg -n "ctp-\|catppuccin\|data-accent" src` | **通过**。6 处：`src/stores/themeStore.ts:24,25,160`（旧 key 常量与迁移注释）、`src/test/stores/themeStore.test.ts:12,13`（迁移测试）、`src/test/contracts/themeContrast.test.ts:212`（断言 CSS 中**不存在** `data-accent` / `--ctp-`）。 |
| 2 | TSX 无 `backdrop-*`；`index.css` 中 `backdrop-filter` 只在 `.glass-overlay` / `.glass-sticky` | `rg -n "backdrop-" src --glob '*.tsx' --glob '!src/test/**'`；`rg -n "backdrop-filter" src/index.css` | **通过**。TSX 0 处；CSS 4 行均在 `.glass-overlay`（含 `-webkit-` 前缀）与 `.glass-sticky` 两个规则块内（`glassSurfaceContract` 同时断言）。 |
| 3 | C4 契约测试的待迁移清单为空 | 读 `src/test/contracts/glassSurfaceContract.test.ts` | **通过并收紧**。5 份 `PENDING_*` 清单与全部 `PENDING_CEILING` 均已为 0。C9 删除了清单与 ceiling 机制，每条规则改为直接断言「生产 TS/TSX 违规文件为空」（8 个测试全绿）；`.trellis/spec/frontend/glass-surfaces.md`「零违规（C9 起）」同步更新。 |
| 4 | 无 `rounded-[`，圆角只来自登记阶梯 | `rg -n "rounded-\[" src --glob '!src/test/**'` | **通过**，0 处（契约测试守卫）。 |
| 5 | `uppercase` 剩余处均为有意保留的短标签 | `rg -n "uppercase" src --glob '!src/test/**'` | **通过**，生产代码 0 处。 |
| 6 | DESIGN.md 每个组件条目在 `src/components/ui/` 有对应实现 | 对照 DESIGN.md「Components」 | **通过**。button-primary / button-glass → `button.tsx` + `button-variants.ts`；pill-status / Badge → `badge.tsx`；card → `card.tsx`；stat-tile → `stat-tile.tsx`；input → `input.tsx` / `input-group.tsx` / `textarea.tsx`；dialog → `dialog.tsx` + `sheet.tsx`；Menu → `menu.tsx`；Command → `command.tsx`；Toaster → `toaster.tsx`；Switch → `switch.tsx`；PageHeader → `page-header.tsx`。nav-item-active 按 DESIGN.md 约定实现在 `src/components/layout/Sidebar.tsx`（不是 `ui/` primitive）。 |
| 7 | README / README_CN 截图与主题描述已更新 | 人工 | **通过（C9 完成）**。Highlights 与 Tech Stack 主题描述双语改写；`images/01–06.png` 换为玻璃界面截图（同路径同格式 PNG，2600×1800，256 色量化），`docs/public/images/` 同步。截图来自浏览器 fixture 演示态，见 `visual-matrix.md`。 |

## 视觉矩阵中发现并修复的违规（补充）

- `src/index.css` `.skill-markdown blockquote` 使用 `border-left: 3px solid`（C7 引入），违反 DESIGN.md「Don't 用 border-left/right > 1px 的彩色侧边条」。该规则不在 `glassSurfaceContract` 的扫描范围（只扫 TS/TSX），由视觉矩阵发现，已修复，见 `visual-matrix.md` F1。全仓 `rg "border-left:\s*[2-9]|border-l-[2-9]" src` 现为 0。
