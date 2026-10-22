# Schema 文档追加迁移支持

## 实施范围

- `scripts/docs/build-schema-table.mjs`
- `src/test/scripts/schemaModel.test.ts`

未修改 Rust、冻结 migration/schema、IPC generator 或生成文档。主会话在 Rust 稳定后统一运行 `pnpm docs:gen`。

## 模型与来源

`buildSchemaModel({ sourceDir, rootDir, migrationFiles = [] })` 先按文件名顺序解析 schema，再按显式输入顺序应用迁移。`generateSchemaDocs` 复用这个模型；未提供迁移时只读取指定的 schema，不会将真实仓库迁移加载进临时 fixture。

真实 CLI 显式调用 `collectMigrationFiles()`，按数值版本读取 `migrations/versions/v3.rs` 起的 dedicated DDL。v1 的 schema 本体已经是基线；v2 使用动态临时表重建 FK，保持基线列/索引形状，不作为独立表文档来源。没有复制迁移 SQL，也没有执行数据库或新增依赖。

跨文件 `ALTER ADD COLUMN`/索引操作更新原表的最终模型。新表归在其 CREATE 所在源码模块；既有表的跨文件改动附上准确 `path:line`。支持实际追加迁移的普通 CREATE/INDEX、可选 IF 子句、部分索引 WHERE、DROP INDEX 与 DROP TABLE。DROP TABLE 同时移除索引及表引用，临时表不会留在最终输出。RENAME 等未支持的 ALTER 保持带源码定位的 fail-closed 行为，不扩展成通用 SQL parser。

## 已完成验证

- 修改前：`pnpm exec vitest run src/test/scripts/docsGeneration.test.ts -t 'schema table parser'`，7 passed；7 个非匹配测试 skipped。
- 修改后：`pnpm exec vitest run src/test/scripts/schemaModel.test.ts src/test/scripts/docsGeneration.test.ts -t 'schema model|schema table parser|schema table documentation generator'`，17 passed；7 个非匹配测试 skipped。包含 10 个新迁移用例、7 个原 schema parser 用例。
- `pnpm exec eslint src/test/scripts/schemaModel.test.ts --report-unused-disable-directives --max-warnings 0`，通过。
- `node --check scripts/docs/build-schema-table.mjs`，通过。
- `git diff --check -- scripts/docs/build-schema-table.mjs src/test/scripts/schemaModel.test.ts`，通过。
- 真实 schema 与当前 dedicated migration 的只读内存构建通过：13 个模块、36 张表。识别当前 v8 的 `skill_call_candidates`、`file_key`、`observed_order`、`local_provenance_version` 及两条索引，没有写入输出。此快照随 Rust v8 后续改动可能变化。

新夹具覆盖：追加列和索引、复合 PK、新表定位、默认 sourceDir 隔离、v8/v10 数值排序、排除 v1/v2/mod、DROP 后重建索引、部分索引条件、临时表删除后的索引复用、未知表/重复表/未支持 ALTER 的准确行号，以及成功/漂移 `check: true` 下源码和输出的字节、mtime 不变。重复生成的字节一致。

## 集成检查状态

`pnpm exec vitest run src/test/scripts/schemaModel.test.ts src/test/scripts/docsGeneration.test.ts src/test/contracts/docsWorkflowContract.test.ts`：26 passed / 3 failed，共 29 tests。

- Schema CLI `--check` 报 `data-model.md` 漂移，符合新模型尚未刷新生成物的阶段状态。
- IPC registry 等价测试报 `Malformed registry macro __skillport_runtime_commands`；IPC CLI 报 `malformed runtime command registry`。这是并行工作区的集成失败，不在本子任务的 IPC 文件权限范围；已向主会话报告。原匹配器依赖精确换行序列，需由主会话核查当前 registry 换行/宏形状。

完成 Rust/IPC 改动及 `pnpm docs:gen` 后，主会话重跑上述完整定向命令、`pnpm docs:gen:check`、`pnpm docs:build` 和全局质量门。建议主会话在 quality spec 的文档来源契约中明确加入 dedicated append-only migrations。本子任务没有运行 `just ci`，没有提交、推送或归档。

## 限制

本改动保持仓库已有列解析范围，只新增当前实际追加迁移需要的语法。以后若 dedicated migration 使用表重命名或动态重建，生成器会报未支持的 DDL，需按实际迁移增加明确支持，不能把临时表直接当产品表输出。
