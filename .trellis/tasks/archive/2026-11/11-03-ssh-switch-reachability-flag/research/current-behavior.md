# 当前 SSH 切换与中央技能显示

记录于 2026-11-03，供实现时对照。产品决定以 `prd.md` 为准。

## 切换不探测

`useTargetStore.switchTarget`（`src/stores/targetStore.ts:317-336`）调用 `set_active_target`。`set_active_target_impl`（`src-tauri/src/targets/commands.rs:326-350`）只检查目标存在并写入 active setting。

创建和更新 SSH 目标会调用 `probe_ssh_target`（同文件 10-18、43-49）。探测脚本读 `$HOME`、`uname -s`，并确认中央目录可创建（`src-tauri/src/targets/exec.rs:73-91`）。进程 deadline 30 秒（`src-tauri/src/targets/runner.rs:43-48`），SSH `ConnectTimeout=10`（`exec.rs:7`、`212`）。

`remote_target_open_does_not_probe_ssh_host` 要求空 host 也能打开传输（`src-tauri/src/targets/tests.rs:657-668`）。因此“当前目标是 SSH”不等于“刚才连通过”。

## 缓存为什么仍能显示

`db_for_target` 对 SSH 打开本机缓存库，路径来自已保存的 `remote_home`（`src-tauri/src/targets/registry.rs:437-482`）。菜单文案使用已保存的 username、host、port（`src/components/layout/TargetQuickSwitcher.tsx:39-49`）。Active 徽章只比较 id（同文件 140-144）。

调用点：切换器 `handleSelect`，以及 `src/pages/settingsViewActions.ts:418`。

## 按 id 测试的凭据缺口

`test_ssh_target_impl` 按 id 从设置加载目标后直接 `probe_ssh_target`（`commands.rs:71-85`）。`open_ssh_target` 通过 `load_target_password` 读结构体上的密码、系统凭据库或受保护密码（`commands.rs:648-661`）。

活动目标解析会先 `attach_available_password`（`registry.rs:406-408`），其中包含会话密码（`registry.rs:176-201`）。按 id 的测试没有这一步。切换前探测必须补上，否则只存在会话密码的目标会被误判为不可达。

## 旗标位置与设置入口

中央技能标题行是 `PageHeader`：`h1` 在左，计数、路径、更改位置和操作在右（`CentralSkillsShell.tsx:342-372`，`page-header.tsx:45-55`）。红框是这两侧之间的弹性空白。

`Badge` 注释写明非交互（`badge.tsx:8-11`）。远程目标设置路由是 `/settings/connections`，section `remote-targets`（`settingsPages.ts:41-45`，`SettingsView.tsx:382-395`）。

侧栏中央技能数字是 `skillsByAgent["central"]`（`Sidebar.tsx:274`）。
