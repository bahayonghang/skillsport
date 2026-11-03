# Implement：父任务集成计划

父任务本身不承载代码改动，只负责契约维护与最终集成验收。

## 顺序

1. 启动 `11-02-central-clear-backend`：先落 `types.rs` 与 IPC 命令签名（含 specta 类型、`pnpm docs:gen`），
   让前端拿到 `src/lib/ipc/commandMap.ts` 可用的类型。
2. 后端类型合入后启动 `11-02-central-clear-frontend`；在后端 service 完成前，前端用 `src/fixtures/` 的
   fixture seam 开发与测试。
3. 两个子任务都通过各自 check 后，在父任务做集成验收（下方清单）。

两个子任务可以同一分支串行提交，也可以各自开 PR 指向 `dev`（squash merge）；若分 PR，后端 PR 必须先合。

## 集成验收清单

- [ ] `just ci` 通过；`pnpm docs:gen:check` 无差异。
- [ ] 手工（Local，Windows 打包产物或 `pnpm tauri dev`）：
  - [ ] S1/S2：正常数据下清理，Agent 侧栏计数归零，copy 默认保留、勾选后删除。
  - [ ] S3/S5：手动删除 `~/.skillsmanage/skills` 下目录后执行，悬空 junction 被清除。
  - [ ] S4：手动在中央根放一个未入库 skill 目录 + 一个指向它的 junction，执行后都被清除。
  - [ ] S7/S8：Skills CLI 托管链接、用户自建普通目录保持不变。
  - [ ] S12：打开预览后再导入一个 skill，确认后该 skill 仍存在。
  - [ ] S13：用编辑器占用某个中央文件，确认部分失败可见、重试成功。
  - [ ] 取消：大批量执行中点取消，结果 `cancelled`，已删除部分不回滚，再次预览数量正确。
- [ ] 手工（SSH/WSL 若有环境）：清理只影响当前目标；无环境时在交付说明中写明"远端仅有 fake runner 测试证据"。
- [ ] 性能证据：后端性能测试输出（1000 skills × 6 agents 预览耗时、apply 耗时）贴到 PR 描述。
- [ ] spec 更新：新增 `.trellis/spec/backend/central-clear-all.md`，并在 `backend/index.md`、
      `exclusive-job-lifecycle.md`（新作业族）登记；前端契约如有新增约定同步到 frontend spec。

## 回滚点

- 后端：新增模块与命令独立，回滚即删除模块与命令注册；不涉及 schema 迁移。
- 前端：入口集中在 `ToolbarMoreMenu` 与空状态，回滚删除入口和对话框即可。
