# 扫描与统计性能设计

## 边界和数据流

```text
typed usage store，冻结 target/source 与请求序列
    ↓
command，参数与可脱敏观测
    ↓
usage service，target scan single-flight / coherent page read
    ↓
provider 收集 candidate + changed/vanished file observation
    ↓
provider 专属归属/去重组协调 + identity metadata
    ↓
repository，一个事务发布 cache/provenance/facts/health/metadata/scan_state
    ↓
同 generation 的 page 快照 → store 一次提交 → 渲染
```

组件不直接 invoke。复用 request-scoped TargetContext、blocking FS、保守 Central 匹配与既有 IPC seam。扫描 lease 属于 usage，不使用 Central mutation lock 串行化日志读取；凡涉及 Central 库存变化继续遵循现有共享边界。

## A. 基线与入口正确性

先新增可注入 root/provider 的离线合成基准，不运行真实 HOME ignored benchmark。使用同数据 file WAL 生产近似库并保留 memory 数据单独对照。>50 技能、scan race 和读提交 barrier 先形成确定性正确性用例。

统一初载/force/source/background 的 ranking limit 语义为页面所需全集。不能把当前 50 条刷新包和未来全量包直接做速度比较；baseline 和 after 必须比较完整等价数据。

所有 scan 入口复用 target keyed single-flight，覆盖 cold、force、后台和 remote。force 的含义仍是绕过 TTL 并等待日志检查/发布；碰到同 target 在途扫描时等待该周期，禁止第二 writer。已在途周期的完成边界与 force 语义在测试中固定。退出/错误使用 RAII 清理，跨 target 可并行；不承诺已启动 spawn_blocking 可以立即取消。

## B. 一致 page read 与 IPC

在 service/repository 用一个只读事务构建 overview、recent、provider/freshness，同步所有 SQL 使用该连接。一个事务内的独立 SELECT 可以看到同一 WAL 快照；多个 pool SELECT 或两个独立 IPC 不具备同一快照保证。

推荐新增或复用一个带显式 source 的 coherent page read IPC，供 source selection、filtered refresh 和 scan-completed 使用；现有 getters 保留兼容并委托单面板读。刷新包复用同一 page service，避免先算 unfiltered 再算 filtered。修改 frontend spec 原“overview/recent Promise.all”实现约束时，明确保留更强的一次提交与同 generation 不变量；同步 typed map、registry、codegen 和文档。

scan-completed 作为 invalidation 提示，不能把收到事件当成成功证据；静默重取完整 page 的 provider/freshness，仍以 target/source sequence 丢弃陈旧响应，失败不覆盖旧页或制造 toast/skeleton。Unused 仍是独立 slice，只在相关 facts/inventory/source 变化后重取，阈值 view-local 不改。

## C. 低风险算法

- 热力图：useMemo 中收集正数、排序一次、计算既有 q25/q50/q75/q90 和小样本 max；格子做 O(1) 阈值比较。D=112，M≤112；由 O(D+×M log M) 降到 O(M log M+D)。焦点变化不重算阈值，语言变化仅影响 formatter/labels。
- unique names：HashSet 收集 N 个名称，再排序 K 个，保持当前最终确定性顺序，降低复制和排序输入量。
- identity：候选规范化一次，构建 id/name→多候选索引；保持 exact id 优先、大小写/trim 语义与 ambiguous。禁止 HashMap 的单值覆盖把歧义消掉。
- Skill.md 估算仅在拥有可靠库存/内容失效依据时缓存；日志不变不表示 Central metadata 不变。日期聚合保留 Local/DST 契约，不能用 UTC SQL date 偷换语义。

## D. Local delta，安全发布先于跳过工作

当前事实只有自增 id 和五个业务字段，无文件/源事件身份。现有 cache JSON 保存每文件 calls，可作为候选输入，不能直接按 skill+timestamp 全局 UPSERT；同一文件重复调用必须保留次数。

