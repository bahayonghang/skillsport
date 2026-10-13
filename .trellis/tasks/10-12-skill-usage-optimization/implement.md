# 父任务推进计划

## 本轮交付检查

- [x] 父子任务创建为 planning，base_branch=dev，父子关系正确。
- [x] 两份源码研究、用户截图证据、父与子任务 PRD/design/implement 完整。
- [x] 需求 R1-R4 与各验收标准有映射；无模板需求占位或阻塞产品问题，技术未知明确归入执行验证。
- [x] implement.jsonl/check.jsonl 仅包含相关 spec/research，去除seed，三个task.py validate通过。
- [x] 记录本轮门禁与未验证范围；只新增本任务目录，未修改产品代码。just ci 未通过，详见 research/planning-verification.md。

## 后续执行

1. [x] 用户确认最新规划后，启动视觉子任务，取当前 DOM/截图基线并完成其 VA1-VA6。
2. [x] 视觉验收后启动性能子任务，冻结相同图形/完整数据契约，完成 PA1-PA9；复杂步骤按其阶段门推进。
3. [x] 父任务集成复核：首次/cached/force/background/source路径的ranking全集与统计一致；更新前后截图/几何和perf报告均来自同一fixture。
4. [ ] 重新跑代表视觉矩阵和Windows WebView2，确认新store/IPC更新不导致概要闪烁、热力图退化或焦点回退。
5. [x] just ci通过后回填父AC1-AC6；若涉及packaging另验Windows x64 bundle。报告外部provider/真实日志/原生/安装包未验证项，不用前端build代替原生证据。
6. [x] 主会话按Trellis finish流程记录、提交与归档；任务PR目标dev、squash。远端写入/发布在授权范围内另行执行，本任务创建不授予发布权限。

本轮不执行 task.py start，不 dispatch 实施代理，不创建PR或提交。用户请求的交付是深入分析后的优化任务。

## 收尾结果

用户已批准实施并人工验收当前结果，原“本轮只规划”描述为历史计划。产品代码与生成物质量门通过；原生自动验证限冷首屏/最大化，其余以单元/浏览器和用户人工验收为证据。剩余数值及完整 native trace 指标按接受的限制关闭，未虚构通过。
