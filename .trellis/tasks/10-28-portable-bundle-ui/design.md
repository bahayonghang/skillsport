# Design — portable-bundle-ui

以父任务 `design.md` 第 8 节为准，这里补充前端结构。

## 组件

```text
src/components/central/portability/
├── PortabilityDialog.tsx          # 外壳：Export / Import 两个视图切换（作业运行中可切换查看，但不能发起新作业）
├── ExportPanel.tsx                # 摘要卡 + 导出按钮 + 进度 + 完成卡
├── ImportPanel.tsx                # 步骤条容器
├── ImportFilePicker.tsx           # 按钮 + 拖放（Tauri drag-drop 事件只拿路径）
├── ImportPreviewSummary.tsx       # 分类 chip + 元数据统计 + origin 标签
├── ImportDecisionList.tsx         # 虚拟化列表 + 筛选 + 批量操作
├── ImportResultView.tsx           # 结果明细 + 仅重试失败项
└── portabilityViewModel.ts        # 纯函数：决策默认值、批量操作、校验、结果→重试决策
```

- 旧的 `CentralStatePortabilityDialog.tsx` 删除，调用点（`CentralSkillDialogs.tsx` / `CentralSkillsView.tsx` /
  `centralSkillsViewModel.ts`）改为使用新组件；props 收敛为 `open` / `onOpenChange`，其余从 store 读取，
  组件内不直接 `invoke()`（遵守 AGENTS.md）。
- 虚拟化：先确认仓库中是否已有虚拟列表依赖（例如中心库列表使用的方案），有则复用，避免新增依赖。

## Store slice

```ts
interface PortabilitySlice {
  portability: {
    job: PortableBundleJob;                  // jobId/phase/status/total/completed/currentItem
    exportSummary?: PortableBundleExportSummary;
    preview?: PortableBundleImportPreview;   // 含 previewToken
    decisions: Record<string, Decision>;     // key = skill id
    lastResult?: PortableBundleImportResult;
  };
  loadExportSummary(): Promise<void>;
  exportBundle(path: string): Promise<PortableBundleExportResult>;
  previewBundle(path: string): Promise<void>;
  setDecision(id: string, d: Decision): void;
  setDecisionsBulk(filter: SkillClass, d: Decision): void;
  applyImport(onlyIds?: string[]): Promise<PortableBundleImportResult>;
  discardPreview(): Promise<void>;
  cancelJob(): Promise<void>;
}
```

- 进度合并：`if (isTerminal(current.status) && current.jobId === payload.jobId && !isTerminal(payload.status)) return current;`
- 导入成功后刷新 skills / repositories / tags / tag groups / saved views（复用现有加载动作）。

## 删除清单

后端：`commands/portable_state.rs`、`services/portable_state/`、`ipc_registry.rs` 中的 6 条记录、`AppState.portable_state_jobs`、
reviewed codes 中的 `portable_state.*`（确认没有其他引用）。
前端：`src/types/portableState.ts`、`commandMap.ts` 中的条目、`updateSlice.ts` 中的 portability 动作、
`centralSkillsStore.shared.ts` 中的 `mergePortabilityProgress` / `createIdlePortabilityJob`、相关测试与测试支持文件。
