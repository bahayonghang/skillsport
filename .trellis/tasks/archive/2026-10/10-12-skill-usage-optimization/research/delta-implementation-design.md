# Research: Local usage delta 的最小实施设计

- Query: 基于现有 provider/cache API，为 PA5/PA6 给出可实施的 fingerprint-only 暖扫、provenance、winner 回退与原子发布设计。
- Scope: internal；只读现有代码与已批准规划，不实施、不跑真实日志或测试。
- Date: 2026-10-12
- Context: `.trellis/tasks/10-12-skill-usage-performance/prd.md:27`、`:28`。本文件补充窄范围 Rust handoff，不替代已有 `performance-analysis.md`。

## Findings

### 1. 已确定的兼容决策

**保留本轮 full oracle 的遍历首胜语义，不改为路径排序，也不冻结上次顺序。** 主会话已明确采用本轮 observed order；顺序改变属于 manifest delta。PA5 的零 fact 写入以**文件集合、顺序和指纹**均不变为前提，仍允许 O(F) 枚举/stat。

- Claude 固定 history 最先，再按本轮 `WalkDir::new(...).into_iter()` 返回顺序扫描 projects（`providers/claude_code.rs:161`、`:179`）；未配置 `sort_by`。不能把 filesystem 先后假定为稳定字典序。
- 每个文件原始 calls 的先后是 parser vector 顺序，首胜由 `(observed_file_order,raw_call_ordinal)` 决定。Claude 当前 `merge_calls` 以 `skill:timestamp_ms` 去重（`:286`）；这个专属 group key 不推广到其它 provider。
- Grok 每 session 显式 updates 在 chat 前（`providers/grok.rs:168`）；同 session 按 skill 首胜（`:297`）。group 用扫描中的 session directory 身份，**不是调用里的 session_id**，后者 updates 可能读取不同字段（`:359`）。同名 session directory 位于不同 project 时不得合并。
- Codex/Droid 无上述去重；同一文件内容完全相同的两次调用是两个 occurrence。ordinal 是解析出的 call vector 索引，不需要新增源物理行号或假装已拥有 stable event ID。
- OpenCode 单 DB/WAL 指纹命中也可走零事实写入；miss 后整 DB 查询/替换**OpenCode provider 贡献**即可，不重写其它 JSONL provider。Remote 保持原来的全 target full replacement。

### 2. 当前接口为什么不能仅加一个 fast path

- `UsageProvider::collect_incremental` 返回 `(ProviderFileCache,Vec<SkillCall>)`（`services/usage/mod.rs:218`），其签名要求构造全集。
- `ProviderFileCache::from_rows` 解码每行 `calls_json`（`file_cache.rs:71`），`lookup` 返回 calls clone（`:95`）；当前 repository SELECT 包含全部 payload（`usage_file_cache_repo.rs:37`）。必须另设 fingerprint read，不能只在 collect 后发现 upserts 为空。
- `incremental.rs:36`、`:57` 提前写 cache；`mod.rs:494` 才写 facts。delta 不可继承这个提前 best-effort 发布顺序。
- `SkillCall` 只有五项业务字段（`mod.rs:49`），事实自增 ID 是本库身份（`schema/usage.rs:20`）；不存在源 event/file identity 可复用。

### 3. 推荐最小数据模型：扩展既有 cache + 一张 candidate 表

不改 `skill_calls` 的五项事实字段，不向它加入 path。建议 migration 新增：

