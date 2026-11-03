# Design：前端

## 1. 入口设计

### 1.1 工具栏 `⋯` 菜单（主入口）

危险操作不放在"Check all / Update Center / Add Skill"这一排主按钮里，避免误点；放进已有的
`ToolbarMoreMenu`（`src/components/central/CentralSkillsShellMenus.tsx`）最底部：

```text
┌───────────────────────────────┐
│ ◷ 任务中心                 2  │
│ ───────────────────────────── │
│ 平台管理                       │
│ ⎘ 导入 / 导出（Portability）   │
│ ───────────────────────────── │
│ 🗑 一键清理中央仓库…           │  ← 危险色文字 + 图标，testid central-clear-all-open
└───────────────────────────────┘
```

- `ToolbarMoreMenu` 新增 `onOpenClearAll: () => void` 与 `clearAllBusy: boolean`（执行中禁用并显示"清理中…"）。
- 文案末尾的省略号表示会弹出对话框，不会立即执行。

### 1.2 空状态（数据丢失场景的入口）

S5 场景下中央仓库为 0，卡片区只显示空状态，用户无从发现残留。`CentralSkillEmptyState` 在"总数 0 且无筛选"
时追加次级按钮：

```text
        中央仓库中还没有 skill
   [ 导入 skill ]   [ 检查残留安装 ]   ← ghost 按钮，打开同一对话框
```

### 1.3 命令面板

`src/pages/centralPaletteActions.ts` 增加动作 `clear-central`，关键词含"清理 / 清空 / clear / reset"。

## 2. 对话框：`ClearCentralSkillsDialog`

文件：`src/components/central/clearAll/ClearCentralSkillsDialog.tsx`，子组件拆分：
`ClearPreviewSummary.tsx`、`ClearAgentTable.tsx`、`ClearPathDetails.tsx`、`ClearProgressPanel.tsx`、
`ClearResultPanel.tsx`。状态机放在 `src/pages/centralClearAllWorkflow.ts`（与 `centralSkillsDeleteWorkflow.ts` 同级）。

### 2.1 状态机

```text
closed ──open──▶ loadingPreview ──ok──▶ preview ──confirm──▶ running ──done──▶ result
                      │                    │                   │                 │
                      └─error─▶ previewError  └─cancel─▶ closed   └─cancel─▶ result(cancelled)
                                                                              └─"重新预览"─▶ loadingPreview
```

### 2.2 预览布局

```text
┌ 一键清理中央仓库 · Local ─────────────────────────────────────────┐
│ ⚠ 此操作会永久删除中央仓库中的全部 skill 及其在各 Agent 中的安装。 │
│   不可撤销。 建议先 [导出备份]。                                    │
│                                                                    │
│  ┌ 48 ───────┐ ┌ 96 ───────┐ ┌ 3 ────────┐ ┌ 12 ───────┐           │
│  │ 中央 skill │ │ Agent 链接 │ │ 项目链接   │ │ 孤儿链接   │           │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘           │
│                                                                    │
│  Agent            链接(自动)   copy(默认保留)    孤儿链接            │
│  🌐 Universal        15        0                 0                  │
│  ▲ Antigravity       15        1   [ ] 一并删除   2                  │
│  🤖 Claude Code      16        0                 0                  │
│  …                                                                 │
│                                                                    │
│  [✓] 清理项目中的中央链接（3）           ▸ 查看路径                  │
│  [✓] 清理孤儿链接（12，其中 10 个已悬空）  ▸ 查看路径                  │
│  [✓] 清理中央目录中未登记的条目（2）      ▸ 查看路径                  │
│  ⓘ 已跳过 5 个非 SkillPort 管理的普通目录                             │
│  ⓘ 将先恢复 1 个未完成的历史操作                                      │
│  ⚠ 2 个目录无法读取（展开查看）                                       │
│                                                                    │
│  输入「清空中央仓库」以确认：[____________]                          │
│                                   [取消]  [永久清理 48 个 skill]     │
└────────────────────────────────────────────────────────────────────┘
```

