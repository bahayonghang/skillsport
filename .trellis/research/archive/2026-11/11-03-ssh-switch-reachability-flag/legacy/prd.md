# 切换 SSH 目标前验证连通性，并在中央技能页标题旁显示可点击状态旗标

## Goal

用户切到 SSH 目标，或应用打开时当前目标已经是 SSH 时，必须先确认这条连接现在打得通，再把中央技能库画成在线。只有连接报错或连不上时，标题和右侧路径信息之间才出现一枚玻璃风格旗标，点击进入现有 SSH 设置。连接正常时不显示旗标。

用户价值：过期或错误的 IP 不再显示成“已连接，并且有一座可浏览的技能库”。用户能从中央技能页直接去改主机、端口或凭据。

## Decision

活动 SSH 目标探测失败时，不把本机缓存当成在线库。

- 切换探测失败：不修改活动目标，快速切换菜单留下错误。
- 当前活动目标已经连不上：技能区改为不可达状态，不渲染缓存卡片，标题计数和侧栏中央技能计数也不显示缓存数量。此时才显示旗标，并可点进 SSH 设置。
- 旗标只表示失败。检查中和连接正常都不显示。切换到一个失败目标时，若当前活动目标仍然正常，错误留在切换菜单里，页头不出现旗标。
- 缓存仍留在磁盘上。同一次会话里探测再次成功后，再加载并显示技能库。

## Confirmed Facts

截图里的 `dckj` 行显示 `Password - lyh@192.168.31.17:22` 并标成 Active。用户确认该 IP 实际不对，中央技能页仍显示技能数量和 `/home/lyh/.skillsmanage/...`。

- `switchTarget` 只调用 `set_active_target`。`src/stores/targetStore.ts:317-336`
- `set_active_target_impl` 只确认目标存在并写入 active id。`src-tauri/src/targets/commands.rs:326-350`
- 创建和更新会探测；打开传输本身不探测。`src-tauri/src/targets/commands.rs:10-18`、`43-49`；`src-tauri/src/targets/tests.rs:657-668`；`src-tauri/src/targets/remote.rs:9-16`
- 手动测试命令 `test_ssh_target` 会跑同一条探测，失败时返回 `ok: false`，不切换目标。按 id 加载已有目标时，探测前没有走 `attach_available_password`，因此会话内密码可能探不到，而真正的活动连接可以。`src-tauri/src/targets/commands.rs:60-85`；`src-tauri/src/targets/registry.rs:176-201`、`406-408`；`src-tauri/src/targets/exec.rs:82-91`
- 远程技能列表来自本机按 target id 打开的缓存库，路径用上次写下的 `remote_home`。`src-tauri/src/targets/registry.rs:437-482`
- 菜单里的 Active 和 `user@host:port` 来自已保存配置。管理入口目前只去 `/settings`。`src/components/layout/TargetQuickSwitcher.tsx:39-49`、`72-75`、`140-144`
- 设置页也会调用同一个 `switchTarget`。`src/pages/settingsViewActions.ts:418`
- 中央技能页标题在左，计数、路径和操作在右，中间是 `PageHeader` 的弹性空白。旗标放在标题右侧、meta 左侧的这段空白。`src/components/central/CentralSkillsShell.tsx:342-372`；`src/components/ui/page-header.tsx:45-55`
- `Badge` 不可点击。页头按钮已经是玻璃胶囊。`src/components/ui/badge.tsx:8-11`；`src/components/ui/button-variants.ts:40-43`
- SSH 设置已有 `/settings/connections?section=remote-targets`，会滚到远程目标区。`src/components/settings/settingsPages.ts:41-45`；`src/pages/SettingsView.tsx:382-395`
- 侧栏中央技能计数来自 `skillsByAgent["central"]`。`src/components/layout/Sidebar.tsx:267-274`
- 探测进程上限 30 秒，SSH `ConnectTimeout` 为 10 秒。`src-tauri/src/targets/runner.rs:43-48`；`src-tauri/src/targets/exec.rs:7`、`212`

## Requirements

1. 切到 SSH 目标时，先用与创建/更新相同的探测判断现在能否连上。探测使用该目标已保存的凭据，包括系统凭据库和当前会话密码。探测未完成前，不能把目标画成已可用。
2. 探测失败时不调用 `set_active_target`。活动目标保持切换前的值。菜单保持打开并显示失败原因。已保存的 host、端口、用户名不被改写。
3. 应用加载后若活动目标已是 SSH，同样做一次探测。不能只因为 active id 已写入就显示在线。
4. 探测结果未成为“可达”之前，中央技能页不渲染缓存技能卡片，标题上的结果计数不显示缓存数量，路径不表现成一座正在浏览的在线库，侧栏中央技能计数也不显示缓存数量。
5. 不可达时，技能区是不可达空状态，并提供一次重试。重试只重新探测当前活动 SSH 目标。成功后再加载并显示技能库。
6. `PageHeader` 增加可选状态槽，只由中央技能页在活动 SSH 目标连不上或探测报错时使用。旗标是一枚带图标和文字的玻璃按钮，表达连接失败。检查中、连接正常、本地和 WSL 都不渲染这枚旗标，标题行恢复成现在的空白。
7. 失败旗标可点击，进入 `/settings/connections?section=remote-targets`。不新开 SSH 表单。旗标文字只说明无法连接，不展示密码，也不把整段探测输出铺进标题行。
8. 探测成功不改写已保存的 host、端口、用户名。
9. 文案走 `src/i18n/locales/zh.json` 与 `en.json`。组件不直接调用 `invoke()`。探测和切换经 `targetStore`。
10. 凭据只走 `SecretStore`。探测请求、错误、旗标和日志不出现密码、私钥或 passphrase。切换探测只提交目标 id，不把密码再送进 IPC。

## Acceptance Criteria

- [ ] 切换到 SSH 目标会先探测。结果 `ok: false` 或命令失败时，`set_active_target` 不被调用，活动目标不变，快速切换菜单展示失败原因。
- [ ] 探测 `ok: true` 之后，活动目标才变为该 SSH 目标，菜单 Active 与顶部触发器一致。
- [ ] 已保存密码只在会话凭据中时，按 id 探测仍能使用它，与活动连接取凭据的方式一致。
- [ ] 启动时活动目标已是 SSH：检查完成前，中央技能卡片、标题计数和侧栏中央技能计数都不显示缓存内容。
- [ ] 不可达时，上述三处仍不显示缓存库；空状态可重试；重试成功后技能库重新出现。
- [ ] 只有活动 SSH 目标连不上或探测报错时，标题与路径 meta 之间才有失败旗标；点击进入远程目标设置。
- [ ] 检查中、探测成功、本地和 WSL 都不显示这枚旗标。
- [ ] 从正常目标切到一个连不上的 SSH 目标时，活动目标不变，错误出现在切换菜单；页头不因此出现旗标。
- [ ] 中英文 key 齐全。store、切换器和中央技能页测试覆盖成功时无旗标、失败时有旗标、检查中无旗标、重试和点击跳转。失败路径的断言里不出现密码。

## Out of Scope

- 自动改正或猜测 IP。
- 改变 WSL 的切换和探测。
- 新的 SSH 设置页、新的凭据存储，或在旗标上编辑连接。
- 重做 `PageHeader` 的现有标题、meta、actions 换行规则。除可选状态槽外，其它页面外观不变。
- Dashboard、Marketplace、Rules、Projects、全局搜索继续读取目标缓存。本任务不把这些页面改成连通性门闩。
- 把 `set_active_target` 改成会自行联网的命令。