```text
skill_call_file_cache 的新增内部列
  file_key TEXT NULL                     // 旧行 NULL；新行用受控 opaque ID
  observed_order INTEGER NOT NULL DEFAULT 0
  UNIQUE(target_id, provider, file_key)

skill_call_scan_state 的新增内部列
  local_provenance_version INTEGER NOT NULL DEFAULT 0
  // 0 = 未建成/旧库；1 = 该 Local target 的支持路径全部共同发布
  // 用单独内部 SELECT 读取，不加入 ProviderHealth/IPC DTO

skill_call_candidates
  target_id TEXT NOT NULL
  provider TEXT NOT NULL
  file_key TEXT NOT NULL
  occurrence_ordinal INTEGER NOT NULL CHECK(occurrence_ordinal >= 0)
  group_key TEXT NOT NULL
  skill TEXT NOT NULL
  timestamp_ms INTEGER NOT NULL
  project TEXT NOT NULL
  session_id TEXT NOT NULL
  source TEXT NOT NULL
  fact_id INTEGER NULL UNIQUE
  PRIMARY KEY(target_id, provider, file_key, occurrence_ordinal)
  FOREIGN KEY(target_id, provider, file_key)
    REFERENCES skill_call_file_cache(target_id, provider, file_key) ON DELETE CASCADE
  FOREIGN KEY(fact_id) REFERENCES skill_calls(id) ON DELETE SET NULL
  INDEX(target_id, provider, group_key)
```

说明：

- `file_key` 可用现有 uuid crate 生成并跟随缓存行保存，或用已有 SHA256 对精确 provider/path identity 派生；选择一种即可，不新增依赖/通用 identity 框架。不要对原 path 额外大小写/分隔符规范化，改变现有 provider equality。真实 path 继续只存 file cache，opaque key/group_key 不进入日志/IPC/export。
- candidate 存**全部 raw multiplicity，包括当前 losers**；只有 winner 的 fact_id 非空。没有 loser 就不能删除 history/updates 后回退。一个事实最多一个当前 winner，`fact_id UNIQUE` 保证关系。
- `group_key` 用无碰撞结构编码，如 JSON tuple；不要拼接可能包含分隔符的未经转义字符串。
  - Claude：`[skill,timestamp_ms]`，provider/target 已在外层作用域。
  - Grok：`[opaque_session_directory_group,skill]`；opaque group 从完整扫描 session directory 身份生成，不能只取 dirname。
  - Codex/Droid/OpenCode：`[file_key,occurrence_ordinal]`，每 occurrence 独立 winner。
- 首版保留现有 calls_json 以兼容 oracle/测试和可重建缓存；生产暖扫不 SELECT、不 decode它。candidate 成为 delta 的规范化原始候选。避免同时在应用内保留全 payload 和全 candidate Vec；cold 存储冗余是明确代价，后续有证据才清理 JSON 列。
- `local_provenance_version` 是一次完整 target publication 的 readiness，不能以“cache row 存在”替代。初次全target rebuild成功后为1，所有provider不可用也可ready。后续单provider失败/Unavailable清除其cache/candidates/facts，target仍保持一致ready1；恢复时空fingerprints自然令该provider全文件Parsed，不重复清其它provider。新代码读到未知version时使用明确rebuild/兼容拒绝，不能把它当1。用target marker而非各provider ready0，避免“恢复一个provider”被误判为“整个target还是legacy”。
- 现有 cache `INSERT OR REPLACE` 会删除旧行后插入；新增 cascade 后可能删除 candidates。新事务 API 必须用 `ON CONFLICT(target_id,provider,file_path) DO UPDATE` 保留 file_key、维护其它 metadata，**不得继续用 OR REPLACE 更新未变化文件的 order**。
- candidate 删除不会自动删除 facts，因为 FK方向是 candidate→fact。发布前明确捕获受影响旧 winner IDs，然后 reconcile；不得先 cascade 删除再丢失旧 fact 归属。

### 4. 可执行接口变化（名称为实施建议，不要求额外层抽象）

在 `services/usage/file_cache.rs` 定义瘦 fingerprint map；可新增 `services/usage/delta.rs` 放 shared plan，不让 mod.rs 超预算：

