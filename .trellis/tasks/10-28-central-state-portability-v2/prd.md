# 重构 Central 状态导入导出（便携包 v2）

## 背景

当前 "Import / export Central state" 对话框导出的 `skillport/state-export` v1 JSON，在另一台机器或另一个目标上
**基本无法导入**。深入排查（见 [`research/root-cause-analysis.md`](research/root-cause-analysis.md)）得到的结论：

1. **主因（已用本机数据证实）**：v1 只导出 GitHub 来源指针，不带 skill 内容。SSH 目标上 103 个 Central skill
   全部没有 GitHub 来源归属，导出时被整体放进 `unrestorableSkills`，另一端预览 0 个可导入项。
   operation log 中从未出现过 `import_skillport_state`，用户最后只能逐个仓库手工导入。
2. 导入完全依赖 GitHub：预览阶段为每个仓库下载完整归档，导入阶段再拉一遍。未认证的 API 配额和国内网络都会让它失败，
   而仓库不可达时预览仍显示为 `ready`。
3. 跨安装的身份/冲突语义有误：`uid` 每个安装随机生成，导致误报冲突；目标端已存在的非 Central skill 无法覆盖。
4. 存在正确性缺陷（以 `sourcePath` 为键导致不同仓库的同路径 skill 串标签）、错误不可诊断（UTF-16/BOM/超限都变成
   `internal.unexpected`）、1 MiB 上限、打开对话框即全量导出等性能与交互问题。

## 已确认的决策（2026-10-28，用户）

| 决策 | 结论 |
| --- | --- |
| 包格式 | zip 便携包（`.skillport`）：manifest v2 + 每个 skill 的完整文件内容；GitHub 来源仅作为元数据保留 |
| 迁移范围 | skill 内容 + 标签 + GitHub 来源归属，另加 **标签分组/保存视图** 和 **来源注册表（skill_registries）** |
| v1 兼容 | **放弃 v1**：不再导入 `skillport/state-export` v1 JSON；识别到 v1 时给出明确的"请在源端升级后重新导出"提示 |
| 冲突默认 | 按内容摘要比较：内容相同自动跳过；内容不同标为冲突，必须确认，提供批量"全部覆盖/全部跳过"，覆盖前自动备份 |

## 目标

- 任意 SkillPort 安装或目标（Local / SSH / WSL）导出的便携包，在另一安装或目标上**离线**即可完整恢复，不依赖 GitHub 网络或 PAT。
- 导入导出过程可预期、可诊断、可取消，大库也不卡顿。
- 重做对话框交互：去掉"巨型 JSON 文本框"模式，改为"选文件 → 预览 → 决策 → 执行 → 结果"的清晰流程。

## 需求

### R1 导出

- R1.1 导出当前活动目标的全部 Central skill，**包括没有 GitHub 来源归属的 skill**；每个 skill 带完整文件树与内容摘要。
- R1.2 同时导出：标签（含颜色、描述、所属分组）、标签分组、保存视图、来源注册表（含启用状态）、skill↔标签关系、
  skill 的 GitHub 来源归属（owner/repo/branch/sourcePath，以及已知的 commit SHA）。
- R1.3 支持从 SSH / WSL 目标导出：从远端读取 skill 文件内容写入本地包。
- R1.4 导出由后端直接写入用户选择的路径（原子写），渲染进程不经手清单 JSON 或文件内容。
- R1.5 打开对话框只取导出摘要（数量、体积估算、来源分布），不触发全量导出。
- R1.6 导出包不得包含凭据（PAT、API key）、绝对用户目录路径、主机名或 SSH 连接细节。

### R2 导入预览

- R2.1 选择 `.skillport`（也接受 `.zip`）文件后，后端完成：安全解包检查（路径穿越、符号链接、zip bomb、超限）、
  manifest 结构校验、每个文件的完整性校验，然后与目标端现有状态比对。**全过程零网络请求。**
- R2.2 每个 skill 归类为：`new`、`identical`（内容相同，默认跳过）、`changed`（内容不同，冲突待确认）、
  `exists_unmanaged`（目标端有同名非 Central skill，冲突待确认）、`invalid`（包内数据损坏，不可导入）。
- R2.3 元数据（标签/分组/视图/注册表）按自然键给出 新增 / 已存在 / 将更新 的统计。
- R2.4 预览返回不透明的 `previewToken`；执行导入只提交 token + 决策，后端在执行前重新校验文件指纹，文件被改动则拒绝执行。
- R2.5 选到 v1 JSON、非 zip、编码异常（UTF-16/BOM）、结构不符、版本过新等情况，都返回**带具体原因**的错误码
  （例如字段路径、行列号），并给出本地化提示，不再出现笼统的 "The operation failed"。

