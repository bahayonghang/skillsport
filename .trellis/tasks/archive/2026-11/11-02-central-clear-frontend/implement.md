# Implement：前端

前置：后端子任务 implement 步骤 2 已合入（命令签名 + 生成类型）。

## 步骤

1. [ ] 类型：从生成文件引入或新增 `src/types/clearCentral.ts`；`commandMap.ts` 登记三个命令。
2. [ ] fixture：`src/fixtures/` 五套数据 + 三个命令桩。
3. [ ] `centralSkillsStore.clearSlice.ts`：preview / apply（含事件订阅）/ cancel，加 store 单测。
4. [ ] 纯函数 `buildClearCentralRequest` + 单测（开关、截断、copy 勾选）。
5. [ ] `centralClearAllWorkflow.ts` 状态机 hook。
6. [ ] 对话框与子组件；i18n 中英文。
7. [ ] 入口：`ToolbarMoreMenu`（`CentralSkillsShell.tsx` 传入回调）、空状态按钮、命令面板动作。
8. [ ] 组件测试（design §6 全表）。
9. [ ] 截图检查：深色/浅色主题、窄窗口（对话框不出现横向滚动）。
10. [ ] 若 README / README_CN 列出了删除相关能力，同步补充一键清理说明。

## 校验命令

```bash
pnpm lint
pnpm typecheck
pnpm test -- clearAll centralClear
just ci
```

## 评审关注点

- 组件内无 `invoke()`；事件订阅在终态必定解除（成功、失败、卸载）。
- 预览渲染不随 skill 数线性增长 DOM（聚合 + 折叠 + 窗口化）。
- 危险按钮禁用条件完整：预览加载中、空预览、短语不匹配、执行中。

## 回滚点

- 入口与对话框独立；回滚删除 `clearAll/` 目录、slice 与三处入口即可。
