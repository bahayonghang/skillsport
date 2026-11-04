# SSH 连通性门闩与中央技能页旗标

## Boundaries

连通性状态放在 `targetStore`。页面只读这个状态并渲染。组件不调用 `invoke()`。

`set_active_target` 继续只负责写入 active id。SSH 切换的探测留在 store：先 `test_ssh_target({ id })`，只有 `ok: true` 才调用 `set_active_target`。这样失败不可能留下新的活动目标，现有不联网的激活测试也不必改成集成测试。

`test_ssh_target_impl` 在按 id 加载已有目标后、调用 `probe_ssh_target` 之前，必须 `registry.attach_available_password`。这让探测使用系统凭据库、受保护密码和当前会话密码，与 `TargetRegistry::target_from_snapshot` 打开活动连接的方式一致。没有新提交的密码时，不得把附上的密码写回设置。

不新增 IPC，不改命令签名，因此不跑 `pnpm docs:gen`。

## State

```ts
type SshReachability =
  | { phase: "idle" }
  | { phase: "checking"; targetId: string }
  | { phase: "reachable"; targetId: string }
  | { phase: "unreachable"; targetId: string; message: string };
```

- 本地和 WSL 的 phase 是 `idle`。
- 同一次 `set()` 里，活动目标变成 SSH 时，phase 必须同时变成 `checking` 或已有的同 id 结果。禁止出现“活动目标已是 SSH，phase 仍是 idle 或上一个目标的 reachable”。
- 每次探测带递增代号。返回时只有代号和 target id 仍匹配才写入结果。
- `loadTargets` 再次返回同一个 SSH id，且 host、port、username 未变，并且当前已是 `reachable` 时，不重新探测。上述身份变了，或当前不是 `reachable`，则进入 `checking` 并探测。
- `switchTarget` 到另一个 SSH id：不改 `activeTarget`，把 `switchingTargetId` 设为候选 id。失败只写 `error`，phase 仍描述当前活动目标。成功后才替换 `activeTarget`，并把 phase 设为该 id 的 `reachable`。

## Switch Flow

1. 候选是本地或 WSL：沿用现在的 `set_active_target`，phase 设为 `idle`。
2. 候选是 SSH，且不是当前活动 id：`test_ssh_target({ id })`，请求体不含 password、key 或 passphrase。
3. 返回 `ok: false` 或抛错：不调用 `set_active_target`。菜单错误使用结果里的公开 `message`；抛错则经 `formatBackendError`。切换器保持打开。按 `async-error-feedback` 再发一条 toast，不把 `String(err)` 直接拼进界面。
4. 返回 `ok: true`：调用 `set_active_target`，随后现有的目标切换刷新可以运行。
5. 设置页的切换继续调用 `switchTarget`，因此同一条规则生效。设置页要显示这次失败，不能只把错误留在切换器里。

启动时 `loadTargets` 发现活动目标是 SSH，则在返回后启动探测，不等待它才渲染整个窗口。中央技能页自己等待结果。

## What Central Skills May Paint

只有 phase 为 `reachable` 且 target id 等于活动 SSH id 时，才渲染：

- 技能卡片
- 标题旁的结果计数
- 中央仓库路径作为“正在浏览的目录”
- 侧栏 `skillsByAgent["central"]` 计数

`checking` 时，技能区显示检查中状态，页头不放旗标。`unreachable` 时，技能区显示不可达说明、重试和前往设置，页头才出现失败旗标。重试调用同一次活动目标探测；成功后调用现有 `loadCentralSkills` 与计数刷新，再显示卡片，并卸下旗标。

store 里即使已经有缓存技能，视图也必须忽略，直到 `reachable`。这样启动阶段的 `initialize` 不必被 30 秒探测堵住。

## Flag

旗标只在活动 SSH 目标的 phase 为 `unreachable` 时挂上。`idle`、`checking`、`reachable` 都不传 `status`，标题行保持今天的空白。切换失败但活动目标仍正常时，也没有旗标；错误只留在切换菜单和 toast。

`PageHeader` 增加可选 `status` 槽，放在 `h1` 同一行的右侧、`page-header-aside` 的左侧。未传入时 DOM 结构与现在的换行规则一致。只有 `CentralSkillsShell` 在失败时传入。

旗标是 `Button`，`variant="glass"`，高度与页头现有按钮一致，加上 destructive tint 与 destructive 文本，并带警告图标。文字是“无法连接”。`title` 可以是不含凭据的公开失败原因。点击 `navigate("/settings/connections?section=remote-targets")`。不使用 `Badge`。

文案放在 `targets.reachability.*` 与 `central.sshReachability.*`，中英文都要有。窄于 900px 时，旗标随标题换行，不覆盖右侧操作按钮。

## Compatibility And Rollback

- 失败不写 active id，所以回滚点就是不发布这次前端门闩。已有缓存数据库不动。
- `attach_available_password` 只影响按 id 测试已有目标的内存副本。新建目标的测试请求仍然用请求里的密码。
- 其它页面仍可能显示该目标的缓存。这是明确延期，不是本设计的隐式行为。

## Trade-Off

探测上限约 30 秒。这段时间中央技能页不显示旧卡片，窗口其余部分仍可用。换来的是错误 IP 不会先闪出 103 个技能。
