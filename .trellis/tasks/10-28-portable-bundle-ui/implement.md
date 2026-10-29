# Implement — portable-bundle-ui

前置条件：core 与 import 两个子任务都已合并到 `dev`。

## 步骤

1. [ ] 阅读 jsonl 中的前端规范；确认虚拟列表方案与 Tauri 拖放事件的用法。
2. [ ] `src/types/portableBundle.ts` + `commandMap.ts` 条目（core/import 已加的保持一致）。
3. [ ] `centralSkillsStore.portabilitySlice.ts` + store 测试（含终态保护）。
4. [ ] `portabilityViewModel.ts` 纯函数 + 单元测试。
5. [ ] 组件：ExportPanel → ImportFilePicker → ImportPreviewSummary → ImportDecisionList → ImportResultView → PortabilityDialog。
6. [ ] 切换调用点，删除旧对话框与旧 store 动作。
7. [ ] i18n en/zh（新错误码、步骤、按钮、空状态、`legacy_v1` 说明）；README / README_CN。
8. [ ] 删除后端 v1（命令、服务、注册、AppState 字段、reviewed codes），`cargo test` 与 `cargo clippy`。
9. [ ] `pnpm docs:gen`；全仓搜索 v1 标识符确认无残留。
10. [ ] 在 dev 预览中走完整流程并截图；`just ci`。

## 验证命令

```bash
pnpm vitest run src/test/components/central src/test/stores
pnpm typecheck
pnpm lint
pnpm docs:gen:check
pnpm capabilitycheck
just ci
```

## 回滚点

- 第 1–7 步与第 8–9 步分两个提交（同一个 PR 内）：如需回退，可只 revert 删除 v1 的提交，暂时保留新 UI。
