# 合并 Antigravity 与 Antigravity CLI 并统一收敛到 `~/.gemini/config/skills`

## Goal

将 SkillPort 中的 `Antigravity`（`~/.gemini/antigravity/skills/`）与 `Antigravity CLI`（`~/.gemini/antigravity-cli/skills/`）合并为单一内置平台 `Antigravity`（id `antigravity`），并将全局技能目录统一收敛到三端（Antigravity App / IDE / CLI `agy`）共读的 `~/.gemini/config/skills/`；同时对本机执行一次性的旧目录链接清理，并将原安装在这两个旧目录中的 Central 技能重新安装到 `~/.gemini/config/skills/`。

## Background & Confirmed Facts

完整代码锚点与本机只读核查明细见 `research/codebase-and-local-audit.md`。以下仅列构成决策与需求边界的已证实事实：

1. **三端目录结构**：Antigravity App（2.0 桌面端）、Antigravity IDE 与 Antigravity CLI（`agy`）统一共读 `~/.gemini/config/skills/`、`~/.gemini/config/skills.json` 与 `~/.gemini/config/plugins/`；`~/.gemini/antigravity/skills/`（仅 IDE）与 `~/.gemini/antigravity-cli/skills/`（仅 CLI）属于已分离的旧路径；三端默认均不读取 `~/.agents/skills/`。
2. **代码耦合范围**：
   - 后端内置平台定义与远端 POSIX 映射位于 `src-tauri/src/db/seed/agents.rs:5-13,20-56,349-369`，Project Universal 列表与代表偏好序位于 `src-tauri/src/db/types.rs:64-113`，Skills CLI 映射闭合表位于 `src-tauri/src/services/skills_cli/agent_map.rs:29-30`；Usage Provider（`src-tauri/src/services/usage/providers/antigravity.rs`）已仅存在单一 `"antigravity"` stub。
   - `seed_builtin_agents`（`src-tauri/src/db/seed.rs:51-138`）虽会更新已有内置平台路径并删除 `agents` 中已移除的内置行，但不会自动合并 `is_enabled` 状态，也不会清理/去重无外键关联的 `skill_installations`、`agent_skill_observations`、`project_skill_installations` 与 `skill_update_inventory_entries`。
   - 前端平台唯一登记点位于 `src/lib/platformRegistry.ts:18-66`，浏览器演示路径策略位于 `src/lib/platformPathPolicy.ts:21-28`，图标特判位于 `src/components/platform/PlatformIcon.tsx:96-109`，演示 fixtures 位于 `src/fixtures/platform.ts:40-57,120-121`。
3. **本机现状（只读核查）**：
   - `~/.gemini/antigravity/skills/` 含 16 个指向 `~/.skillsmanage/skills/<id>` 的软链；`~/.gemini/antigravity-cli/skills/` 含同 16 个 Central 软链以及 `ego-browser`、`tabbit` 2 个外部 Junction；两者的父目录中还存放运行期数据（如 `brain/`）。
   - `~/.gemini/config/skills/` 已存在 4 个条目：本地原生目录 `chinese-novelist`、`client-maintenance`（未在 Central 中）以及与旧 CLI 目录指向一致的 `ego-browser`、`tabbit` 两个 Junction；`~/.gemini/config/skills.json` 不存在。
   - 本机 `~/.skillsmanage/db.sqlite`（已应用至 v8）及远端 SSH 缓存库 `~/.skillsmanage/targets/<ssh-target-id>/db.sqlite` 均包含 `antigravity-cli` 安装记录，且本机 `project_skill_installations` 对同一项目同一技能同时存在 `antigravity` 与 `antigravity-cli` 两行。

## Key Decisions

1. **升级策略（Q1 已确认）**：应用代码仅做平台合并、路径收敛与版本化 SQLite 数据迁移，不在应用内实现面向所有老用户的「旧目录磁盘文件自动检测/迁移向导」；本机旧目录清理与重装在备份后作为本次任务的一次性本地收尾动作执行。
2. **统一目录模式（Q2 已确认）**：不创建 `~/.gemini/config/skills.json`，不挂载 `~/.agents/skills/`；让 `~/.gemini/config/skills/` 作为 Antigravity 唯一全局目录，将原 16 个 Central 技能链接安装到该目录，并原样保留其中已有的 4 个条目（`chinese-novelist`、`client-maintenance`、`ego-browser`、`tabbit`）。
3. **非破坏性清理原则**：仅移除 `~/.gemini/antigravity/skills/` 与 `~/.gemini/antigravity-cli/skills/` 内的旧链接条目本身（校验为重解析点后非递归删除），绝不删除 `~/.gemini/antigravity/`、`~/.gemini/antigravity-cli/` 父目录及任何外部目标目录内容。

## Requirements

- **R1（平台合并与路径收敛）**：
  - `src-tauri/src/db/seed/agents.rs`、`src-tauri/src/db/types.rs` 与 `src-tauri/src/services/skills_cli/agent_map.rs` 合并为单一内置平台 `antigravity`（展示名 `Antigravity`，图标 `antigravity`），移除 `antigravity-cli`。
  - `antigravity.global_skills_dir` 统一设为 `~/.gemini/config/skills`（含 `builtin_agents_for_posix_home` 映射为 `<home>/.gemini/config/skills`），`project_skills_dir` 保持 `.agents/skills`（仍属 `UNIVERSAL_PROJECT_AGENT_IDS` 与 `UNIVERSAL_PROJECT_REPRESENTATIVE_AGENT_IDS`）。
  - `DEFAULT_ENABLED_PLATFORM_IDS` 与 `SKILLS_CLI_AGENT_MAP` 移除 `antigravity-cli`，保持测试闭合不变量。
