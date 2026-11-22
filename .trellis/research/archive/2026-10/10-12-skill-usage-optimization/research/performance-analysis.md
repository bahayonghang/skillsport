# Research: Skill Usage 扫描、聚合与 IPC 性能链路

- Query: 深入分析使用统计页面的计算复杂度、扫描速度、缓存、数据库重写、IPC 和并发，形成可执行优化任务；本轮不实现。
- Scope: mixed；以当前仓库只读代码为主，SQLite/Tokio 官方文档用于设计边界校验。
- Date: 2026-10-12
- Evidence: 研究子代理只做当前代码静态核查，未运行真实 HOME 扫描、合成基准或 usage 测试。主会话的 just ci 结果另见 planning-verification.md。下文“确证”指代码路径存在，不代表已测得耗时瓶颈。“推断”需要实施阶段基准或并发测试验证。

## Findings

### 1. Files found

| 文件 | 作用 |
| --- | --- |
| `src-tauri/src/commands/usage.rs` | target 冻结、TTL、缓存页、后台重扫、刷新包和只读 getters |
| `src-tauri/src/services/usage/mod.rs` | provider 编排、全量 calls 合并、enrichment、页面数据构建 |
| `src-tauri/src/services/usage/incremental.rs` | Local 文件缓存载入与 best-effort diff 持久化 |
| `src-tauri/src/services/usage/file_cache.rs` | `(mtime_ms,size)` 指纹、缓存 JSON 解码、calls 克隆、消失文件检测 |
| `src-tauri/src/services/usage/providers/{claude_code,codex,droid,grok,opencode}.rs` | 五类真实来源的扫描、解析、缓存和去重差异 |
| `src-tauri/src/services/usage/providers/{antigravity,kiro,zed}.rs` | 明确 unavailable 的三个 stub，不是性能问题造成的空数据 |
| `src-tauri/src/services/usage/fs_backend.rs` | Local blocking FS 与 SSH/WSL 批读/目录探测 |
| `src-tauri/src/services/usage/enrichment.rs` | 保守 Central 身份匹配、Skill.md 静态体量估算 |
| `src-tauri/src/services/usage/aggregate.rs` | 日历日转换、112 格热力图；旧行级 KPI helper 不是当前 overview 主路径 |
| `src-tauri/src/services/usage/unused.rs` | unused 报告的库存、调用聚合、安装和恢复状态拼接 |
| `src-tauri/src/db/repos/usage_repo.rs` | 全 target 原子替换、SQL KPI/排名/detail/recent 查询 |
| `src-tauri/src/db/repos/usage_{file_cache,stats,unused}_repo.rs` | 文件缓存批写、平台统计和 unused 聚合 |
| `src-tauri/src/db/schema/usage.rs` | 原始事实/metadata/health/scan_state 与既有索引；冻结 migration 1 输入 |
| `src-tauri/src/db/migrations/versions/v5.rs` | 可重建文件缓存表；冻结 migration，不得直接修改 |
| `src-tauri/src/db/pool.rs` | 文件库 WAL 和 5 连接池；内存基准与生产池条件有差别 |
| `src-tauri/src/observability/operation.rs` | 命令计时和日志，不提供扫描互斥 |
| `src/stores/usageStore.ts` | refresh 去重、source/target 序列守卫、后台完成静默取数 |
| `src/components/usage/ActivityHeatmap.tsx` | 热度阈值当前逐格重复排序，视觉与算法实施需顺序协作 |
| `src-tauri/src/services/usage/{tests,bench}.rs` | 离线正确性 fixtures 与真实 HOME ignored benchmark |
| `src/test/stores/usageStore.test.ts` | target/source 竞态、缓存、后台完成、原子前端提交测试 |

### 2. 已有优化：不得重复建设或描述成尚未实现