```rust
struct CachedFileFingerprint {
    file_key: Option<String>,
    mtime_ms: i64,
    size: i64,
    observed_order: i64,
}

struct ObservedFile {
    file_path: String,       // service/repo内部受控，仅缓存边界使用
    file_key: String,
    mtime_ms: i64,
    size: i64,
    observed_order: i64,
    merge_scope: Option<String>, // Grok扫描session目录的opaque group；不用call.session_id
    change: FileObservation,
}

enum FileObservation {
    Unchanged,             // 无 calls Vec/JSON decode
    Parsed(Vec<SkillCall>), // 原始parser输出，不在这里dedup
    Unreadable,            // 不能混同 Unchanged 或 Parsed(empty)
}

enum ProviderScanPlan {
    Files { files: Vec<ObservedFile>, vanished: Vec<String> },
    WholeProvider(Vec<SkillCall>),
    Unavailable,
}

// trait新内部入口；默认WholeProvider保持stub/未来provider的安全fallback
async fn collect_local_plan(
    &self, scope: &Scope, fingerprints: HashMap<String, CachedFileFingerprint>,
) -> Result<ProviderScanPlan, UsageError>;
```

1. `usage_file_cache_repo.rs` 新 `list_file_fingerprints` 只选 path/key/mtime/size/order；旧 payload API 保留给测试/旧全量 oracle。ready=0 时传空 fingerprints，所有可读文件产出 Parsed，完成完整 rebuild。
2. provider 共用现有 parser 和 walker；将 scan_local 的读取/lookup部件换为 fingerprint命中→Unchanged、miss→Parsed。不复制五套新 parser。现有 `collect` 全量 oracle 可从同一 scanner 的所有 Parsed calls 按 observed order merge；或者保留旧 full parser oracle用于验证，生产delta不调用它。
3. cold/full扫描和delta必须使用同一轮manifest顺序。并发 oracle测试注入目录枚举序列，不依赖OS实际read_dir顺序。不要为得到oracle独立枚举两次后把顺序差当delta错误。
4. `incremental.rs` 改成只读准备plan，无 upsert/delete。`available=false`也只记录Unavailable计划，不提前清cache。
5. 新 `usage_delta_repo.rs` 管理候选/winner/事务内cache；或者将小型helpers放现有repos，但函数接受 `&mut SqliteConnection`/事务，不再接pool并自行提交。注册 `db/repos/mod.rs` 与 `db/mod.rs` re-export遵现有usage模块方式（`:30` / `:53`）。
6. publisher调用 `publish_local_scan(pool,target,plans,metadata,scan_ms)`，只此处 `pool.begin/commit`；provider和FS不捕获事务。已有target single-flight覆盖准备和发布整个周期。

`Unreadable` 保留原 provider 分层：Claude history失败整provider unavailable（`claude_code.rs:144`）；其他单文件读失败当前会跳过其贡献。因此单文件不能沿用旧facts并当成功 unchanged；发布时删其当前贡献并使对应cache失效/移除，下一次必重试。provider unavailable也同事务清该provider贡献/派生归属，其他provider继续；已初始化target的ready1仍有效，恢复provider会从空fingerprints建立新归属。Remote fatal在任何publication前abort。

### 5. Fingerprint-only 暖扫与受影响组选择

**manifest unchanged**：

- 读取F条瘦fingerprints，枚举/stat F文件，确认每个file同key、fingerprint、order。
- 不读日志内容、不取calls_json、不读取N条candidate payload；直接复用 `skill_call_providers.call_count`（`schema/usage.rs:77`已有），facts写入0。总调用数取最多8条provider计数，不 `COUNT(*)` 全candidate来证明暖扫。
- freshness/health/scan_state和必要Central metadata仍可更新；技能名称可取已发布metadata的K名+新增delta名，不从N个calls复制排序。metadata丢失/不完整时允许有索引的事实DISTINCT rebuild，不把空metadata当无调用。

**有内容/集合/顺序delta**：

