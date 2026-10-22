# C9 执行计划

前置：C1–C8 已合入 dev；读 `docs/agents/git-and-release.md`、`docs/agents/build-and-test.md`、`docs/agents/security-and-shared-state.md`（updater 部分）。

1. **集成审查**：执行父任务 `implement.md` 的集成审查清单；C4 契约测试中两份 pending 清单改为“必须为空”断言。
2. **版本**：三处改为 1.1.0（含 `Cargo.lock` 中本包版本），`pnpm version:check`。
3. **文档**：CHANGELOG（en / zh）条目、`release-notes/1.1.0.md`、README / README_CN 外观描述与截图、`docs/` 外观指南；`pnpm docs:gen:check`、`pnpm docs:build`。
4. **视觉矩阵**（design.md）：截图、问题清单、修复（若需改代码，按文件归属回到对应子任务或在本任务以最小修复提交并注明）。
5. **安装包**：按发布指南构建 Windows x64 产物；Win11 / Win10 全新安装与 1.0.2 升级（design.md 升级验证脚本）；Mica 开关；卸载。证据存 `research/`。
6. **收尾**：`just ci`、`just audit`（如发布指南要求）；结束报告列出未覆盖的 OS / 硬件组合与后续发布步骤（tag、Release、updater 元数据——需另行授权）。