- 5 分钟 TTL：`services/usage/mod.rs:231`、`:283`；`force=true` 跳过 TTL，但仍使用文件指纹缓存，**不等于重新解析所有文件**。
- Local 过期缓存立即返回并后台重扫：`commands/usage.rs:224`、`:303`。首次无 cache 和 force 仍阻塞等待扫描。
- provider futures 已通过 `join_all` 并发：`services/usage/mod.rs:300`、`:397`；真实 provider 的 Local 遍历/解析已放入统一 blocking FS wrapper，例 `providers/codex.rs:88`。不要给每个文件新增一个 blocking task。
- Local JSONL 已按文件处理：`providers/codex.rs:140`、`claude_code.rs:179`、`droid.rs:101`、`grok.rs:145`；一次读取一个完整文件，而不是全目录内容。这里“流式”是按文件，不是字节/逐行流。
- 行级子串预过滤已存在：Codex `:205`、Droid `:162`、Grok updates `:324` / chat `:382`、Claude session `:319`。静态 regex 已复用，不宜把“新增 regex cache”作为主要优化。
- Local 文件内容缓存已存在：`file_cache.rs:95`。命中能省内容读取与解析，**仍有目录遍历、metadata/stat、缓存 DB 读取与 calls 解码**，不能宣称零文件 I/O。
- OpenCode 指纹含主库 + WAL：`providers/opencode.rs:70`，已避免仅检查主库而漏追加数据。
- calls/metadata 已每 100 行批插：`usage_repo.rs:114`、`:147`、`:181`；文件缓存 upsert 100、删除 200 行一批：`usage_file_cache_repo.rs:33`。优化重点不是从逐行 INSERT 改批量。
- 当前 overview 的 KPI/排名在 SQL 聚合：`services/usage/mod.rs:520`；不会把全事实列表搬入前端再统计。Recent 限 20、热力图 IPC 固定 112 格。
- 前端 refresh 同 target promise 去重已有：`usageStore.ts:110`；source 的 overview/recent `Promise.all` + 单次 set 已有：`:226`。unused 30/60/90 天在 UI 重分类，IPC 固定请求 30 天：`:65`、`:286`。

### 3. 冷、暖、追加和失败路径

| 场景 | 当前路径 | 仍支付的成本 / 注意事项 |
| --- | --- | --- |
| 首次 Local 无 scan_state | provider 探测 → 文件缓存空 → 每文件解析 → 缓存 diff → enrichment → 全 target 事务替换 → SQL 页面 | 文件枚举 + 全内容读/解析；缓存 calls 和 facts 两种表示；首次页面等待 |
| Local TTL 内非 force | service 返回 cached summary → SQL overview/recent/providers | 不扫描日志，但不是已序列化页面缓存；每次仍 SQL 聚合 + 本地日期转换 |
| Local TTL 过期非 force | 立即构建缓存页 + 后台 `refresh(...,true)`；事件后前端重取 overview/recent/unused | 后台和前台读库竞争；立即页仍有 SQL 成本；事件不等于成功 |
| Local 暖 force / 后台重扫 | 全缓存 JSON 解码 → 目录/stat → 命中 calls 克隆/merge → enrichment → 全 facts DELETE+INSERT | 即使没有日志变化，仍遍历 F 文件、重建 N calls、重写 N facts |
| JSONL 追加 1 行 | 指纹变化 → `read_to_string` 读取该文件全部内容 → 整文件解析和缓存替换 → 全 target facts 替换 | 不支持字节 offset；长 history/session 小追加仍读整文件 |
| 文件修改/删除/目录消失 | 修改重解析；vanished 缓存删除；provider missing 清缓存并提交 unavailable/空贡献 | 不能用只追加模型覆盖 truncation/rotation；跨文件 winner 可能改变 |
| OpenCode 任意 DB/WAL 变化 | 指纹 miss → 只读打开 → `part JOIN session` 全相关查询 → JSON 解析 | 非 skill 写入也可使缓存失效；没有 event watermark；SQL 内 `json_extract` 成本待测 |
| SSH/WSL TTL 内 | 命令先查本地 target cache，直接返回页面 | 避免建连；不能为只读 getter 新增 transport 探测 |
| SSH/WSL 过期/force | 建连 → provider 全量收集 → enrichment → target facts 事务替换 | Remote 没文件指纹缓存；JSONL 批读仍保留全部内容 map；网络与远程目录请求待测 |
| Local 单 provider collect/parse 失败 | provider unavailable，其他 provider 继续；最终替换该 target | 保留现有 provider 失败语义，不把失败解释成全 target transport fatal |
| Remote transport/protocol/permission fatal | `join_all` 后汇总 fatal，enrichment/事实提交前返回 Err | 全 target 原 calls/health/metadata/scan_state/file cache 不变；confirmed missing/empty 才可清空 |
| file cache 读失败 / JSON corrupt | 空 cache 或对应行 miss，重新解析 | cache 可自愈；不得让 cache 成为唯一不可恢复权威 |
| Local cache diff 成功、enrichment/事实 SQL 失败 | 新 cache 可先落库，facts/health/metadata/scan_state 保持旧事务 | 当前下次全量重组可自愈；改 delta 后必须修复发布一致性 |

