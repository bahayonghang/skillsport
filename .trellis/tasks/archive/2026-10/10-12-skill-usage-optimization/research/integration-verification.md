# 最终集成与收尾记录

2026-10-13（America/Los_Angeles）。用户已人工验证并明确要求按当前结果收尾。当前实现按该验收范围关闭；下述数值缺口保留，不通过修改基准或勾选失败指标掩盖。

## 交付

- 标题、KPI 与操作合并；宽窗顶部高度 196.375 → 108.8 CSS px，减少 44.6%。
- 9 个原 usage 消费者已检查并调整；统一控件状态、40px 操作按钮、数字对齐、错误反馈与焦点恢复。全局字体、主题与 accent 继续由用户偏好控制。
- 右栏收敛，热力图外框占可用宽度约 98%，图例右边界差 0px，保留 112 天、月份跨度与固定轨道。
- Local 文件指纹命中不读日志、不解析缓存 payload、不写 facts；变化文件只更新受影响归属/去重组。v8 追加 provenance、事务发布、扫描 single-flight、一致 page 快照与完整榜单。
- 热力图阈值每数据集排序一次；身份匹配建立多值索引；大榜单使用完整数据排序/筛选及有界 DOM，支持键盘与详情来源焦点恢复。

## 质量门

- `just ci` 最终退出 0：前端 187 文件 / 2190 测试通过；Rust library 1595 通过、10 按定义忽略，其他 Cargo 测试目标通过；Trellis Python 54 项、4 平台跳过。类型、lint、fmt、Clippy、IPC、文档生成/构建与其他门全部通过。
- 第一次集成 CI 捕获宽数据库入口调用 410 超过 388 的历史基线。现已改走 repository owner，并将 service SQL 移到 usage_stats_repo；最终计数 378，未提高基线。
- `just build` 最终退出 0，生成 Windows x64 NSIS：`outputs/SkillPort_1.0.2_x64-setup.exe`，14,077,485 bytes。该证据是本地构建，不代表安装、签名发布或升级链验证。
- 源代码最终冻结后仅回填任务/spec/收尾材料，不再调整产品界面或算法。

完整日志：`evidence/ci-final.log`、`evidence/windows-build-final.log`。

## 浏览器与原生证据

- `evidence/browser-visual-final-static-v1-values.json`：18 个窗口/主题/语言/scale 组合，含 1360/1380/1400 边界；页面、区域及榜单没有横向溢出，月份没有裁切，全部 112 格；控制台错误为空。使用独立、禁用 HMR 的 fixture 服务，排除并行编辑造成的导航。
- `evidence/browser-interaction-after-v4.json`：10k 全集 End/Home/Tab、卸窗后的详情来源、排序/筛选后的焦点、来源失败保留榜单、pending/failed 详情关闭通过，错误为空。
- `evidence/browser-controls-final-v3.json`：重复 recent 调用准确渲染 3 行、原节点焦点恢复、深色选中 hover、紧凑字号下全部 usage 操作按钮至少 40px，通过且无控制台错误。
- `evidence/browser-profile-final-v1.json`：5 次预热 + 20 次测量，100/1k/10k 均 23 行、约 866 DOM 节点；10k payload 1,909,332 bytes，JSON parse p95 2.3ms、serialize 4.2ms、name sort 0.3ms、commit/layout 61.2ms。该记录来自 Vite 开发态且与 NSIS 编译并行，不作为生产延迟或 paint p95 达标声明。原始背景标签双 RAF 延迟量化到秒，也不用于速度收益声明。
- Windows release exe 在隔离 USERPROFILE/AppData/WebView2 下启动，私有 Claude fixture 的冷首屏显示 1,261 calls / 144 skills / 5 projects / 1 source；最大化后紧凑概要、完整榜单和热力图正常。自动截图在本对话工具证据中；用户随后声明人工验证完成并接受当前结果。未推断该声明包含未列出的具体测试步骤。

## 性能结论及接受的限制

- 详见性能子任务 `research/benchmark-results.json` 与 `backend-implementation.md`。同机 release、应用缓存冷/暖、memory/file WAL、5 预热 + 20 样本、原始数组与 peak working set 均记录；未清 OS 页缓存。
- Windows file WAL stress 暖扫描 p95 329.90 → 50.14ms（约 84.8% 降低）；冷扫描 p50 344.57 → 216.19ms、p95 611.57 → 337.11ms；peak 34.73 → 28.45MB。
- 基线是旧 cache decode/clone/full-replacement 发布流程，共享当前 identity resolver；不归因身份索引收益。变化 manifest 的旧顺序比较含 O(F log F)，无变化 manifest 路径为 O(F)。
- **PA7 技术缺口保留**：memory stress 冷扫描 p50 73.81 → 87.99ms，回退 19.2%，超过 10% 线；p95 改善不能掩盖 median。单次 TEMP 展开与 F-prefix 两个无收益实验均撤回，原始证据保留。
- **PA8 数值证据限制保留**：缺少生产环境逐阶段 before/after paint p95 及 source/unused 完整计时对照，不声称全部稳定场景退化 ≤10%。已有完整性、窗口/焦点、开发态分阶段与缓存 page 证据。
- 未扫描真实 HOME 或真实远程 target，未执行真实安装/卸载、升级、签名发布或提供现场硬件吞吐保证。
- 用户在这些限制已说明后选择当前结果收尾，故关闭本轮任务；PA7/PA8 不标为技术通过。
