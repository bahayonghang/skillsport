# 父任务设计与集成契约

## 任务树

| 子任务 | 拥有内容 | 与用户需求对应 |
| --- | --- | --- |
| 10-12-skill-usage-visual-polish | 概要布局、控件/排版、热力图几何与日期标签、视觉验证 | R1/R2/R3 |
| 10-12-skill-usage-performance | 基线、入口/读快照、阈值与匹配算法、Local增量发布、热点驱动读取/DOM优化 | R4 |

父任务拥有原始需求、两份研究、用户截图、跨任务验收和最终集成。两个子任务各有 PRD/design/implement/上下文，可独立检查。按视觉→性能顺序执行；任务树只表示归属，顺序在各实施文档显式记录。

## 共用边界

视觉方向、修复契约与截图根因见 research/ui-analysis.md；扫描复杂度、provider差异和迁移前置见 research/performance-analysis.md。当前主题/用户字体/根字号、完整历史、匹配三态、16周/20次、target/source隔离、错误缓存与解绑流程是集成不变量。

ActivityHeatmap 是共享风险文件：视觉拥有固定格子、月份跨度、图例和 wrapper；性能只改变阈值预计算。SkillUsageTable 先改样式，性能如需有界 DOM 在保持所有数据可达与几何契约下进行。禁止两子任务并行修改这些文件。

## 技术顺序与取舍

先让容器与数据形状匹配，避免靠连续拉伸/装饰填空白。再建立当前性能基线和正确性 fixture，以最小算法优化与 usage single-flight/coherent read 修复减少重复工作。Local delta 需要新 provenance 和共同事务，不能只在现有 best-effort file cache 上跳过事实重建。

Remote全量回退、长文件整文件解析可先保留；append-byte、OpenCode watermark、新索引/聚合缓存和有界 DOM 经过 profile 门再实施。父任务不承诺尚未测得的绝对速度，不扩大到 provider新增/整应用换肤/发布。

## 风险与兼容

固定热力图曾用于修复最大化反馈，空间优化不能复发。完整排名可能增加现有50条刷新包的IPC，应拿完整等价数据比较。delta改变可重建缓存的权威性，失败原子发布/旧库rebuild/provider winner是硬前置。新增schema必须走append-only migration；命令/协议与生成文档同步，路径/凭据不进日志或UI。

本轮仅创建任务与研究，没有产品改动/迁移/扫描。运行时视觉与性能证据在实施阶段取得。当前仓库CI基线结果独立记于 research/planning-verification.md，不用于声称未来优化已通过。

## 回退

视觉可独立回退无数据影响。性能保留full-rebuild oracle/fallback，新增派生表可重建，代码回退需容忍它们存在。父任务最终对照同fixture验证视觉/速度/数据三项同时成立后再关闭。