### 4. 跨 provider 差异与不可统一猜测的去重

- **Claude Code**：history 是 availability 门槛（`claude_code.rs:120`）；history 先，projects 后。跨文件 key 为 `(skill,timestamp_ms)`，首个 winner 保留 project/session（`:286`）。读取失败：history 上抛；单 session 跳过（`:144`）。增量不能独立把两个来源的 raw calls 全插入 facts；删除/改写 winner 后必须选回另一文件候选。
- **Codex**：递归 JSONL；`session_meta` 填 project/session，后续 response_item 的 `<skill>` 命中产出 calls（`codex.rs:190`）。归一化 `SkillCall` 没保留原 event ID、行号或内容 offset。新增 byte-tail 解析必须带 parser context，不可从空 context 只解析尾部。
- **Droid**：`session_start` 更新 context，tool_result 匹配 activation（`droid.rs:151`）。可出现多个 activation；没有通用 dedup。追加优化需保持上下文与同一行多匹配。
- **Grok**：仅两级目录；项目 `%2F` 编码过滤（`grok.rs:150`）。每 session 先 updates、后 chat，按 skill 首胜（`:168`、`:297`）。chat 的 timestamp 来自 session UUID；跳过 background replay（`:403`）。文件 diff 的重算边界应为受影响 session，删除 updates winner 后必须回退 chat。
- **OpenCode**：`part p JOIN session s` 只选 `p.data,s.directory,p.session_id`，没有选择 `p.id`（`opencode.rs:94`）。只接受 completed 非 builtin skill；没有利用源事件主键。不得贸然认为 timestamp 就是稳定唯一 id，也不能给用户 DB 加索引或迁移。
- **Antigravity/Kiro/Zed** 当前是 stub（`providers/mod.rs:5`），不在本次补 provider 支持范围。

### 5. 确证复杂度与待测热点

记 F=日志文件数，B=日志总字节，BΔ=变化文件的**完整**字节数，N=全部调用，K=不同 skill 名，C=匹配候选数，H=16 周内调用数，S=Skill.md 总字节；字符串长度因素未单列。

| 成本 | 当前代码依据 | 复杂度判断 |
| --- | --- | --- |
| 暖扫 cache materialization | `usage_file_cache_repo.rs:37` fetch_all；`file_cache.rs:71` decode 全 JSON、`:101` clone calls | O(F+N) 解码/分配，即使 zero changed files；峰值至少 O(N) |
| 日志枚举与 cache diff | provider walkers、`file_cache.rs:115` | O(F) 枚举/stat；cold 内容 O(B)，append 内容 O(BΔ)，不是 O(追加字节) |
| 多份 calls 表示 | cache existing + hit clone + provider Vec + upserts clone + `all_calls` | 常数倍 O(N) 内存，具体峰值随 provider 并发/变化比例而变，未测 |
| unique skill 生成 | `services/usage/mod.rs:458` clone 全 N 名再 sort/dedup | O(N log N)，可保持最终排序同时用集合收集 K 名后 O(K log K) |
| identity enrichment | `enrichment.rs:42` 对每 skill 多次遍历 candidates，并反复 normalize | O(K×C)；可一次建立规范化 id/name 多值索引，保留 exact id 优先和 ambiguous |
| Skill.md 估算 | `services/usage/mod.rs:479` 每扫描批读全部 matched 文件；`enrichment.rs:121` 读后 budget | O(S)，每暖扫重复；cache 需 inventory/content invalidation，不可永久复用旧估算 |
| facts replacement | `usage_repo.rs:131` DELETE；`:147` N 行插入；`:181` metadata 替换 | 至少 O(N) 写放大，另六个事实索引维护可能带 O(N log N)；实际主耗时待测 |
| overview SQL | `usage_repo.rs:348` distinct KPI；`:371` 分组 distinct + sort | 访问 target/source 对应事实至少线性；具体临时 B-tree/索引选择须 EQP，不凭 SQL 外观断言 |
| heatmap backend | `mod.rs:529` 拉 H timestamps；`aggregate.rs:199` 每事件 Local 转换+日期 format | O(H log D)，D 约 113；112 格绘制输出是常量，但时间戳拉取不是常量 |
| recent enrichment | `mod.rs:575` 加载 target 全 metadata，尽管 recent 限 20 | O(K) 载入/分配；overview 和 recent 重复读取相同 metadata |
| unused | `unused.rs:22`、`:84` 两类 calls SQL aggregate + inventory joins | 有额外全历史分组成本；来源切换/完成事件再请求，待 profile |
| 热度阈值前端 | `ActivityHeatmap.tsx:114` 每格调用 helper；`:210` 每次 clone+sort M 个正数 | 正值格 D+、M≥5 时 O(D+×M log M)；预计算可变为 O(M log M+D)，固定112格但避免 resize 重复工作 |