增加最小派生 provenance/candidate 关系，关联 target/provider、受控文件身份、occurrence 与事实；真实路径不进入纯事实表。按 provider 保持既有结果：Claude 的跨文件 skill+timestamp 首胜组需要 winner 回退；Grok 以 affected session 协调 updates/chat 首胜；Codex/Droid 保留全部 occurrence。受影响组写入可以超过变化文件自身，但不得无理由重写整个 provider/target。

扫描分成 observation 与 publication。先只读 fingerprint metadata，只有变化/受影响组才加载 calls payload；不再在 collect_local_incremental 中提前 best-effort 更新 cache。发布一个事务覆盖 cache、provenance、facts、health、metadata、scan_state。缓存成为跳过事实处理的依据后，部分写入不能被当作成功；失败回滚或明确 full rebuild，不静默继续。

无变化 manifest（集合、顺序、指纹）路径允许 O(F) stat、扫描时间更新和必要 metadata 更新，fact writes=0。Claude 保留本轮 observed traversal order 首胜，顺序变化属于 delta，不冻结历史顺序或擅改路径排序。变化路径 O(F+BΔ+受影响候选组)，BΔ 是变化文件完整字节数。首次实现保留整文件安全解析；不能宣称 O(新增字节)。目录消失/confirmed empty 清除对应贡献，fatal 保留旧权威数据，provider failure 保持原来的分层政策。最小接口/迁移与测试 handoff 见父任务 research/delta-implementation-design.md。

Remote 和 OpenCode 等缺文件 delta seam 的路径先保留 full-rebuild；其正确性/跨 target 快照仍享受前述入口修复。OpenCode 不能修改用户数据库，不能忽略 WAL fingerprint。

## E. 查询与渲染，受测量门约束

基线分开测 KPI/ranking/heatmap/recent/unused、metadata fetch、JSON serialize 和 paint。仅实测热点才引入 source-specific SQL 分支、target/source/ts 复合索引或 metadata 精准 JOIN；每增加索引同时测写入成本。保存 EXPLAIN QUERY PLAN，不锁定完整计划字符串。

若聚合缓存必要，key 至少包含 target/source/fact generation/metadata generation/本地日期与时区；unused 另依赖 inventory/recovery。禁止只按 TTL 复用过期数据。跨午夜、时区/DST和 Central 修改是明确失效条件。

100/1k/10k 完整排行测量排序和 DOM。只有 trace 证明全量 DOM 是主成本才复用已有有界渲染模式；排序/过滤仍对全集，焦点回收、首末项、三档 font scale 可达。不得新增截断默默改变数据产品。

## 迁移、兼容和回退

- 使用新版本 migration，冻结的 v1/v5 与旧 schema checksum 输入不直接编辑；通过项目 versioned migration 机制更新生成结构描述。
- 旧库没有 provenance 时标记可重建并在首次明确刷新 full rebuild；migration 本身不读取真实日志、不猜 occurrence、不改 Central uid。
- 保留全量 oracle/fallback 到 delta 稳定验收。回退发布策略可重建派生表，不能删除原日志或破坏主库；回退代码需能容忍新增派生表。
- RefreshSummary.callsWritten 当前表示本次完整 calls 数，先保持兼容；actual fact writes 用独立测试/观测计数。若必须改变公共字段语义，显式更新协议、docs、fixtures 与所有消费者。
- typed IPC/命令变更执行 ipc codegen；命令/schema 变更执行 docs:gen 并包含产物；保持 docs:gen:check/docs:build 只读。

## 证据与限制

完整指标、fixture 与命令见父任务研究。同机对照，不混合 50 条与全量、memory 与 file WAL、fixture 与真实 provider。暖扫目标 p95 降低 ≥30%；cold与内存不退化 >10%，低于 50ms/噪声区以结构计数为主。不预设绝对毫秒 SLA，不把静态复杂度当作已测瓶颈。