1. 收集changed/new/vanished file_keys。从它们**旧candidate**取distinct group_key，加新Parsed calls的group_key。
2. 对仍存在的旧文件，分别从旧/新manifest剔除新增和消失文件后比较相对次序；只把相对位置不同的旧文件纳入reorder影响集合。这样在首位新增文件引起所有absolute ordinal+1时，不把全部旧组无理由重算。两序列按索引比较即可O(F)保守选择，不做O(F²)所有pair比较。
3. reorder集合只读取distinct group_key，不decodecache JSON；合并为affected_groups。无法优化的全局reorder可扩大候选查询，但要如实记录，这属于manifest变化，不是PA5暖扫。
4. 在事务里记录这些groups的旧winner事实，更新cache fingerprints/order，删除changed/vanished候选、插入新raw候选；对于每个affected group查询全部剩余候选，按 `(file_cache.observed_order,occurrence_ordinal)` 选首位。
5. 只比较旧winner与新winner的五项业务事实。完全相同则保留fact row/id，仅移动candidate fact_id归属（先清旧pointer再赋新pointer，满足UNIQUE）；业务事实不同才delete+insert或update该事实。没有新winner才删除；没有旧winner才插入。
6. 未受影响group不读payload、不写facts；从old/newwinner数量差调整provider.call_count，避免每scan全N重计数。初次rebuild可以完整计数。

Claude：删除history或改写其中一key后，会触达该key的全部projects loser；内容读取仅变化文件，旧loser从candidate SQL读。projects遍历重排能改变不同project/session的winner，必须更新这些受影响事实。Grok：group_key把影响限于同一project/session的同skill，删除updates会选择chat，跨session同skill互不影响。

单变化文件最坏可含所有groups，其真实影响可以O(N)。验收不能要求常数Δ；要求不**无理由**重写其它文件/组，不把全target DELETE当最小delta。

### 6. OpenCode fallback、旧库建立与提交组织

- OpenCode已有主库/WAL fingerprint（`providers/opencode.rs:70`）。fingerprint命中+ready1返回Files/Unchanged，无query无factwrites；miss时保留现有全量SQL（`:94`）得到该DB的全部raw calls。以一个cache file_key、ordinal candidate重建OpenCode贡献，或WholeProvider有源归属发布；两者选一，不能每次opencode miss重写其它provider。
- OpenCode不增源数据库索引、不用timestamp watermark、不猜part ID；Remote照旧fetch whole database。source一致性基于当前固定唯一display_name表，不能新增字符串heuristic把未知source当此provider。
- 旧库ready0时首次Local明确刷新做一次**完整target rebuild**，清理所有legacyfacts/旧derived行并建立五provider候选，避免未归属旧facts成为ghost；migration本身不扫日志。首扫失败可继续显示原cache，下次retry仍ready0。此一次rebuild例外要与后续PA5/6分开。
- publication顺序（全部在同一事务）：旧winner快照→cache/provenance变更→受影响facts→provider health→metadata→scan_state+target ready→commit。任何SQL错误或注入故障都rollback。
- enrichment FS读取放在writer事务之外；可用已发布技能名K加新Parsed名字做metadata超集，事务内只发布当前仍有facts的metadata、删除已无facts的metadata。不能为enrichment重新构造全Ncalls，也不要在事务持锁时遍历读取所有Skill.md。
- 单事务内无两个repo各自begin，不把cachepersist error降为warn后仍commitfacts；cache作为跳过事实的依据后必须共同提交。
- 保持 `RefreshSummary.calls_written`兼容或明确同步新语义；另设测试内部 `fact_insert/delete/update_count`计数，禁止用summary值替代实际zero-write证明。

### 7. 实际迁移与实施文件落点

当前最高版本7；实施前再确认主工作区未新增migration，避免占用同版本：

- 新 `src-tauri/src/db/migrations/versions/v8.rs`：`SOURCE=include_str!("v8.rs")`、apply只含专用immutable SQL。创建上述列/唯一索引/candidate table；不编辑v1-v7或旧 `schema/usage.rs`。
- `src-tauri/src/db/migrations/versions/mod.rs:3` 注册v8；`:33` `MIGRATIONS`从7→8追加descriptor。
- `src-tauri/src/db/migrations.rs:149` apply match追加8；`:228` run_migrations追加`if applied_version<8`。保留preflight/backup/foreign_keys流程。
- `src-tauri/src/db/migrations/tests.rs:178` checksum lock仅追加v8摘要，不改旧7项；versions.len=7断言当前`:302`、`:310`、`:337`同步8；未来version fixture `:557` 从8→9或取明确latest+1。旧fixture SQL/manifest hashes不改。
- 新/改 `services/usage/{delta,file_cache,incremental,mod}.rs`、五真实provider；`db/repos/usage_delta_repo.rs`、`usage_file_cache_repo.rs`与usage_repo的事务helper；`db/{repos/mod,mod}.rs`。
- 新表/命令若触及生成架构入口，按项目规则执行 `pnpm docs:gen`并包含生成结果；check/build仍只读。本研究不改spec，兼容限定由主会话更新usage spec。