### R3 导入执行

- R3.1 冲突决策：逐条 `skip` / `overwrite` / `rename`，并支持批量"全部覆盖/全部跳过"；`identical` 默认跳过，可以改为覆盖。
- R3.2 每个 skill 的写入：先暂存，覆盖前备份，再原子替换；失败时回滚，不留下半成品；遵守 Central mutation lock 和
  `ensure_centralized` 路径；保持目标端的 `uid` 语义（覆盖时保留原 uid，新建时在本地生成，**不导入源端 uid**）。
- R3.3 导入后恢复 GitHub 来源归属，使更新中心可继续追踪；没有归属的 skill 标为未知来源，不得误判为远端缺失。
- R3.4 标签、标签分组、保存视图、注册表按自然键幂等合并（重复导入同一个包不会产生重复数据）。
- R3.5 支持导入到 SSH / WSL 目标（经由现有的远程传输能力上传文件）。
- R3.6 支持取消：已完成的 skill 保留，未开始的标为跳过，当前进行中的回滚。
- R3.7 结果按 skill 给出明细（成功 / 跳过 / 失败及原因），并可以"仅重试失败项"。

### R4 可观测性与安全

- R4.1 导出、预览、执行都写入 operation log（预览失败也要记），日志与错误中不出现绝对路径或凭据。
- R4.2 新增的错误码登记进 reviewed IPC 错误码表，并提供 en / zh 文案。

### R5 移除 v1

- R5.1 删除 v1 的 IPC 命令、服务代码、前端对话框中的 JSON 粘贴/美化模式及相关类型与测试；更新生成的架构文档。
- R5.2 README / README_CN 中有关导入导出的描述与新行为保持一致。

## 非目标

- 不迁移：AI 提供方配置与密钥、设置项、使用统计、操作日志、平台安装链接、项目（projects）、collections。
- 不做云同步或增量/双向同步；本任务只覆盖一次性的文件式迁移。
- 不支持导入 v1 JSON。
- 不实现包加密或签名（包内无凭据；以后可在 manifest 中预留扩展字段）。

## 验收标准

- [ ] AC1 用本机 SSH 目标（103 个无来源归属的 skill）导出的包，在 Local 目标上预览显示 103 个 `new`（或按实际状态归类），
      在**断网**条件下导入成功，文件内容与源端逐字节一致（摘要一致）。
- [ ] AC2 Local → SSH 反向同样成立；重复导入同一个包时全部判为 `identical` 并跳过，数据库无重复的标签/分组/视图/注册表。
- [ ] AC3 样例规模（≥ 180 个 skill，23 个仓库，6 个仓库共享根路径 `SKILL.md`）的标签与来源归属恢复到正确的 skill。
- [ ] AC4 有 GitHub 来源归属的 skill 导入后，更新中心可以检查更新，结果不是 "unknown/remote missing"。
- [ ] AC5 各类错误（v1 JSON、UTF-16、BOM、损坏的 zip、路径穿越条目、完整性不符、超限、预览后文件被改动）均返回专用错误码与本地化提示，
      Rust 与 Vitest 中都有覆盖。
- [ ] AC6 打开对话框不触发全量导出；对 1000 个 skill 的库，取导出摘要 < 500 ms；200 个 skill（约 50 MB）的本地导出与导入预览各 < 10 s。
- [ ] AC7 导入执行中途取消：已完成的保留、进行中的回滚、Central 目录中无残留暂存目录。
- [ ] AC8 导出包和所有日志/错误中都不含 PAT、绝对用户路径或主机信息（由测试断言）。
- [ ] AC9 v1 代码与 UI 已移除，`pnpm docs:gen` 产物已更新，`just ci` 通过；Windows x64 安装包手工冒烟（导出 → 导入）通过。

## 子任务划分

| 子任务 | 交付物 | 依赖 |
| --- | --- | --- |
| `portable-bundle-core` | v2 格式、包读写器、导出摘要与导出命令（Local + 远程读取）、错误枚举 | — |
| `portable-bundle-import` | 预览分类、预览 token 缓存、导入执行管线（Local + 远程）、元数据合并、取消/回滚、导入命令 | core |
| `portable-bundle-ui` | 新的前端 store slice 与对话框、i18n、README、移除 v1 命令/服务/UI、生成文档 | core、import |

父任务负责跨子任务验收（AC1–AC9）与最终集成评审。
