# 截图与源码视觉评审

日期：2026-10-12。依据用户截图与当前源码。没有修改产品或执行运行时几何测量。原始附件已保存为同目录 [user-reference.png](user-reference.png)，仅复制，未修改图像。

## 诊断

| 区域 | 现象与源码依据 | 建议 |
| --- | --- | --- |
| 排序 | 大框挤标题，SidebarSection.tsx:52 的 select 为 h-10/max-w-28/border | ghost 图标菜单；分离可见尺寸与点击热区 |
| 标题 | DashboardView.tsx:34 的标题在卡片外；对照 LogsPanel.tsx:30 | 同一面板内标题与内容，不套双重边框 |
| 宽度 | InventoryCensus.tsx:38，88+6+120+6+22=242px 固定 SVG | 利用剩余宽度，条形伸展，文字不整体缩放 |
| 对齐 | InventoryCensus.tsx:263，grid stretch 与 figure items-center | 来源与平台区域顶部对齐 |
| 密度 | InventoryCensus.tsx:38 / :158 / :182，行高16、文字9px | 语义字号；宽屏分栏，窄窗重排 |
| 完整性 | InventoryCensus.test.tsx:74 明确要求零值平台 | 保留数据，不用删零值或 Top N 解决留白 |

以上路径分别位于 src/components/layout/、src/pages/、src/components/dashboard/sections/、src/components/skillsCli/、src/test/components/skillsCli/。尺寸是源码逻辑值，非截图测量。原图为2558×1374物理像素，CSS viewport/DPR未知。

## 消费者与参考

- SidebarSection 同时服务 Global Workspace 与 Project Workspaces，仅后者传 sort；检查无 sort 分区、分区收起和侧栏折叠。
- InventoryCensus 唯一生产消费者为 DashboardView 的 LocalSkillsCliCensus；Skills CLI 独立页面未使用，不扩大范围。
- src/components/central/CentralSkillsShellMenus.tsx:111 已有 Base UI Menu、ArrowUpDown 和当前项提示模式。复用 primitive 与视觉语言，不耦合 Central 业务 props。
- Dashboard 同类面板使用 Card / PanelHeader / CardContent / surface-glass，后者禁止 backdrop-filter。
- 已有主题与字体约定足以确定方向，无需外部品牌调研或新增图表库。

## 数据不变量

项目排序枚举为 name/skillCount/recent，key 为 sidebar.workspaceSections.v1；置顶等语义不改。
已装技能=skills.length；linked=至少一个 agent 的技能数，不是去重平台数或关联总数；来源种类=已出现 sourceTypeBucket 数。
平台计数继续用 target.displayName 与 skill.agents 匹配，targets 的完整顺序及零值保留。来源 bucket 与颜色不变，数据点文本等价不丢失。
Local-only 与 Central summary 隔离不变。若发现独立加载/错误状态问题，另记跟进。

## 验证矩阵

| 维度 | 实施最低覆盖 |
| --- | --- |
| 原生窗口 | 900×800最小宽、1200×600最小高、900×600组合、1200×800常规、宽屏；记录实际client viewport/DPR |
| 配置依据 | src-tauri/tauri.conf.json:18，默认1200×800，最小900×600 |
| 响应式 | 实际列切换断点两侧，侧栏展开/收起 |
| 外观 | 截图相近暗色及一个亮色，中英文，font scale 0.875/1/1.125 |
| 排序状态 | 默认、hover、focus、打开菜单、选择三项、Esc退出/焦点返回、分区收起、重挂载 |
| 库存 | 24技能与约24平台的同量级数据、单/多来源、全零平台、长名称、大计数、已加载空库存 |
| 生命周期 | 刷新前后、现有loading/error状态，非Local不加载不展示 |

不要求维度笛卡尔积；窗口边界全覆盖，其余选最可能暴露拥挤的组合。

## 量化与证据边界

排序前后测量可见盒、有效热区、标题宽度。有效热区至少40×40 CSS px，不能覆盖折叠按钮。
库存前后记录内容宽、图表宽、字号与分布区顶部差值；目标解除242px瓶颈，同排顶部差不超过2 CSS px。
同viewport/data保存前后截图，记录 checked/changed/left 消费者范围。
当前仅截图及静态源码证据，产品改动为0；新渲染、原生WebView2、安装器尚未验证。