`aggregate::kpis_from_rows` / `top_skills_from_rows` 是 helper（`:103`、`:128`），当前 `build_overview` 已走 SQL；不可把这些 helper 的全数组成本冒充生产 overview 的路径。

**索引现状**：`schema/usage.rs:36` 起有 skill/source/ts/target 单列，及 `(target_id,timestamp_ms)`、`(target_id,skill,timestamp_ms)`。没有 `(target_id,source,timestamp_ms)`。source 条件采用 `(? IS NULL OR source=?)`（`usage_repo.rs:336`）。拆成有/无 source 两种参数化 SQL、增加复合索引可能改善 filtered recent/heatmap，但仅作为 EQP+基准驱动候选；额外索引也增加扫描发布成本。Released schema/migration checksum 不可修改。

### 6. 页面与 IPC 正确性风险，优先于缩减载荷

1. **排名截断已确证**：刷新包固定 `build_overview(...,None,50)`（`commands/usage.rs:200`）；getter 默认 0 全量（`:438`），source 切换和 background completed 都传 0（`usageStore.ts:228`、`:442`）。页面使用返回数组本地排序/filter/count（主会话 UI 研究确认）。同一目标不同加载路径可出现 50 与全量差异。须以 >50 名 fixture 回归，不能为了 IPC 限额默默截断排序/过滤全集。
2. IPC 不传全事实：当前规模主要是 K rankings + 20 recent + 112 cells + provider health；unused 可能包含大量安装 observation。完整 ranking 的 O(K) payload 是现有本地筛选能力的成本，不直接等同 O(N)。量化 JSON bytes/serialize/parse/commit 后再决定分页，分页会改变 filter/search/sort 契约，非默认方案。
3. source 选中时，refresh 先计算/返回 unfiltered overview/recent，再由 store 保留旧 filtered 页面并再次请求 filtered 数据（`usageStore.ts:150`）。当前正确避免 unfiltered 闪烁，但有重复聚合与 payload。可在兼容前提下让 page 查询携带显式 source，须避免二次解析 active target。
4. `build_refresh_page` 顺序查询 overview、recent、provider（`:200`），overview 内又分 5 次查询（`mod.rs:520`）。没有共享只读事务；store 的 `Promise.all` + 单次 set 只保证 renderer 提交原子性，不保证 backend 同一 generation。
5. 确证 DB 文件池 WAL、max_connections=5（`db/pool.rs:30`）。后台事务提交可以夹在 SELECT 之间，理论上得到不同 generation 的 KPI/ranking/metadata/recent/health。复现需可控 barrier；没有当前实测混合快照证据。
6. 一致性建议：在已冻结 target 下，以一个只读事务构建全部页面数据，或显式 generation 校验/重试；两个独立 IPC 若各自快照，不自动保证 overview+recent 共用快照。优先复用/扩展 coherent page read，再由两个兼容 getters委托，避免仅在 UI 加一个 generation 字段却不守卫。