- 汇总卡片用现有 glass 表面组件；危险按钮用 `variant="destructive"`。
- Agent 行图标/名称来自 `usePlatformStore` 的 agents；预览中出现但 store 中不存在的 agentId 显示原始 id。
- 路径明细：`ClearPathDetails` 折叠面板，`max-h` + 滚动，单类别超过 200 行时使用简易窗口化渲染。
- 只有孤儿 / 项目 / 未登记条目而没有中央 skill 时，确认按钮文案改为"清理 N 项残留"。

### 2.3 执行与结果

- 阶段名映射：`recovery` 恢复历史操作 / `projectLinks` 清理项目链接 / `skills` 删除中央 skill / `untracked` 清理未登记条目 /
  `orphanLinks` 清理孤儿链接 / `finalize` 收尾。
- 进度条 `completed / total`；"取消"调用 `cancel_central_clear`，按钮变为"正在取消…"。
- 结果：成功（toast + 关闭对话框）；部分失败或取消（对话框保持打开，显示成功/失败/跳过数，失败列表折叠）。

## 3. Store 与 IPC

- `src/lib/ipc/commandMap.ts`：登记三个命令；类型从生成文件或 `src/types/clearCentral.ts` 引入（优先 specta 生成）。
- `src/stores/centralSkillsStore.clearSlice.ts`（新 slice，挂到 `centralSkillsStore`）：
  - `previewClearCentral(): Promise<ClearCentralPreview>`
  - `clearCentral(request): Promise<ClearCentralResult>`：生成 `jobId`、订阅 `central://clear-progress`
    （按 jobId 过滤），完成/失败时取消订阅；
  - `cancelClearCentral()`；
  - 状态 `clearJob: { jobId, phase, completed, total, status } | null`。
- 完成后由 workflow 调用一次 `refreshCentralSkills`（现有加载动作）+ `usePlatformStore.refreshCounts()`，
  并清空 `selectedSkillIds` 与仓库筛选。
- 请求组装（纯函数 `buildClearCentralRequest(preview, options)`，便于单测）：
  - `skillIds = preview.skillIds`
  - `removeCopyAgentIds` = 勾选的 agent
  - 各路径类别：开关关闭 → `[]`；开启且 `truncated` → `["*"]`；否则为预览中的全部 key。
- fixture：`src/fixtures/` 增加 preview/apply/cancel 三个桩，并提供"空 / 正常 / 仅孤儿 / 截断 / 部分失败"五套数据。

## 4. i18n

键前缀 `central.clearAll.*`，中英文同时添加。包括：菜单项、空状态按钮、标题（含目标）、警告、汇总卡片、
表头、开关、提示、确认短语、确认按钮（含计数）、阶段名、取消中、结果文案、错误文案（预览失败/执行失败/锁忙/作业忙）。
确认短语：中文「清空中央仓库」，英文 `clear central`；比较前 trim，不区分大小写。

## 5. 无障碍

- 对话框 `role="alertdialog"`，打开时焦点落在"取消"。
- 确认输入框有 `aria-describedby` 指向警告文本。
- 进度条有 `aria-valuenow/valuemax` 与阶段文字。

## 6. 测试（Vitest + fixture）

| 用例 | 断言 |
| --- | --- |
| 菜单项渲染与打开 | 点击 `central-clear-all-open` 调用 preview |
| 空状态入口 | 总数 0 且无筛选时出现按钮；有筛选时不出现 |
| 预览失败 | 使用 `formatBackendError` 显示，toast 一次 |
| 空预览 | 显示"无需清理"，确认禁用 |
| 确认短语 | 不匹配禁用、匹配启用；取消不调用 apply |
| copy 勾选 | 请求中 `removeCopyAgentIds` 正确 |
| 截断 | 对应类别传 `["*"]` |
| 开关关闭 | 对应类别传 `[]` |
| 进度事件 | 按 jobId 过滤；其他 jobId 的事件不影响 UI |
| 取消 | 调用 cancel；结果显示已取消 |
| 部分失败 | 对话框保持打开并列出失败项；"重新预览"再次调用 preview |
| 刷新次数 | 成功后 skills 刷新与 `refreshCounts` 各调用一次 |
| 目标显示 | SSH 目标标题包含目标名 |

遵守 `async-ui-test-stability.md`（避免计时器竞态）与 `ipc-adapter.md`（fixture seam）。
