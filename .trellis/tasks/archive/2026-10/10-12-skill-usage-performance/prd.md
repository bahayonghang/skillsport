# Skill Usage 扫描、聚合与渲染性能优化

## 目标

完成父任务 R4：在结果完整、target/source 隔离和失败保留旧数据的前提下，减少计算、扫描后处理、数据库写入、页面聚合与前端渲染成本。优先优化 Windows Local，不用删历史、截榜单或跳 provider 取得速度改善。

## 背景

当前代码证据集中于父任务 `research/performance-analysis.md`。已有 TTL、Local 文件缓存、provider 并发、预过滤和批插；暖扫仍全量解码/重建 N calls 并重写整 target，unique names 先排序全 N，身份匹配重复遍历候选。刷新包固定 50 个技能，平台切换/后台完成却请求全量；这是确证的数据口径差异。

后台/强刷重叠与多 SELECT 混合 generation 是静态可达风险，尚未运行复现。文件缓存先于事实 best-effort 落库、无源文件归属是 delta 的关键前置条件。现有 ignored usage benchmark 扫真实 HOME，不能用于本轮离线基准。

## 需求

- P1，基线：新增离线、可重复的 usage 性能 fixture，覆盖应用缓存冷扫、TTL 命中、无变化暖 force、追加/改写/删除/轮转、长文件、provider 失败、远程 fake、页面读取与渲染。记录阶段耗时和结构性计数。
- P2，正确性与重复工作：所有加载路径的排名全集一致；同 target 同时最多一次扫描发布周期；复合 page 数据来自一致读快照；后台完成后 provider 与 freshness 随当前 target/source 安静更新，保持现有请求序列保护。
- P3，算法：热力图阈值每数据集至多排序一次；unique skills 在排序前去重；身份匹配一次建立多值规范化索引，保留 exact id 优先、歧义和所有 provider 去重语义。
- P4，Local 增量：有文件缓存能力的 provider 无变化时不重建全量 calls 或改写事实；变化只更新受影响的文件归属/去重组。缓存、provenance、事实及派生状态共同成功发布；保留 confirmed empty 与 fatal 的区别。
- P5，读取与渲染：基于当前基线减少重复 metadata、filtered/unfiltered 聚合和不必要 IPC；用 EQP/基准决定索引、日聚合与缓存。大榜单测 100/1k/10k 行，仅测得必要时使用有界 DOM，所有结果仍可排序/过滤/访问。

## 验收

- [x] PA1，对应 P1：报告明确 fixture seed/规模、硬件/版本、release/debug、file WAL 与 memory DB、应用缓存状态；至少 5 次预热、20 次测量，报告 p50/p95 与内存峰值；fixture 生成/编译耗时单列，不声称清除 OS 页缓存。
- [x] PA2，对应 P2：>50、144 和 1k 个技能 fixture 下首次进入、TTL 返回、force、平台切换及 scan-completed 的完整集合一致；筛选/排序/计数与全量参考等价，不通过只取前 50 达标。
- [x] PA3，对应 P2：可控 barrier 测试证明同 target active scan≤1，跨 target 可并发；复合 page 的 KPI、ranking、heatmap、recent、provider 来自同一读 generation；陈旧 target/source/detail 不提交，失败及异常释放扫描 lease。
- [x] PA4，对应 P3：热力图阈值排序最多一次/数据变更，正数不足 5、全零、相等值、极值与分位边界等级等价；unique 名称和 identity 的输出完全等价，复杂度从 O(N log N)→O(N+K log K)、O(K×C)→期望 O(C+K)，多值输出量单计。
- [x] PA5，对应 P4：文件 manifest（集合、本轮遍历顺序、指纹）无变更 Local 暖扫日志内容重读/JSON 解析=0，unchanged cache calls payload 解码不随 N 增长，fact insert/delete/update=0；仍允许 O(F) 枚举/stat 和必要 freshness/metadata 更新。遍历首胜顺序改变属于 manifest delta，保留既有 provider 结果语义。
- [x] PA6，对应 P4：追加、改写、删除、轮转和跨文件去重 winner 回退与全量 oracle 等价；无关文件内容读取=0，无关事实写入=0；重复调用 multiplicity 保留。cache/provenance/facts 任一提交失败不发布半新状态，下次刷新可恢复。
- [ ] PA7，对应 P4-P5：common/stress fixture 的无变更暖扫 p95 相对完整数据基线降低 ≥30%；冷扫耗时和内存峰值退化不超过 10%。若基线 <50ms 或变化落于噪声区，以 PA5/PA6 结构计数验收并明确记录该限制，不能声称测得相同比例收益。
- [ ] PA8，对应 P5：缓存 page read、source 切换、unused、JSON bytes/serialize/parse、store commit→paint、排序/scroll/resize 单独报告。稳定场景 p95 不退化超过 10%；大榜单 DOM 若做窗口化，数量受 viewport/overscan 限制且所有排序/筛选结果可达，键盘和焦点保持正确。
- [x] PA9：Local/Remote 错误矩阵、旧数据库迁移/重建、日期/DST、target/source隔离、usage 定向测试与 just ci 通过。Windows WebView2 冷/暖首屏、显式刷新、最大化/还原另取证。

## 范围与边界

拥有 usage Rust command/service/repository、必要的追加迁移、typed IPC/store 与 usage 算法/有界渲染。ActivityHeatmap 只改阈值算法，采用视觉子任务已完成的几何。日志保持纯事实，路径留在受控缓存/provenance，不存 prompt、tool arguments 或凭据。

Remote 与无可用文件 provenance 的 provider 保留全量正确路径；无真实连接/扫描授权时仅 fake 验证。不包含新 provider、外部日志库改写、通用扫描框架、精确 token 消耗、取消协议、日志采集 UI 或默认新依赖。

## 依赖与规划状态

父任务：`10-12-skill-usage-optimization`。在视觉子任务完成后实施，避免热力图/榜单同文件冲突。当前 planning，无阻塞产品问题。追加字节 seek、OpenCode watermark、remote 吞吐、聚合缓存与新索引均由 profile 决定，不在未测时预设为必做。

## 最终验收与关闭

2026-10-13 用户声明人工验证完成并接受当前结果收尾。技术证据见父任务 `research/integration-verification.md`；未勾选的数值指标保持未通过，不作为继续实施的本轮要求。PA7 memory 冷扫中位回退 19.2%，PA8 生产 paint/source/unused 完整对照以及父 AC5 的部分计时证据均按已知限制记录。CI 与 Windows bundle 均通过。
