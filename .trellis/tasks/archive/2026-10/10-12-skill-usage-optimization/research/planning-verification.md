# 本轮规划验证

日期：2026-10-12。产品基线：`a77acc92`，dev，起始工作区干净。

## 交付范围

本轮只新增三个 planning 任务目录、研究和用户截图。没有 task.py start、产品代码/生成物变更、实机日志扫描、迁移、commit、push 或安装/发布。性能研究由 Trellis Phase 1.2 指定研究代理完成，视觉分析由主会话完成。

## 仓库质量门结果

执行 `just ci`，退出码 1，未通过。版本同步确认 1.0.2 无变更；version、docs生成漂移检查、typecheck、lint、capability、size、entrypoint、Rust fmt、Clippy 和 IPC codegen check 已通过。

- Rust：1456 passed、123 failed、9 ignored。失败覆盖 CLI、Central/安装/恢复、targets 等现有测试；本轮产品源码没有变化，因此这是当前代码在本执行环境下的基线失败。未查明所有失败根因，不判断为产品缺陷或环境权限故障。
- Frontend：182 test files passed、1 failed；2130 tests passed、1 failed。失败为 `src/test/scripts/runCi.test.ts:234` 的进程树取消测试，5秒超时。
- Rust lane 失败触发聚合停止；frontend build、docs site build 和 Trellis Python 后续门未完成，不能声称完整 CI 通过。

最小 Rust 重现命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked cli_api::tests::exact_shorthand_fixture_runs_import_list_show_and_sync_preview -- --exact --nocapture
```

单独执行 1 测试仍失败，`src/cli_api/mod.rs:641` left=0/right=1；日志保存在 `evidence/ci-rust-repro.log`。没有把无关修复并入本优化任务。后续实施完成仍必须重新取得 just ci 通过证据。

## 未验证项

- 视觉：未启动浏览器/WebView2，未测 DOM、首屏、最大化 trace 或优化后截图；只有用户截图与源码分析。
- 性能：没有本轮冷/暖/增量、内存、SQL/EQP、IPC/paint 实测；已有真实 HOME ignored benchmark 未运行，新 synthetic harness 尚未实施。
- 外部：没有连接真实 remote/provider，没有 installer、硬件或 production 证据。

## 规划结构校验

三个 `task.py validate` 均通过，无缺失引用或上下文截断警告：父任务 implement/check 为 4/6 条，视觉为 7/9 条，性能为 11/13 条。任务列表显示一个父任务与两个 planning 子任务，`task.py current --json` 返回 current_task=null、source=none、stale=false，无任务被激活。

三个任务各有 PRD/design/implement 和真实上下文条目，需求映射/父子关系与截图尺寸另做结构校验；没有模板需求占位。工作区只新增这三个目录。这些校验只验证规划材料，不能替代上述产品质量/视觉/性能证据。
