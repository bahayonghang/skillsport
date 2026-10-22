# 实施与验证记录

## 授权与状态

用户在规划交付后的下一轮明确要求“开始按照 trellis 任务规划实施”。该消息批准最新推荐方案；两个子任务已通过 task.py start 进入 in_progress。父任务负责集成，不直接作为代码实施目标。

## 修改前基线

浏览器演示环境，使用既有 IPC fixture 注册和真实 store；注入 24 技能 / 24 平台及两个项目作为视觉数据。未修改用户真实库存。窗口为 1600×1000 CSS px，DPR 约 1。

- 排序 select：112×40px，侧栏 208px。
- 库存外部区域：1341.6px 宽。
- 平台 figure：1025.5px 宽，实际 SVG 242px，条形轨道120px。
- 平台 SVG 顶部595.1px，来源圆环顶部717.1px，圆环被长列表垂直居中。
- 截图：[before-1600.png](before-1600.png)。相同数据将用于 after 比较。

## 验证结果

### 实现与量化结果

- 排序：Base UI 非模态菜单 + ArrowUpDown，支持三项 radio、当前排序说明、Esc 及焦点恢复。可见盒从 112×40px 缩为 32×32px；Scale=0.875 时可见 28px、有效热区仍为 40px；Scale=1.125 时热区 45px。外层预留热区槽，与相邻折叠按钮不重叠；浏览器点击可见盒外缘 2px 能打开菜单。
- 库存：Dashboard Card / PanelHeader / CardContent 统一外壳，KPI 三列，来源与平台顶部对齐；文字改为 HTML 语义字号，条形按可用空间伸展。
- 相同 1600×1000、24 技能 / 24 平台数据：平台区域宽 1076px、两列各 526px，首条轨道 241.16px（原 120px）；标签 12px（原 SVG 9px），来源/平台 figure 顶部差 0px。
- 平台完整顺序和零值、来源分类、统计口径及 Local-only / Central 隔离均保持。两个平台列共享最大值和计数宽度。
- 响应式复核发现来源区 48rem 并排会挤回平台单列，修正为 60rem；平台双列断点保持 44rem。最终 1250px 窗宽来源在上、1270px 时并排，两侧平台均两列，面板高度由 755.16px 降为 575.17px。
- 消费者统计：**checked 3 / changed 2 / left 1**。检查 SidebarSection 的 Global Workspace、Project Workspaces 及 InventoryCensus 的 Local Dashboard 用法；修改项目排序与 Local 库存，保留无排序的 Global 分区。其余 Dashboard 面板、字体、主题、数据层不扩散修改。

### 浏览器证据

所有尺寸为 CSS px，DPR 约 1。使用 Tabbit 加载本地 Vite 的真实 React 组件及真实 store，通过既有 IPC fixture 机制提供测试数据，不修改真实用户库存。

| 视口 | 语言 / 主题 / 字号 | 最终结果 |
| --- | --- | --- |
| 900×600 | 中文 / latte / 1.125 | 平台单列，24 行，无横向溢出，底部可滚达 |
| 900×800 | 英文 / mocha / 1 | 平台单列，无横向溢出 |
| 1200×600 | 英文 / mocha / 1 | 平台双列，无横向溢出 |
| 1200×800 | 中文 / mocha / 1 | 来源在上、平台双列，完整可见 |
| 1600×1000 | 英文 / mocha / 1 与 0.875 | 来源并排、平台双列，热区不小于 40px |
| 2560×1374 | 英文 / mocha / 1 | 平台双列使用可用宽度，无横向溢出 |
| 1050 / 1110 / 1250 / 1270 ×800 | 英文 / mocha / 1 | 断点两侧均保留 24 行，窗口变宽不再令平台退回单列 |

- 最终截图：[1600 宽屏](after-1600.png)、[1200 中文](after-1200-zh.png)、[900 中文亮色大字号](after-900-zh-light.png)。900 截图摄于断点校正前，但该视口布局未受校正影响，最终矩阵已复验。
- 大数据场景：1200×800、中文、Scale=1.125，1,234 技能 / 24 平台 / 8 来源，中英混合长平台名。KPI=1,234 / 1,234 / 8，24 行，标签与条形无重叠，无页面或面板横向溢出。
- 行为：外缘点击、Esc 焦点返回、分区收起/展开、整个侧栏折叠/展开通过；全零平台仍有 24 行；空库存显示既有空态。
- 原始最终测量见 [browser-measurements.json](browser-measurements.json)。初次紧跟状态切换采样的压力断言失败，稳定状态复测通过；后续文档构建触发 Vite reload 时数据恢复为默认 fixture，最终压力复测前已重新注入并确认 24 行。未将失败采样算作通过证据。

### 自动化和 review

- `just doctor` 通过：Node 26.7.0、pnpm 12.12.1、Rust 1.98.0。
- 两个 implement agent 与独立 trellis-check agent 完成全范围复核；合并定向测试 7 文件 / 83 项通过，lint、typecheck 通过。断点修正后 4 文件 / 30 项再次通过。
- **最终 `just ci` 通过（进程环境 `RUST_TEST_THREADS=4`）**，包括 lint、typecheck、前端 build、docs、Rust fmt/Clippy、Rust 测试和 Trellis Python。183 个前端文件 / 2,131 测试通过；Rust lib 1,579 通过、9 ignored，额外二进制/集成测试 15 通过；Python 54 项中 4 skipped。
- 运行说明：首次受限沙箱运行因 Central mutation lock 权限失败；允许完整测试环境后默认并发曾整轮通过。最终断点修正后的默认并发运行有 7 项 Central lock 10 秒竞争超时；设置 `RUST_TEST_THREADS=4` 后完整门禁通过。没有修改 Rust 实现或测试来绕过失败。
- `git diff --check` 与三个任务的 JSONL context validation 通过。任务只修改 7 个产品/测试文件、2 个 frontend spec，以及本任务文档/证据；未改版本、依赖或打包配置。

### 证据边界与收尾

**Windows 原生 WebView2、真实库存和安装器均未验证。** 浏览器 fixture、前端 build 和本机 Rust 检查不代表安装或原生渲染验收；本任务无打包变更。保留既有公开文案，只新增中英文排序提示，无需 README 变更。

产品实现与当前自动化/浏览器检查完成。已同步 Dashboard 数据及图标热区契约；用户已在后续消息确认提交和归档。代码已提交为 e2a83f44（侧栏）与 9205fd7b（库存）；按 finish-work 归档三个任务并记录 journal，未 push。