### 8. 最小确定性fixture与结构验收

| 用例 | 最小fixture / 验证 |
| --- | --- |
| fingerprint-only warm | 两JSONL文件各两calls、cold建完整归属；warm同manifest。spy日志read=0、payloaddecoder=0、fact变更trigger计数=0；candidate payload SELECT计数=0 |
| Claude winner回退 | history review@T + projectA review@T + projectB review@T，三者project不同；history始终first。删history需保留availability门槛（测试history改成空文件），回退本轮首projects；再删A回退B；其它skill fact id不变 |
| Claude order变化 | 注入manifest [history,A,B]→[history,B,A]，history为空，A/B同group不同project；fingerprints相同但winner更新。再同[history,B,A] warm零写 |
| 新文件插前 | [history,A,B]→[history,NEW,A,B]；relative旧序没变。只处理NEW组，A/B独立事实id、trigger计数不变；允许cache order更新 |
| Grok session归属 | 两project具有同session目录名，各updates+chat中review；不能跨projectdedup。删其中updates仅回退同session chat；另一projectfact id不变 |
| Codex/Droid multiplicity | 同文件两条五字段完全相同的raw调用+第二独立文件；必须有2个独立occurrence事实。追加第3个/改写/截断/轮转分别multiset等价，独立文件id不变 |
| OpenCode fallback | sourceDB+WAL fixture，cold→warm0query0facts→DB内容变化整provider替换；其它JSONLprovider id不变；WAL-only变化仍miss |
| rollback | 在cache写后、candidate写后、facts写后、metadata失败4处注入SQL失败；比较target calls/cache/candidates/health/readiness/scan_state全快照相同，下次同delta仍可发布 |
| oldDB / ready0 | 迁移前只含facts+JSONcache无provenance；migration后旧facts完整保留且ready0；首次成功建立归属，失败不把ready设1 |
| local单file失败 / provider不可用 | single unreadable file不得复用旧贡献为unchanged；provideravailability=false只清该provider；后续恢复重新建立，另一provider保留 |
| remote fatal | 沿用当前三态FakeRunner，新增表/ready也纳入快照，fatal不写任何表；confirmed empty仍合法 |

比较pure五字段multiset而非自增ID全量oracle；同时单独断言**无关事实ID和值不变**，抓住targetwide DELETE/INSERT伪delta。Recent equal timestamp的次序当前未定义（SQL仅ORDER BY timestamp），不拿它作为源occurrence身份。spy/触发器仅测试层，避免增加产品性能开关。

## Caveats / Not Found

- PA5零写限定为manifest（集合/顺序/指纹）不变，主会话已选定；不能声称仅内容未变化时一定零写，因为现有Claude首胜取决于本轮遍历。
- 双字段mtime_ms/size继承当前指纹语义，不能侦测人为保持两者相同的改写；不新增“零内容读取仍能验证全部字节相同”的虚假保证。fixture通过可注入metadata/实际size变化控制失配，不用timing sleep赌mtime。
- 上述接口/SQL为实施建议，当前尚未存在；未编译、测试、建库或执行真实日志。迁移版本8须实施时核查并发工作区。
- candidate存全部raw losers增加磁盘量，但使受影响组无需重读无关文件；首版保留JSON兼容列会有冗余。需要基准分别报告cold/文件库写量，不能只展示warm收益。
- 不能用缓存计数/ready掩盖发布失败；不能以provider whole fallback为理由使每次OpenCode变化执行targetwide重写。
