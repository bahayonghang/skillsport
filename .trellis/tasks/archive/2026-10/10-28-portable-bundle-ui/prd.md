# 便携包 v2：前端对话框重做与移除 v1

父任务：[`10-28-central-state-portability-v2`](../10-28-central-state-portability-v2/prd.md)
共享设计：[`design.md`](../10-28-central-state-portability-v2/design.md) 第 7、8、9 节。
依赖：`10-28-portable-bundle-core` 与 `10-28-portable-bundle-import` 均已合并。

## 范围

- 新的 store slice（`centralSkillsStore.portabilitySlice.ts`）与类型（`src/types/portableBundle.ts`）。
- 重写 `CentralStatePortabilityDialog.tsx`（以及 `statePortabilityDialogParts.tsx` / `statePortabilityDialogUtils.ts`）。
- i18n（en/zh）、README / README_CN。
- 删除 v1：6 个旧命令、`services/portable_state/`、`commands/portable_state.rs`、`src/types/portableState.ts`、
  旧 store 动作、旧测试；v1 样例 `src/test/support/fixtures/skillport-state-export.json` 只保留用于"识别 v1 并提示"的测试，
  或者删除并改用小型内联样本。
- `pnpm docs:gen`。

## 需求

- 覆盖父 PRD 的 R1.5、R2（界面部分）、R3.1、R3.7、R5。
- 打开对话框只调用 `get_portable_bundle_export_summary`。
- 导出：摘要卡 → 原生保存对话框（默认文件名 `skillport-<target>-<yyyy-mm-dd>.skillport`）→ 进度/取消 → 完成卡（体积、跳过项、在文件夹中显示）。
- 导入：步骤条 `选择文件 → 预览 → 处理冲突 → 导入 → 结果`；支持拖放；只接受 `.skillport` / `.zip`。
- 冲突列表虚拟化（1000+ 项不卡顿），按分类筛选，批量"全部覆盖/全部跳过"，单条 skip/overwrite/rename（带校验）。
- 结果视图：成功/跳过/失败明细，"仅重试失败项"（同一 token 重新提交失败项的决策）。
- 作业状态合并加入终态保护；关闭对话框或切换目标时调用 `discard_portable_bundle_preview`。
- 错误统一用 `formatBackendError` 显示新错误码的本地化文案；`legacy_v1` 显示专用说明。
- 视觉遵守 `glass-surfaces.md` 与现有 1.1.0 毛玻璃风格；所有文案走 `src/i18n/`。

## 验收

- [ ] Vitest：store slice（成功、失败、取消、终态保护、目标切换时丢弃预览）。
- [ ] Vitest：对话框——打开只取摘要；导出流程；导入完整流程；批量决策；rename 校验；仅重试失败项；`legacy_v1` 提示。
- [ ] Vitest：1000 项的冲突列表渲染在测试预算内（只渲染可视行）。
- [ ] 代码库中搜索 `skillport_state`、`SkillportState`、`portableState` 无残留（生成文档除外，生成文档应已更新）。
- [ ] README / README_CN 已同步。
- [ ] `pnpm docs:gen` 产物已提交，`just ci` 通过。
- [ ] 在 dev 预览中截图：导出完成卡、导入预览、冲突处理、结果（附在 PR 中）。
