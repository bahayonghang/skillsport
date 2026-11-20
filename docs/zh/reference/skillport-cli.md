# SkillPort CLI

`skillport-cli` 是 SkillPort 本机 Local target 的命令行入口。它与桌面端共用同一个
SQLite 数据库、中央技能库、受保护的 GitHub 凭据、安装服务和跨进程 mutation lock。

当前版本的 CLI 不管理 SSH 或 WSL target。`just ci` 等仓库开发命令另见
[CLI：just](./cli-just)。

## 运行或安装

在仓库 checkout 中直接运行，无需先安装：

```powershell
npm run cli -- skills list
```

构建 release binary：

```powershell
npm run build:cli
```

Windows 产物位于 `src-tauri/target/release/skillport-cli.exe`；macOS 或 Linux
产物位于 `src-tauri/target/release/skillport-cli`。

从当前 checkout 安装到 `PATH`：

```powershell
npm run install:cli
```

等价的 Cargo 命令是：

```powershell
cargo install --path src-tauri --bin skillport-cli --locked --force
```

桌面端 NSIS 安装器不会自动把 CLI 加入 `PATH`。桌面 binary 是 `skillport`，命令行
binary 是 `skillport-cli`。

## 命令结构

```text
skillport-cli [--json] [--lang en|zh] <group> <command>
```

| 命令组 | 子命令 |
| --- | --- |
| `skills` | `list`、`show`、`search`、`install`、`import`、`sync`、`unlink` |
| `agents` | `list` |
| `projects` | `list`、`skills`、`add`、`install`、`uninstall` |
| `tags` | `list`、`create`、`add`、`remove` |
| `notes` | `get`、`set` |

| 全局选项 | 含义 |
| --- | --- |
| `--json` | 为脚本输出带版本号的单行 JSON envelope。 |
| `--lang en\|zh` | 选择英文或中文 human output 标签，同时决定 `notes` 读写的语言和 `skills show` 返回的解释语言，默认 `en`。 |
| `--help` | 显示当前命令的帮助。 |
| `--version` | 输出 CLI 版本。 |

Windows 上只要安装目录已经加入 `PATH`，`skillport-cli.exe` 与 `skillport-cli`
写法等价。

## 查看中央技能

### 列表

列出本机中央技能库中的所有技能：

```powershell
skillport-cli skills list
```

过滤列表。多个过滤条件按 AND 组合，重复的 `--tag` 必须全部匹配：

```powershell
skillport-cli skills list --tag docs --tag writing --agent codex
skillport-cli skills list --source local-dir
```

`--tag` 接受标签 id 或精确名称，标签不存在时以 code `3` 退出。`--source` 精确匹配，
未知来源返回空列表。

### 详情

查看一个中央技能：

```powershell
skillport-cli skills show <reference>
```

输出额外包含技能的标签（含每条关联的 `source`）、项目安装记录，以及 `--lang` 对应语言
的缓存解释；没有解释时为 `null`。

`<reference>` 按以下顺序解析：

1. 完全匹配不可变 `uid`；
2. 完全匹配 slug / skill id；
3. 唯一且区分大小写的技能名称。

如果同一名称匹配多个中央技能，命令以 code `3` 退出。此时使用 `list` 输出中的
`uid` 或 slug 消除歧义。

### 搜索

搜索远端 skills.sh catalog：

```powershell
skillport-cli skills search "react" --limit 10
```

`--limit <number>` 可选。搜索不会导入或安装技能。

## 导入技能

install 接受精确 skills.sh shorthand 或 GitHub URL：

```powershell
skillport-cli skills install vercel-labs/agent-skills@react-best-practices
skillport-cli skills install "https://github.com/openai/skills/tree/main/skills/docs"
```

支持的 source：

| Source | 行为 |
| --- | --- |
| `owner/repo@skill` | 解析并导入一个精确 skills.sh 技能。 |
| `https://github.com/...` | 预览并导入仓库或 tree URL 下发现的技能。 |

