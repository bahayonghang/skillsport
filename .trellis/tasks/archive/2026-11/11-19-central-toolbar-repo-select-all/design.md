# 界面与数据

搜索栏容器当前包含输入和筛选标签，外层 flex 按整个容器居中右侧工具。将输入和工具组织为同一行，把标签与结果选择移到下一行；维持输入的正常伸缩和窄窗口工具组的自然换行。沿用现有字号、菜单、搜索快捷键、运行中任务入口和玻璃风格按钮。

仓库入口复用 useCentralSkillsViewChrome 的 onSelectCurrentResults 与 onClearSelection。visibleCurrentViewSkills 是所有现行筛选后的完整数组，和列表渲染共用；选择数量、已全选和空结果均由此及现有选择派生，无新增存储或 IPC。保留现有搜索标签的移除与无障碍行为、筛选时的选择裁剪和确认安装路径。仓库外保留既有手选后的全选入口，避免出现重复按钮。无数据迁移，回滚为恢复前端改动。

## 安装路径诊断

现场 just install 第一次 Rust release 构建同时生成 skillport.exe 和 skillport-cli.exe；beforeBundleCommand 随后又单独执行 pnpm build:cli，同一 Tauri 依赖在此路径缺少 custom-protocol，Rust 因而重编共享库。去掉打包前独立 Cargo 调用，由 Tauri 的主构建负责桌面及附带二进制。用打包后的 NSIS 和安装目录验收。
