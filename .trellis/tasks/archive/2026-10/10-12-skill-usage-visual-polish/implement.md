# 实施清单

本轮只规划。用户确认最新方案后才 task.py start；实施/检查按项目 Trellis 子代理流程，不能从规划直接编辑产品。

1. [x] 复核父任务研究、spec 和当前源码。启动浏览器 fixture，冻结同一数据、主题、语言、字体、viewport，记录页头→卡片高度、右栏/轴网格宽、图例位置、月份矩形、滚动边界和截图。
2. [x] 修改页头/KPI 布局及同形 skeleton，收敛右栏宽度；保留所有状态、范围、target、刷新入口。检查 VA1 与 900×600。
3. [x] 统一 usage 标签、数字、platform/sort/matchFilter 样式；增加平台 aria-pressed，复用 Button/statusTone；审查 40px 动作热区和相邻控件。
4. [x] 修复热力图月份跨度、intrinsic wrapper 和 legend 对齐；仅按真实测量调整固定 default 格子。同步受影响的 spec/comment 与 fixed-track 测试；不修改阈值算法。
5. [x] 检查 Recent、Detail、Unused 的共有状态/动作一致性，保持解绑行为；中英文所有新增可见文本进入 i18n。若公共措辞改变，README/README_CN 同步。
6. [x] 定向验证并修复自身引入问题：

```powershell
pnpm exec vitest run src/test/components/usage/SkillUsage.components.test.tsx src/test/components/usage/UnusedSkillsPanel.test.tsx src/test/stores/usageStore.test.ts src/test/contracts/typographyContract.test.ts src/test/contracts/themeContrast.test.ts src/test/contracts/fontContract.test.ts
pnpm typecheck
pnpm lint
pnpm build
just ci
```

7. [x] 按父任务矩阵完成真实浏览器几何/截图和最大化 trace，报告 checked/changed/left 消费者数；验证 VA1-VA5。jsdom 或 class 断言不能证明视觉几何。
8. [ ] Windows WebView2 至少验证首次加载、900×600、最大化/还原、详情开闭/焦点、缓存后台刷新。无法取得原生证据时记录明确缺口，不能使用 Vite 代替原生通过。
9. [x] 提交给检查代理，所有验收证据回填后由主会话完成质量门与子任务收尾，交接给性能子任务。

## 风险与回退点

- 页头合并可能改变窄窗和 warning banner 高度，先验证布局后继续控件。
- 更大的 default 格子影响详情 compact 与 font scale，若溢出则回到容器/固定 variant 方案，不引入宽高耦合。
- 修改热力图文件前后告知性能子任务；视觉验收完成后性能只接管算法，保留新几何。
- 每阶段可独立回退，无数据迁移。未来若改变 Tauri 命令或 schema，必须移交性能任务并同步 docs:gen，而非本视觉任务偷偷扩展范围。

## 收尾结果

用户已批准实施并人工验收当前结果，原“本轮只规划”描述为历史计划。产品代码与生成物质量门通过；原生自动验证限冷首屏/最大化，其余以单元/浏览器和用户人工验收为证据。剩余数值及完整 native trace 指标按接受的限制关闭，未虚构通过。
