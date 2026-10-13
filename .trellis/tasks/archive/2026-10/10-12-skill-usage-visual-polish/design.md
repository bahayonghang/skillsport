# 视觉设计与技术方案

## 1. 视觉主题

现有主题下的紧凑分析工作区。主要视觉锚点是技能排行和四项统计，不增加 hero、装饰图或新统计。用户字体 profile 保留，不能把截图中的 serif 当成错误替换掉。

## 2. 颜色与角色

沿用 src/index.css 的 background/card/muted/foreground/muted-foreground；accent 普通文字使用 primary-text，选择面使用现有 primary 填充与配套前景。匹配成功和歧义使用 statusTone，未映射保持中性。热力图沿用 chart-2 六档，不另造硬编码色或渐变。具体色值来自运行时主题，不将截图颜色固化为单一主题。

## 3. 字体层级

| 角色 | 既有 token | 规则 |
| --- | --- | --- |
| 页面标题 | text-base/semibold | 占位紧凑，继承既有字体角色 |
| KPI 数值 | text-xl/semibold/tabular-nums | 不放大为 Dashboard hero |
| 技能名称/主要动作 | text-sm | 保留识别信息与可访问名称 |
| 筛选、列头、状态 | text-xs | 正常 foreground/semantic foreground |
| 来源、路径 basename、时间辅助信息 | text-ui-meta 或既有 text-xs | 不承载唯一决策信息 |
| 图表轴/图例 | text-ui-micro | 有 date/count 等价 aria 信息 |

不新增 arbitrary text 字号/颜色或 inline fontSize；三档根字号继续影响 rem 布局。

## 4. 控件

复用现有 Button、Lucide、radius token 和按压反馈。平台筛选及两组表格 segmented 使用同一页内样式词汇，保留各自语义分组。选中态使用 aria-pressed，禁用原因不靠低透明度解释。小图标动作预留 40px 不重叠槽，不全局修改 Button；热力图数据格不套覆盖邻格的伪元素。

## 5. 布局

```text
宽窗
标题 / 范围 / target    四项紧凑 KPI            刷新时间 / 刷新
平台筛选
技能排行榜（弹性主栏）          最近调用 / 内联详情（有上限右栏）
                              16 周热力图
未使用技能
provider 状态折叠区

窄窗
标题 / target / 刷新
KPI（自然换行）
平台筛选（自然换行）
排行 → 最近/详情 → 热力图 → 未使用 → provider
```

候选右栏 22-26rem，主栏 minmax(0,1fr)，最终上限以长项目名与 font scale=1.125 渲染为准。优先使用当前 Tailwind 栅格，避免新 ResizeObserver 管线。左卡高度不依赖右栏；Recent 保持有界内部滚动，整体页面保留单独滚动区域。

KPI 的独立通栏 surface 收敛为页头中的内容块，仍有可访问分组名称；骨架同步该结构，不能引入一次零 KPI 闪现。

## 6. 热力图几何

先控制卡片与图形自然宽度，再确定一个固定 default 格子尺寸。默认 12px 可考虑提升到固定 16px，compact 10px 作为独立变体保留；仅在实际 narrow 测量证明必要时以现有断点/布局分支选固定 variant。不得引入连续拉伸格子、aspect-square+fr 或宽度到高度的反馈。

月份改为周边界分组占位：为月份计算实际起始列与可用跨度，标签覆盖该跨度；若第一/最后残月跨度不足，省略该月份可视标签并保留格子日期，不省略日期数据。轴、月份、格子和图例放在同一个 intrinsic wrapper，图例不再对齐外卡片右边。

ActivityHeatmap 数据分位分类逻辑本子任务不改；性能子任务后续预计算阈值。现有 fixed track 测试若尺寸改变，应锁定不变量而非旧 12px 字面量；相关 spec/comment 和测试同步更新。

## 7. 层次与禁止项

沿用有限背景层级和细分隔线。少一层无意义 KPI 边框，多依靠对齐和内容顺序；不增加 blur、装饰阴影、粗侧边强调、gradient text、transition-all、layout 动画、全页换肤或新的字体包。按压采用产品现有反馈，高频筛选无延迟动画。

## 8. 响应与状态

以应用最小 900×600 为下界，而非扩展移动端产品范围。验证 xl 两侧、最大化/还原、最小宽与最小高及其组合。用户字体/scale、zh/en、稀疏与密集数据是同一布局约束；错误/远程横幅可以增加高度，不纳入无横幅的 25% 改善指标，但仍必须可操作。

## 9. 实施提示与回退

只使用现有 Tailwind、named tokens 和 usage 组件。先改布局，再改控件，再改热力图。图形与容器不匹配先调整拥有者，不能逐块加 magic padding。无 schema/IPC/持久化变化；可独立 revert 本子任务前端提交。完整验证矩阵见父任务研究文档。