### 7. 同 target scan race 与事件状态

- 后台 HashSet gate 仅在 `spawn_background_usage_scan`（`commands/usage.rs:230`），force、cold 和 Remote 直接进入 service（`:330`、`:354`），service 无扫描 lease。`observability::run_operation`（`operation.rs:378`）仅执行+记录，不是互斥。
- 前端 `inFlightRefresh` 在缓存包返回后清理（`usageStore.ts:205`），后台还在跑。此时手动 force、另一 renderer、或 Local→Remote→Local 可以新发同 target scan。两个扫描可能重复枚举/解析，cache diff 竞争，老 snapshot 晚写覆盖新结果；这是静态可达风险，需 barrier fixture 验证。
- 建议只在 usage 域增加 target keyed single-flight/lease，覆盖 background/force/cold/remote 所有扫描入口；跨 target 可并发。force 遇到 background 时选择等同 target 已在途扫描或明确排队新 scan，不能开启第二 writer。锁释放需 RAII/error-safe，不能 panic 后 HashSet 永久保留；不要借用 Central mutation lock 来串行化只读日志扫描。
- 后台完成无论成功/失败都 emit（`commands/usage.rs:245`），只有 target id，无 generation/outcome。store 置 `backgroundScanning=false`，更新 overview/recent+unused，但没同步 provider health、lastRefreshMs（`usageStore.ts:427`）。UI freshness 可能继续用旧值。事件只应触发 coherent refetch；若添加 outcome/generation，保持 target/source request guards 和 silent update 约定。
- 快速 source/target/detail stale 防护已有（store sequences `:60`、`:76`、`:260`、`:385`）。缓存/页面合并和新命令必须保留这些守卫。

### 8. Delta facts 的前置契约与受控迁移

**当前没有可直接使用的 file provenance / stable event id。** `SkillCall`（`mod.rs:49`）与 `NewSkillCall`（`usage_repo.rs:45`）只含 skill/timestamp/project/session/source；facts 的整数自增 id 是本库身份。file cache `calls_json` 同样仅是 `SkillCall[]`。即使源日志有 id，归一化接口已丢弃；OpenCode SQL 也未取 part id。事实表没有 file_path，新增路径列违反纯事实/路径隔离契约。

实施建议与复杂度目标：

1. 先让 scan observation 产出明确 changed/new/vanished 与 unchanged file fingerprints；metadata 载入与 calls payload 载入分开。暖扫应 O(F) metadata 枚举 + 变化组内容成本，避免为了确认无变更而 decode/clone 全 N calls。
2. 添加独立、受控 provenance/candidate 结构，关联 target/provider、文件受控身份、源 occurrence 与事实；路径仍限制在缓存表或受同等 redaction 约束的派生存储。通用 key 不得使用 `(skill,timestamp)`，同一文件相同事实可多次出现；保留 multiplicity。
3. Claude 按既有跨文件 dedup 组重算 winner，Grok 按 affected session 重算；Codex/Droid 无通用首胜规则。目标“单文件变化不重写其他文件”需允许受影响 dedup winner 的最小语义变更，不能禁止更新必要的旧 winner facts。
4. 使用新的 append-only migration；既有 v1/v5 及 `schema/usage.rs` 为 frozen checksum 输入。旧 cache 缺 provenance 时做明确 rebuild/backfill，migration 不扫描真实用户日志，不猜 occurrence。第一次 scan 可 full rebuild，后续才有增量权威。
5. **缓存/事实共同发布是 delta 的硬前置**：`incremental.rs:36` prune、`:57` upsert 在 `mod.rs:494` 事实事务前执行。失败时缓存可能已新、facts 仍旧；现有重建 N calls 能自愈，delta 若直接依据新 fingerprint 跳过将漏事实。收集 diff 应无发布写入；将 cache/provenance/facts/health/metadata/scan_state 在同一成功发布事务提交，或采用有完整恢复协议的 staging/generation。优先简单同事务，不先设计复杂通用 journal。
6. 依赖 cache 来判定无需事实写入时，cache 不再只是可随意 best-effort 的性能提示。cache commit 失败必须回滚本轮发布，或显式 full-scan fallback，不得把部分 cache 更新标为成功。
7. 采样/log counters 单独记录 actual fact writes。现有 `RefreshSummary.calls_written` warm test 期望 N（`tests.rs:595`），改 delta 后语义必须明确：兼容保留“本次可用 calls”还是改为实际 writes，需要同步 IPC/docs/tests；不能把 summary=0 错解为无调用。
8. 未变化 Local：**0 facts 行 delete/insert/update**；仍可更新 scan_state/provider 扫描时间。Central inventory 或 Skill.md 变化只刷新对应 metadata，不假定日志无变就 metadata 永久有效。
9. 单文件变化：事实写入量随 Δ及受影响 dedup 组，而非 N；目录枚举 O(F)、索引写成本及受影响组查询必须如实记录。当前全文件解析 O(BΔ) 可以先保留，不承诺第一次 delta 就变 O(追加字节)。
10. Remote 暂保留全量安全路径，Local 优化不能让其依赖缺失 provenance；明确 confirmed empty 与 fatal 故障的测试矩阵。Remote字节分批/限并发是后续有数据再决定的候选。

