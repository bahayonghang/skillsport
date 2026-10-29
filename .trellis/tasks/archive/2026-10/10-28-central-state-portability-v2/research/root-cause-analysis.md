# 导入导出失败根因分析（2026-10-28）

调查范围：`src-tauri/src/services/portable_state/*`、`src-tauri/src/commands/portable_state.rs`、
`src-tauri/src/services/github_import/{source,import,archive,tree_import}.rs`、
`src/components/central/CentralStatePortabilityDialog.tsx`、
`src/stores/centralSkillsStore.updateSlice.ts`、本机 `~/.skillsmanage` 运行数据。

## 1. 现场证据

### 1.1 操作日志（`~/.skillsmanage/db.sqlite` → `operation_logs`）

| 时间 (UTC) | target | action | 结果 |
| --- | --- | --- | --- |
| 2026-10-20 07:48:16 | ssh | export_skillport_state | succeeded, `affectedCount=0` |
| 2026-10-20 07:48:27 | local | save_skillport_state_export | succeeded |
| 2026-10-20 07:48–07:49 | local | export_skillport_state ×2 | `affectedCount=0` |
| 2026-10-20 07:54 → 10-27 | local | import_github_repo_skills ×N | 用户改为逐仓库手工导入 |
| 2026-10-29 02:05 | local | export_skillport_state | `affectedCount=47` |

日志中**从未出现过 `import_skillport_state`**：用户每次都停在预览阶段，没有可导入项，随后绕道逐个仓库导入。
（`preview_*` 命令是 `runtime_only(Preview)`，失败不会进 operation log，这本身也是诊断缺口。）

### 1.2 目标库来源数据

| 数据库 | Central skills | 有 GitHub 来源归属的 Central skills |
| --- | --- | --- |
| `targets/ssh-713ba355…/db.sqlite` | **103** | **0**（仅 1 个 `local/is_unknown` 仓库） |
| `db.sqlite`（本机） | 47 | 47 |

结论：SSH 目标上的 103 个 skill 没有 `skill_repository_members` 的 GitHub 归属，v1 导出把它们全部放进
`unrestorableSkills`（只有 id/name/reason），`centralSkills` 为空 → 另一端导入预览 0 个可导入项。

## 2. 根因清单

### RC1（主因，已证实）：v1 格式是"重新下载配方"，不是备份

- `export.rs::exportable_skill_source` 只导出带 GitHub 归属的 skill；其余全部降级为 `unrestorableSkills`。
- 清单不含 skill 文件内容、不含 commit SHA / 内容摘要，导入端只能凭 `owner/repo/branch/sourcePath` 重新拉 GitHub 最新版本。
- 通过扫描、手工复制、CLI、旧版本安装进 Central 的 skill，以及远程目标（SSH/WSL）上的 skill，普遍没有归属 → 必然丢失。
- 导出未知分支时硬编码回退 `"main"`（`export.rs`），对 `master` 仓库导入时会失败。

### RC2：导入强依赖 GitHub 网络与匿名配额

- 预览：`build_remote_catalog` 对每个仓库调用 `resolve_repo_source`（`GET /repos/{owner}/{repo}`，即便分支已知）
  并 `download_repo_snapshot` **下载完整归档**（上限 128 MiB），仅为校验路径是否存在。
- 导入：每组再次 `resolve_repo_source` + commit SHA + tree API + raw 文件；预览结果不复用。
- 以样例 `src/test/support/fixtures/skillport-state-export.json`（23 仓库 / 183 skills）估算：预览 + 导入约 90+ 次 API 调用，
  超过未认证 60 次/小时配额；在国内网络下归档下载经常超时。
- 仓库预览失败被降级为 warning 且 skill 仍标 `ready`（`preview.rs::remote_catalog_issue`），用户看到"可导入"，执行时整组失败。
- 导入组串行执行（`import.rs` for 循环），无并发、无断点续传。

### RC3：身份与冲突语义不适合跨安装迁移

- `uid` 在每个安装上随机生成（`db/schema/core.rs` `Uuid::new_v4()`），跨机器同名 skill 必然触发 `stable_uid_conflict`。
- 目标端已存在的非 Central skill（平台目录扫描到的）被判 `unrestorable / non_central_conflict`，无任何覆盖选项。
- 冲突默认 `skip`，大批量迁移时用户需逐条改选，且无"全部覆盖/全部跳过"。

### RC4：正确性缺陷

- `import.rs::import_skillport_state_for_target` 中 `skill_by_source_path` 只以 `sourcePath` 为键；
  样例中 6 个仓库共享根路径 `SKILL.md` → 标签恢复到错误的 skill、失败项归属错误。
- `resolution_key` / `SkillManifestKey` 仅含 `id + sourcePath`，不含仓库身份，跨仓库同路径同 id 会串。
- `build_import_groups` 中 `!resolution_map.contains_key(&skill.id)` 永远为真（键是 `id\u1fpath`），是死逻辑。
- 远程目标（SSH/WSL）导入走 `import_github_repo_skills_remote_with_auth`，整组成功或整组失败，无部分结果。

### RC5：错误不可诊断

- `preview_skillport_state_import_file` 用 `error.to_string()` 走 legacy 边界：非 UTF-8（如 PowerShell 5 `>` 产生的 UTF-16）、
  超预算、非普通文件 → 全部变成 `internal.unexpected` "The operation failed"。
- 有 UTF-8 BOM 的文件：`String::from_utf8` 通过，但 `serde_json` 在第 1 行第 1 列失败 → 报"不是有效 JSON"。
- serde 结构错误（缺字段、类型不符）同样只报"不是有效 JSON"，不给字段路径/行列。
- 预览失败不记 operation log。

### RC6：容量上限

- 读写都套用 `ResourceBudget::default_skill().file_bytes = 1 MiB`；写入也用 `reject_file_read_size`，
  大库（上千 skill、长描述）导出后无法保存，也无法导入。

### RC7：性能与交互

- 对话框每次打开都自动执行一次完整导出，运行期间禁用 Tab 切换，进入导入要先等导出结束。
- 导出 JSON 在前端整串 `JSON.parse` + `stringify` 美化并渲染到单个 `<pre>`/`Textarea`，大清单卡顿。
- 粘贴 JSON 预览后若再编辑文本，导入会用新文本 + 旧预览的 resolutions，二者不一致。
- 预览与导入是两次独立的全量计算，导入不复用预览的远端结果。
- 进度事件与 `invoke` 返回无终态保护：`mergePortabilityProgress` 可能被迟到的 running 事件回写为 running，进而让下一次操作被 `job.portability_busy` 拒绝（低概率竞态）。

## 3. 可复用的现有能力

- `github_import` 的 tree fast-path、snapshot/digest、`pinned_repo_ref`、preview ticket 机制。
- `ExclusiveJobRegistry` 作业租约与取消。
- `fs_util::run_blocking_fs_with`、`tempfile` 原子写、`ResourceBudget`。
- Central 写入路径：`ensure_centralized`、Central mutation lock、`uid` 语义（AGENTS.md 约束）。
- 本地归档导入：`LocalArchiveImportWizard.tsx` / 后端 local archive 导入（可作为 bundle 解包的复用点，需进一步核查）。
- 样例清单：`src/test/support/fixtures/skillport-state-export.json`。