- **R2（版本化 SQLite 迁移与兼容性）**：
  - 新增不可变版本化 SQLite 迁移 `v9`（本地库与远端目标缓存库均自动在迁移前生成 `VACUUM INTO` 备份）：合并 `agents.is_enabled`（若原 `antigravity-cli` 启用则合并后的 `antigravity` 保持启用）、清理 `antigravity-cli` 及旧 `~/.gemini/antigravity/skills` 路径在 `skill_installations` / `agent_skill_observations` / `skill_update_inventory_entries` 中的遗留记录、将 `project_skill_installations` 中的 `antigravity-cli` 行并入 `antigravity`（冲突主键去重后重映射）并删除 `agents` 中 `antigravity-cli` 内置行。
  - 在 `seed_builtin_agents` 删除已退役内置行时补强同类遗留关联清理（纵深防御）。
- **R3（前端、单测与文档同步）**：
  - 更新 `src/lib/platformRegistry.ts`、`src/lib/platformPathPolicy.ts`、`src/components/platform/PlatformIcon.tsx` 与 `src/fixtures/platform.ts`，使 UI 仅展示单一 `Antigravity`（路径 `~/.gemini/config/skills/`），保持 `installPreference` 连续唯一且全局仍处于独立目标。
  - 更新全部受影响 Rust 测试与 Vitest 测试，同步更新 `README.md`、`README_CN.md`、`CONTEXT.md` 及 `docs/**` 中英文平台路径说明（历史设计/调研文档补记日期更新说明而非改写历史事实）。
- **R4（本机旧目录清理与新目录安装）**：
  - 在桌面客户端未锁定数据库前提下，先对本机旧目录链接清单与 `~/.skillsmanage/db.sqlite` 做安全备份，校验后非递归移除 `~/.gemini/antigravity/skills/`（16 个）与 `~/.gemini/antigravity-cli/skills/`（18 个）内的旧技能重解析点，保留空 `skills/` 或父目录其余内容与所有外部目标目录完整。
  - 使用新编译的 `skillport-cli` 先 `--dry-run` 再将上述 16 个 Central 技能链接同步安装到 `~/.gemini/config/skills/`，保留其中原有的 4 个条目，并以只读校验确认目录与数据库状态一致。

## Acceptance Criteria

- [ ] **AC1**：后端 `builtin_agents()` 与 `builtin_agents_for_posix_home("/home/alice")` 仅包含 `antigravity`（全局路径分别为 `~/.gemini/config/skills` 与 `/home/alice/.gemini/config/skills`，项目路径 `.agents/skills`），不再包含 `antigravity-cli`；`SKILLS_CLI_AGENT_MAP` 闭合校验通过。
- [ ] **AC2**：SQLite `v9` 迁移与锁定的 SHA-256 校验通过；自动化测试覆盖「仅原 `antigravity-cli` 启用时合并保留启用」「`project_skill_installations` 主键冲突去重并入」「旧安装与观察记录清理」「远端目标库升级」及未来版本预检夹具（v10）。
- [ ] **AC3**：前端平台管理页、安装对话框、项目视图及图标组件仅渲染单一 `Antigravity`（路径 `~/.gemini/config/skills/`），移除 `antigravity-cli` 终端角标特判与 fixture，所有相关 Vitest 用例通过。
- [ ] **AC4**：`README.md`、`README_CN.md`、`CONTEXT.md` 与 `docs/**`（EN/ZH）文档同步完成；`pnpm docs:gen:check`、`pnpm docs:build` 与全量 `just ci`（含 `cargo test --locked`、`clippy`、`typecheck`、`lint`、`trellis-python`）全部通过。
- [ ] **AC5**：本机 `~/.gemini/antigravity/skills/` 与 `~/.gemini/antigravity-cli/skills/` 内旧链接条目数均为 0，父目录运行数据与外部目标目录（`~/.skillsmanage/skills/*`、`~/.local/share/ego/ego-skills`、`%LOCALAPPDATA%/Tabbit/LocalAgent/skills/tabbit`）完好无损。
- [ ] **AC6**：本机 `~/.gemini/config/skills/` 包含原有 4 个条目与新安装的 16 个 Central 软链（共 20 个），不存在 `~/.gemini/config/skills.json`，`~/.gemini/skills/` 未被改动；只读查询 `~/.skillsmanage/db.sqlite` 确认已升至 `v9`、`antigravity-cli` 残留为 0、`skill_installations` 与 `project_skill_installations` 均正确归属 `antigravity`。

## Out of Scope

- 不在 SkillPort 应用内实现面向所有老用户的「旧 Antigravity 目录磁盘文件自动检测/迁移向导」。
- 保留 `Gemini CLI (legacy)`（`~/.gemini/skills/`）不合并、不清理。
- 不管理 Antigravity plugin bundle（`~/.gemini/config/plugins/`），不创建或修改 `~/.gemini/config/skills.json`。
- 不改动任何远端 SSH 主机上的磁盘技能目录（仅确保远端缓存 DB 的 `v9` 迁移在打开时平滑通过）。