### 9. 最小推荐顺序与回滚界面

1. **建立离线 baseline 与 correctness fixture**：>50 rankings、scan races、读 generation、failure publication、重复 occurrence。没有测量前不设声称已达的绝对毫秒。
2. **先修入口与快照**：target single-flight、coherent read、50/全量契约、后台 freshness。完整数据优先；这是后续缓存 invalidation 的基础。
3. **小算法优化**：热力图每 dataset 预计算分位阈值；skill names 从 O(N log N) 降到预去重 O(N)+O(K log K)；identity 建规范化多值索引 O(C+K)，保留排序和 ambiguous。
4. **Local cache与facts受控 delta**：完成 provenance、失败原子发布与旧库 rebuild；先 zero-change 0 fact writes，再 changed/vanished 受影响组更新；以全扫描规范化结果为 oracle。
5. **读取聚合/cache**：只有 baseline 显示明显收益时做 source SQL 分支/索引、避免 metadata 全表重取、aggregate cache。聚合 cache key 至少 target/source/fact generation/metadata generation/本地日期与时区配置；unused 还依赖 inventory/recovery 状态。不要用仅 TTL 缓存掩盖错误。
6. **append-byte / remote 优化留条件门**：前述仍达不到指标且 profile 明确长文件/网络占主导才做。tail 需 offset+parser context+partial UTF-8/行处理、truncate/rotation/rewrite fallback、去重重算；不作为无需验证的简单 seek。

每一步单独输出 baseline/after；回滚通过保留 full-rebuild oracle/fallback 或回退该层优化实现，不能把错误数据静默标成 cache hit。UI 热力图几何与算法同文件，先完成视觉布局后再改阈值算法，避免并行写同文件。

### 10. 可复现基准设计（本轮未执行）

**现有 harness 只供识别，不应现在运行**：`services/usage/bench.rs:3` 明确扫描真实 home，`:23` 的 `usage_bench_full_scan_wall_time` 仅测内存 DB + 两次 forced refresh；缺追加/轮转/失败/SQL/read/IPC、分阶段/重复样本，生产 file WAL 条件也不同。`cargo test ... usage_bench -- --ignored` 会触发真实日志，不是合成基准。

建议新增 `usage_bench_synthetic_pipeline` ignored 测试（名字为规划，**当前不存在**）：仅 TempDir 合成 provider fixtures，调用 provider/service seam；不更改系统 HOME/CODEX_HOME，既有全局 env tests 必须 ENV_LOCK，新增可注入 root 优于扩大 env 写入。generation/barrier/fake remote 不建网络连接。

| 数据组 | 固定输入 | 目的 |
| --- | --- | --- |
| screenshot-like | 1,261 calls，144 distinct names，跨3来源，112天+更早历史 | small/current-looking，不把附件数字当本机真实 benchmark |
| common | 1,000 files，约50 MiB，10,000 calls，K=500 | cold/warm/追加/排序/IPC |
| stress | 最多5,000 files，约200 MiB，100,000 calls，K=5,000，多target/source | 检查N、F、K分别放大；规模须分别变量控制 |
| long append | 单50 MiB JSONL，追加约100 KiB；分两次写不完整行/UTF-8 | 分离 BΔ 与新增字节；识别真正 tail 优化需求 |
| identity | K/C 各1k、5k；规范化 collision、exact id胜name、重复/歧义 | 算法斜率与结果等价 |
| remote fake | 2 targets；exists/walk/list/read fatal、missing、empty、延迟 | 错误/隔离和逻辑请求数，不能充当实机网络吞吐证据 |

