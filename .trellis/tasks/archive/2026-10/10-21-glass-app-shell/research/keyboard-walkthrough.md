# C5 keyboard walkthrough (observed)

This was recorded with headless Chrome over CDP against `pnpm dev`, using the browser IPC fixtures. The route was `/dashboard`, in `glass-light`, at 1280×800, with the zh locale. Keys were sent with `Input.dispatchKeyEvent`. After every key the harness read `document.activeElement`, its `:focus-visible` state, its computed outline, and the shell state (sidebar width, `data-theme`, and whether a menu, dialog or sheet was open). The raw step log is `c5-shell-report.json` → `followUp.keyboardWalkthrough.steps` (56 steps). The console showed no errors.

Every focused stop below had `:focus-visible` = true. TopBar, sidebar, resize-handle and page stops drew the shared outline: `solid 2px` at `offset 2px`, in `rgb(19 128 90)` in light and `rgb(79 209 161)` in dark (from the earlier dark Tab pass and the focus-ring shots). Target-menu items have no outline (computed `outline-style: none`). They show focus with the C4 `ui/menu` highlight instead: `data-[highlighted]:bg-accent`, which is a fill, not a ring.

## 1. Tab order (focus starts on body)

| Steps | Region | Stops |
| --- | --- | --- |
| 2–6 | TopBar | App icon "SkillPort" → search trigger "搜索技能… Ctrl K" → 导入技能 → 切换当前目标 (target switcher) → 查看键盘快捷键 |
| 7–16 | Sidebar nav | Dashboard → 中央技能库 → 规则管理 → Skills CLI 全局 → 项目 → Obsidian 仓库 → 技能市场 → 技能集合 → 操作日志 → 技能使用 |
| 17–23 | Sidebar section | 收起全局工作区 (section toggle) → Universal → Claude Code → Grok → Antigravity → Antigravity CLI → Kiro |
| 24–26 | Sidebar footer | 设置 → 切换到深色模式 (light/dark toggle) → 收起侧边栏 (collapse) |
| 27 | Resize handle | `role="separator"` "调整侧边栏宽度" |
| next | Main | First focusable control in the page ("浏览中央技能", from the first Tab pass) |

The sidebar has no header row: the first sidebar stop is Dashboard. The fixtures have no registered projects, so the project-workspace section and its sort trigger never rendered. The sort menu's keyboard path (Enter opens it, ArrowDown + Enter selects, Escape closes and returns focus to the trigger) is covered by `Sidebar.test.tsx` and was not observed in the browser.

## 2. Resize handle (arrow keys)

| Step | Key | Panel width |
| --- | --- | --- |
| 27 | (focused) | 208 |
| 28 | ArrowRight | 224 |
| 29 | ArrowRight | 240 |
| 30 | ArrowLeft | 224 |
| 31 | ArrowLeft | 208 |

Focus stayed on the separator throughout. Each press changes the width by 16px. The 168 / 360 limits are covered by `Sidebar.test.tsx` ("supports keyboard resizing from the right edge").

## 3. Footer toggle and collapse

| Step | Key | Focus after | Result |
| --- | --- | --- | --- |
| 32 | Shift+Tab | 收起侧边栏 | — |
| 33 | Shift+Tab | 切换到深色模式 | — |
| 34 | Enter | same button, now named 切换到浅色模式 | `data-theme` glass-light → glass-dark |
| 35 | Enter | same button, named 切换到深色模式 again | glass-dark → glass-light |
| 36 | Tab | 收起侧边栏 | — |
| 37 | Enter | same button, now named 展开侧边栏 | panel 208 → 56 |
| 38 | Enter | same button, named 收起侧边栏 again | panel 56 → 208 |

Focus never drops to body when the theme or the collapsed state flips.

## 4. Target switcher menu (`ui/menu`)

| Step | Key | Focus after | State |
| --- | --- | --- | --- |
| 39 | (focus the trigger, Tab stop 5) | 切换当前目标 | — |
| 40 | Enter | menuitem "本机 · 当前" | menu open |
| 41 | ArrowDown | menuitem for the fixture SSH target | menu open |
| 42 | ArrowDown | menuitem "管理目标…" | menu open |
| 43 | Escape | 切换当前目标 (trigger) | menu closed |

## 5. Shortcuts sheet (`ui/sheet`)

| Step | Key | Focus after | State |
| --- | --- | --- | --- |
| 44 | Tab | 查看键盘快捷键 | — |
| 45 | Enter | sheet close button "关闭" | sheet open (`role="dialog"`) |
| 46–47 | Tab, Tab | still "关闭" | focus is trapped (the close button is the sheet's only focusable element) |
| 48 | Escape | 查看键盘快捷键 | sheet closed |
| 49 | `?` (after blurring to body) | "关闭" | sheet open |
| 50 | Escape | 查看键盘快捷键 | sheet closed |

## 6. Global search (command dialog)

| Step | Key | Focus after | State |
| --- | --- | --- | --- |
| 51 | Ctrl+K | combobox input "搜索技能、技能集、操作…" | dialog open |
| 52 | ArrowDown | input keeps focus; the selected cmdk item moves to "dense-typography-validation-skill…" | dialog open |
| 53 | Escape | the previously focused control (查看键盘快捷键) | dialog closed |
| 54 | Tab from the app icon | search trigger | — |
| 55 | Enter | combobox input | dialog open |
| 56 | Escape | search trigger | dialog closed |

## 7. Collapsed rail

With the rail collapsed, Tab still goes through every nav, footer and platform button as a 40px circle. Each has an accessible name from `aria-label` and a `title`. The resize handle is removed from the DOM.

`c5-{light,dark}-focus-ring-nav-collapsed.png` show the outline fully inside the rail's scroll box: 3px of clearance on each side, measured as `ringLeftClearancePx` / `ringRightClearancePx` in the report. `overflow-x-hidden` does not clip it.
