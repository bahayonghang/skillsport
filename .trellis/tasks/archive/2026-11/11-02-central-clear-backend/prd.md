# 一键清理：后端 preview/apply 与孤儿扫描

父任务：`11-02-central-clear-all`（需求来源、场景矩阵 S1–S16、跨层契约见父目录 `prd.md` / `design.md`）。

## 范围

- 新增 service：中央 skills 全量清理的批量预览、锁内 apply、孤儿链接/未登记中央条目扫描。
- 新增 IPC：`preview_clear_central_skills`、`clear_central_skills`、`cancel_central_clear`。
- 新增作业族 `central_clear`（Exclusive Job Lifecycle）与进度事件 `central://clear-progress`。
- Local、SSH、WSL 三种目标。
- 测试、性能测试、backend spec。

## 不在范围

- 前端入口与对话框（`11-02-central-clear-frontend`）。
- CLI 命令。
- 修改现有单项/批量/仓库/unknown-source 删除语义（只允许抽取可复用的批量查询）。

## 验收标准

- [ ] 父 PRD 场景 S1–S16 每个至少一个 Rust 测试（Local 用 TempDir + `file_pool`；远端用 FakeRunner）。
- [ ] 预览不取 mutation lock，不写 FS/DB。
- [ ] apply 只取一次 mutation lock 和一次作业租约；内部调用 `delete_central_skills_under_guard`，不重复取锁。
- [ ] apply 只删除"锁内重新计算 ∩ 请求"的条目；预览后新增的 skill/链接不删（S12）。
- [ ] 渲染层传入的越界 key（不在扫描目录或可归属中央根内）被拒绝或忽略，不会删除任何东西。
- [ ] 普通目录（非链接、无 DB copy 记录）永不删除（S8）；Skills CLI 托管链接不动（S7）。
- [ ] 取消在条目边界生效，结果 `cancelled = true`，已提交项不回滚。
- [ ] 跨目标隔离：Local 清理不改 SSH/WSL 缓存 DB 与远端文件，反之亦然（S16）。
- [ ] 性能测试：1000 中央 skills × 6 agents（每个 agent 1000 链接）在 TempDir 下，预览阶段 SQL 次数为常数级
      （与 skill 数无关），并输出耗时；release 下预览 < 2s。
- [ ] 操作日志 `central.clear_all` 只含目标类型与计数；观测性测试覆盖新命令（参照 `skills_observability_tests.rs`）。
- [ ] `pnpm docs:gen` 生成文件已更新；`cargo test`、`cargo clippy` 通过。
- [ ] 新增 `.trellis/spec/backend/central-clear-all.md` 并登记到 index；`exclusive-job-lifecycle.md` 加入新作业族。