预计测试数据最多约200 MiB/5,000临时文件（加SQLite cache/facts、编译产物）；一次文件构造可能耗数秒至分钟。先小组再stress，生成成本单列，测量循环不重复生成。实施前先告知这类成本；本轮按父会话要求未运行。

每次运行记录 commit/base标识、OS、CPU/内存、Node/Rust版本、SQLite `sqlite_version()`、文件系统、debug/release、fixture seed/bytes/files/calls、Cache冷暖、WAL/file或memory池、后台负载。所谓 cold 是**应用file cache空**；不声称清除OS页缓存。

分阶段计时/counter：provider availability、enumeration/stat、log content bytes/read count、parse lines/JSON parses、cache fetch bytes/decode/clone、cache hits/misses/vanished、dedup、identity、Skill.md reads、facts insert/delete/update rows、SQL commit/WAL bytes、KPI/ranking/heatmap/recent/unused SQL、日历转换、JSON serialize bytes/time、renderer invoke resolve→store commit→first paint，以及resize/scroll long tasks。计数可仅测试 feature 输出，不增加产品诊断开关或 raw路径日志。

计时方法：release，5 warmups + 至少20 measured paired samples；cold新DB、warm重复同fixture、append重置固定起点。报告p50/p95/峰值WorkingSet与结构性counter。生成/编译时间单列。不要仅比较一次wall time；micro benchmark变化低于噪声不当收益。

建议分阶段验收目标（需baseline验证成本与可行性，可由父任务最终裁定）：

- correctness：全量oracle等价，含重复call multiplicity、所有ranking/source、112格与DST；同target active scan≤1，复合页面同generation，failure后所有权威表unchanged。
- zero-change：内容重读/JSON重解析=0，事实写入=0，缓存payload解码不随历史N增长；仍允许O(F)stat。
- single change：其它独立文件facts不重写；Δ+受影响dedup组写入；其余文件内容读取=0。新增/删除/轮转均等价。
- warm pipeline：common/stress p95相对baseline至少30%下降，cold总时长/峰值内存不退化超过10%；若baseline已低于测量稳定区，以结构counter为主并记录小样本限制，不捏造提升。
- cached/coherent read：common目标p95≤200ms、stress≤500ms（仅后端page read，拟定预算）；IPC与paint单列，若机器不匹配由实测调整并给依据。
- frontend：112格阈值排序最多1次/数据集；150/5,000 skill fixture无明显点击/滚动long task；输入响应与resize用真实浏览器/WebView trace验证，fixture测试不能替代Windows验收。

未来执行命令（均从仓库根；下列仅方案）：

```powershell
# 已存在的安全 focused fixtures，不含 --ignored：
cargo test --manifest-path src-tauri/Cargo.toml --locked refresh_incremental_rescan_reuses_file_cache_and_stays_equivalent -- --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml --locked remote_fatal_error_preserves_every_target_cache_table
cargo test --manifest-path src-tauri/Cargo.toml --locked metadata_replacement_is_atomic_and_target_scoped
pnpm exec vitest run src/test/stores/usageStore.test.ts src/test/components/usage/SkillUsage.components.test.tsx

# 仅在新增 synthetic benchmark 后；须确认输出确实1个测试执行，不能把0 tests当成功：
cargo test --manifest-path src-tauri/Cargo.toml --release --locked usage_bench_synthetic_pipeline -- --ignored --nocapture --test-threads=1

# 若修改命令/schema，生成并包含产物；最后执行仓库完成门：
pnpm docs:gen
just ci
```

更精细EQP以同一SQLite runtime的合成DB运行，保存原查询与候选查询的计划和结果，不锁定可变EQP字符串格式。file WAL baseline与memory baseline分别报告，不能拿内存结果证明生产I/O性能。

### 11. Historical reference（不是当前基准）