本地文件路径和非 GitHub URL 会被拒绝；本地文件夹或 ZIP 请使用
[`skills import`](#导入本地技能)。GitHub 鉴权复用 SkillPort 中已经配置的凭据；CLI 不提供
token 参数。

### 重复项安全规则

已有中央技能不会被静默覆盖：

```powershell
skillport-cli skills install owner/repo@skill --replace
```

- 未传 `--replace` 时，重复项以 code `3` 退出。
- `--replace` 显式允许覆盖。
- 一个 GitHub URL 发现多个技能时，批量覆盖还必须传入 `--yes`。

### 导入后同步

`--sync` 会先导入技能，再安装到 Agent 目录：

```powershell
skillport-cli skills install owner/repo@skill --sync --agent codex --method copy
```

`--agent <id>` 可以重复传入。使用 `--sync` 但未指定任何 `--agent` 时，会选择
除 Central 外所有已启用的本机 Agent。

## 同步中央技能

写入前先预览同步计划：

```powershell
skillport-cli skills sync <uid-or-slug> --agent codex --method copy --dry-run
```

应用同一计划：

```powershell
skillport-cli skills sync <uid-or-slug> --agent codex --method copy
```

同步多个 reference 或整个中央技能库：

```powershell
skillport-cli skills sync <ref-1> <ref-2> --dry-run
skillport-cli skills sync --all --dry-run
```

| 选项 | 含义 |
| --- | --- |
| `[REFERENCES]...` | 一个或多个中央技能 `uid`、slug 或唯一名称。 |
| `--all` | 选择全部中央技能，不能与 references 同时使用。 |
| `--agent <id>` | 限定为一个已启用的本机 Agent；可重复指定多个。 |
| `--method auto\|symlink\|copy` | 安装方式，默认 `auto`。 |
| `--dry-run` | 返回目标路径和安装方式，不修改数据库或文件系统。 |

未传 `--agent` 时，sync 会面向除 Central 外所有已启用的本机 Agent。执行范围较大的
`--all` 操作前应先使用 `--dry-run`。

## 导入本地技能

把包含 `SKILL.md` 的文件夹或本地 `.zip` 技能包导入中央库。来源类型必须显式指定，
CLI 不会根据路径猜测：

```powershell
skillport-cli skills import --from-dir ./my-skill --dry-run
skillport-cli skills import --from-dir ./my-skill
skillport-cli skills import --from-zip ./my-skill.zip --sync --agent claude-code
```

| 选项 | 含义 |
| --- | --- |
| `--from-dir <DIR>` | 包含 `SKILL.md` 的文件夹，技能 id 取文件夹名。 |
| `--from-zip <FILE>` | 本地技能包。先预览，导入时字节未变化才会继续。 |
| `--replace` | 覆盖 id 相同的已有中央技能，保留原 `uid`；需要 `--yes`。 |
| `--sync`、`--agent <id>`、`--method` | 导入后立即安装到 Agent，用法同 `skills install`；多于一个 Agent 时需要 `--yes`。 |
| `--dry-run` | 只返回计划，不写入。 |

计划中的 `action` 为 `create`、`replace` 或 `duplicate`。未传 `--replace` 时，已存在的技能
以 code `3` 退出。来源位于中央库内部、包含中央库、缺少 `SKILL.md` 或含嵌套符号链接时，
以 code `2` 退出。

## 从 Agent 卸载技能

```powershell
skillport-cli skills unlink <uid> --agent codex --dry-run
skillport-cli skills unlink <uid> --agent codex --yes
```

`unlink` 只移除 Agent 中的安装，中央技能保留。该命令始终需要 `--yes`。

## Agent

```powershell
skillport-cli agents list
```

返回每个本机 Agent 的 `id`、`displayName`、`enabled` 和 `globalSkillsDir`。所有接受
`--agent` 的命令都使用这里的 `id`。

## 项目

```powershell
skillport-cli projects list
skillport-cli projects add . --dry-run
skillport-cli projects add .
skillport-cli projects skills .
skillport-cli projects install . <uid> --agent claude-code --dry-run
skillport-cli projects install . <uid> --agent claude-code --yes
skillport-cli projects uninstall . <uid> --agent claude-code --yes
```

项目引用可以是项目 `id`、路径（`.` 表示当前目录）或唯一的项目名。`projects add` 默认使用
当前目录，路径已注册时返回已有项目。`projects install` 接受 `--method auto|symlink|copy`；
一次安装多个技能或技能已安装时需要 `--yes`。`projects uninstall` 始终需要 `--yes`。

## 标签

```powershell
skillport-cli tags list
skillport-cli tags create "docs" --group Writing --dry-run
skillport-cli tags add <uid> --tag docs --reason "Writes reference docs" --confidence 0.9 --dry-run
skillport-cli tags add <uid> --tag docs --reason "Writes reference docs" --confidence 0.9
skillport-cli tags remove <uid> --tag docs --yes
```

- `--tag` 接受标签 id 或精确名称。标签不存在时以 code `3` 退出；`tags add` 不会自动创建标签。
- CLI 添加的标签立即生效，关联来源记为 `agent`，并保存可选的 `--reason` 与 `--confidence`。
  加 `--review` 时改为写入 AI 标签审核队列，由桌面端逐条接受或跳过。
- `tags add` 涉及多个技能时需要 `--yes`；`tags remove` 始终需要 `--yes`。
- 名称已存在时，`tags create` 原样返回已有标签。

## 说明

说明保存为技能的解释，显示在桌面端 AI 解释的位置：

```powershell
skillport-cli --lang zh notes get <uid>
skillport-cli --lang zh notes set <uid> --file ./note.md --author claude-code --dry-run
skillport-cli --lang zh notes set <uid> --text "整理 changelog 条目。" --yes
```

- `--lang en|zh` 决定读写哪种语言的解释。
- `--text` 与 `--file` 二选一。内容必须是非空 UTF-8 文本，最大 64 KiB。
- 说明的 model 记为 `agent:<author>`。`--author` 接受 1–64 个 ASCII 字母、数字、`-`、`_`
  或 `.`，默认 `cli`。
- 覆盖已有解释时需要 `--yes`。之后用户在桌面端刷新 Agent 写入的说明对应的 AI 解释时，
  桌面端会先确认再覆盖。

## 写操作确认

除 `skills install` 外，所有写命令都支持 `--dry-run`。dry run 只返回计划，不做任何修改：

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[],"result":null},"warnings":[]}
```

命令需要确认但缺少 `--yes` 时，以 `input.confirmation_required`（退出码 `2`）失败，并在
`error.details.plans` 中附上同一份计划。把计划展示给用户确认后，加 `--yes` 重新执行。写入成功
返回 `{"dryRun":false,"plans":[...],"result":{...}}`。`skills sync`、`projects add` 和
`tags create` 没有 `--yes` 选项。

## JSON 与退出码

自动化脚本使用 `--json`：

```powershell
$result = skillport-cli --json skills list | ConvertFrom-Json
if (-not $result.ok) { exit 1 }
```

成功命令把 JSON 写到 stdout：

```json
{"schemaVersion":1,"ok":true,"data":{},"warnings":[]}
```

错误把 JSON 写到 stderr：

```json
{"schemaVersion":1,"ok":false,"error":{"code":"skill.not_found","message":"...","details":{}}}
```

脚本应根据 `ok`、`error.code` 和进程退出码分支。面向人的 `message` 文案不是稳定的
机器契约。

| 退出码 | 含义 | 代表性 code |
| --- | --- | --- |
| `0` | 成功 | 无 |
| `1` | 内部 service 或数据库失败 | `internal.error` |
| `2` | 输入或路径无效，或需要确认 | `input.invalid`、`path.invalid`、`input.confirmation_required` |
| `3` | 实体缺失、有歧义或重复 | `skill.not_found`、`skill.ambiguous`、`skill.duplicate`、`agent.not_found`、`project.not_found`、`project.ambiguous`、`tag.not_found`、`tag_group.not_found`、`tag_group.ambiguous`、`archive.fingerprint_mismatch` |
| `4` | 另一个进程持有 Central mutation lock | `mutation.busy` |
| `5` | 批处理完成但有部分失败 | 含失败项的 success envelope |

## 在 Agent 中使用

仓库提供一份指导 skill：
[`skills/skillport/SKILL.md`](https://github.com/bahayonghang/skillsport/tree/main/skills/skillport)。
它教编码 Agent（Claude Code、Codex 等）在任意项目中安全地使用 `skillport-cli`：先检查 CLI
是否可用，所有调用都加 `--json`，用 `uid` 引用技能，每次写操作前先 `--dry-run` 并取得用户
确认，处理退出码 `4` 和 `5`，优先复用已有标签，并把第三方 `SKILL.md` 内容只当数据处理。

用 SkillPort 自身安装这份指导 skill：

```powershell
skillport-cli skills import --from-dir skills/skillport --dry-run
skillport-cli skills import --from-dir skills/skillport
skillport-cli skills sync skillport --agent claude-code --dry-run
skillport-cli skills sync skillport --agent claude-code
```

需要加载它的每个 Agent 都执行一次 sync。Agent 运行时仍需要 `PATH` 上有 `skillport-cli`；
找不到时，skill 会让 Agent 请你运行 `npm run install:cli`，而不是自行安装。

## 与桌面端协作

桌面端和 CLI 可以同时运行。所有 mutation 共享 Central mutation lock；发生并发写入时，
CLI 会安全地以 code `4` 失败，而不是并发修改中央库。等待另一个操作结束后重试即可。

CLI mutation 不会向已经打开的桌面窗口推送实时事件。窗口重新获得焦点时会检查本机数据
是否变化，并重新加载受影响的视图。

## 当前限制

- 只支持 Local target，没有 SSH 或 WSL CLI 命令。
- 本地导入必须显式使用 `--from-dir` 或 `--from-zip`；`skills install` 不会把路径当作来源。
- CLI 不能删除中央技能，也不能修改 `SKILL.md`。
- 桌面安装器不会自动修改 `PATH`。
