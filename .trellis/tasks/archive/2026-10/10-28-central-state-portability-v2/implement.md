# Implement — 父任务集成计划

父任务本身不承载代码改动；按顺序启动子任务，每个子任务完成并通过 `just ci` 后再进入下一个。

## 执行顺序

1. [ ] `10-28-portable-bundle-core` —— 格式、读写器、导出摘要与导出命令（新增命令，与旧命令并存）
2. [ ] `10-28-portable-bundle-import` —— 预览、token 缓存、执行管线、元数据合并（新增命令，与旧命令并存）
3. [ ] `10-28-portable-bundle-ui` —— 新的 store/对话框、i18n、README，删除 v1 命令/服务/UI，`pnpm docs:gen`

## 集成验收（全部子任务完成后，由父任务执行）

- [ ] `just ci`
- [ ] AC1：本机 SSH 目标（103 个无来源归属的 skill）→ 导出 `.skillport` → 切到 Local → 断网 → 预览 → 导入 → 对比摘要
- [ ] AC2：Local → SSH 反向；同一个包再导入一次，全部为 identical，DB 无重复数据（用 sqlite 只读查询核对）
- [ ] AC3：用 `src/test/support/fixtures/skillport-state-export.json` 的仓库分布构造的 v2 测试包（Rust 测试）
- [ ] AC4：导入后在更新中心对有来源归属的 skill 执行检查
- [ ] AC6：性能计时记录到本任务的 `research/perf.md`
- [ ] AC9：Windows x64 安装包构建（`docs/agents/build-and-test.md` 中的打包命令）+ 安装后手工冒烟
- [ ] 发布说明：注明 v1 JSON 不再支持

## 回滚点

- 每个子任务一个 squash 提交；UI 子任务的提交可以单独 revert，恢复到"新旧命令并存、旧 UI 可用"的状态。

## 评审关口

- core 完成后：评审 manifest 结构（第 2 节）与 `contentDigest` 往返测试，确认后再开始 import。
- import 完成后：评审 `CentralContentSource` 泛化对更新中心的影响（运行 central_updates 全部测试）。
