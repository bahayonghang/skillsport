# 实现顺序

## Checklist

1. 在 `test_ssh_target_impl` 里，已有目标且没有新提交密码时，探测前调用 `attach_available_password`。补 Rust 测试：会话密码足以让按 id 的探测拿到凭据；探测失败或未要求保存时，不把密码写回目标设置。
2. 给 `targetStore` 增加 `SshReachability`、探测代号，以及 `verifyActiveSshTarget`。`switchTarget` 对 SSH 先测后切；本地和 WSL 不调用 `test_ssh_target`。
3. `loadTargets` 在同一个状态更新里处理活动 SSH 的 phase，并按 design 的身份规则决定是否探测。
4. `PageHeader` 增加可选 `status` 槽。默认不传时现有页面快照保持不变。
5. 新增中央技能页失败旗标，只在活动 SSH 目标 `unreachable` 时接入 `CentralSkillsShell`。检查中和不可达都替换卡片区、标题计数和路径的在线表现，但检查中和可达都不渲染旗标。空状态提供重试和前往设置。可达后卸下旗标。
6. `Sidebar` 的中央技能计数在 checking / unreachable 时不显示缓存数字。
7. 设置页切换失败要能看见错误。切换器失败保持菜单打开，并 toast 公开消息。
8. 中英文 key。store、`TargetQuickSwitcher`、`PageHeader`、中央技能页和侧栏计数测试。断言成功和检查中没有旗标，只有不可达有旗标。

## Validation

迭代时跑相关 Vitest 与改动到的 Rust 目标测试。完成前跑 `just ci`。本任务不改 Tauri 命令签名或 schema，不跑 `pnpm docs:gen`。

建议的定向命令：

- `pnpm exec vitest run src/test/stores/targetStore.test.ts src/test/components/layout/TargetQuickSwitcher.test.tsx src/test/components/central`
- 旗标和空状态测试文件落地后，把它们的路径加进同一次 Vitest。
- `cargo test --manifest-path src-tauri/Cargo.toml test_ssh_target -- --test-threads=8`，若过滤名对不上实际测试模块，改跑 `src-tauri/src/targets/tests.rs` 所在的目标测试。

## Risks

- `test_ssh_target_impl` 保存分支会把目标写回设置。附上的会话密码必须在任何保存前清掉，测试要锁定“未要求保存则设置 JSON 不含明文密码”。
- `loadTargets` 与切换探测并发时，旧结果只能由代号丢弃。
- 中央技能视图若只在加载完成后判断 phase，会先闪出缓存卡片。phase 必须在活动目标变为 SSH 的同一次渲染里生效。
- 页头状态槽若改变无 status 页面的 DOM，会误伤其它 `PageHeader` 测试。

## Rollback

后端改动只在 `test_ssh_target_impl` 的已有目标分支。前端门闩集中在 `targetStore`、`PageHeader` 的可选槽、中央技能页和侧栏计数。撤回这些文件即可恢复“选中即显示缓存”。缓存库本身没有迁移。

## Before task.py start

- `prd.md`、`design.md`、`implement.md` 已按上述决定写完。
- `implement.jsonl` 与 `check.jsonl` 需要有真实 spec 条目，不能只留 `_example`。
- 用户确认本计划之后才能 `task.py start`。确认前不改产品代码。