归档 `.trellis/tasks/archive/2026-08/08-15-usage-page-loading-perf/notes.md` 报告当时cold由10.95s→4.91s、warm约153ms、峰值约0.26GiB；这些为2026-08-15的特定机器/真实home、约2109调用结果。只说明已有预过滤/按文件处理/指纹cache曾有效，**没有本轮复测，不可作为当前速度或新任务提升承诺**。未打开其真实日志或benchmark stdout/stderr。

### 12. Related specs / external references

- `.trellis/spec/backend/skill-usage-analytics.md`：日志纯事实、保守匹配、Local/DST 112格、target/source隔离、remote fatal不替换缓存。
- `.trellis/spec/frontend/skill-usage-state.md`：source原子renderer提交、请求序列、后台silent refresh、固定horizons、可读状态、heatmap几何与交互。
- `.trellis/spec/backend/{spawn-blocking-io,target-context,exclusive-job-lifecycle,database-migrations,redaction-policy}.md`：统一blocking FS、冻结target、RAII生命周期、迁移不可变和受控输出。usage单飞是新领域规则，不直接等同现有其它job family。
- `docs/agents/security-and-shared-state.md`：SecretStore、路径/诊断脱敏、共享行为留在service/repo；本轮性能优化不扩大凭据/外部服务范围。
- `docs/agents/build-and-test.md`：root pnpm/just，Rust locked，Windows acceptance，实施后just ci。
- 锁文件：sqlx0.8.6（`Cargo.lock:5030`）、Tokio1.53.1（`:6060`）、chrono0.4.45（`:630`）、serde_json1.0.151（`:4576`）、walkdir2.5.0（`:6626`）；`libsqlite3-sys0.30.1`不等于已测得SQLite engine版本，benchmark需查询runtime。
- SQLite官方 [EXPLAIN QUERY PLAN](https://www.sqlite.org/eqp.html)：识别index SEARCH和临时sorting B-tree；计划文本会随版本变化，不做整串契约测试。
- SQLite官方 [Indexes On Expressions](https://www.sqlite.org/expridx.html)：表达式索引需匹配查询表达式。`LOWER(TRIM(...))`不能自动假定使用普通name索引，先EQP再迁移。
- SQLite官方 [Write-Ahead Logging](https://www.sqlite.org/wal.html)：WAL读事务看到其快照；用于说明一致read transaction的设计，不能由多个pool SELECT推导同一快照。
- Tokio官方 [spawn_blocking](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)：blocking task使用线程池，CPU重任务过多需限制并发；已开始的blocking任务不能靠abort强制停止。不要为本次扫描添加不可靠取消承诺。

## Caveats / Not Found

**父任务最终采纳范围**：以性能子任务 prd.md/design.md 的验收为准。采用暖扫相对改善与结构计数，不采用上文建议的200/500ms绝对page SLA；Remote维持安全全量回退；append-byte、OpenCode watermark、索引、聚合缓存与有界DOM均须通过profile门。旧真实HOME基准不在本轮执行范围。

- 没有读取用户真实provider日志、Skill.md内容、生产SQLite、凭据、远程target或外部服务；外部仅读官方技术文档。
- 无本轮性能数字、Windows installer/WebView性能结果；静态complexity不是当前瓶颈耗时排序。附件1261/144只作fixture设计线索。
- 现有usage ignored benchmark不是synthetic；上述synthetic入口当前不存在，需要实施阶段新增。本轮没有运行测试。
- 无现成稳定事件身份/文件归属接口；delta重写需要受控迁移和provider专属等价规则，不能只添加UPSERT或按skill+timestamp全局去重。
- cache diff先提交的failure问题当前依靠全量重组自愈；将cache变成增量权威前必须共同发布/恢复，不可继承best-effort写入即认为安全。
- Remote全量收集和Local适用不同成本/错误协议；本任务暂不承诺Remote delta、网络吞吐、provider新支持或准确Token消耗。
- 多SELECT混合generation和后台/force重叠为代码可达风险，尚未用运行fixture复现；应该在实施前补deterministic barrier测试。
- 性能报告需要区别应用cache cold与OS cold、memory DB与file WAL、fixture与真实桌面。历史归档数据明确不代表当前。
