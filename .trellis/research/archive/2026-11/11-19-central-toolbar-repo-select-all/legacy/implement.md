# 实施与验证

1. 在 CentralSkillsShell / CentralSearchBar 调整布局，将右侧工具与输入居中，将结果选择放在标签区。覆盖仓库零选、部分、全部和空结果状态。
2. 更新 en / zh 文案与页面交互测试。使用两个仓库的数据验证全选后确认安装的请求 ID、平台、次数，覆盖仓库内二次筛选与切换；保留原有测试覆盖。
3. 运行 pnpm exec vitest run src/test/pages/CentralSkillsView.shell.test.tsx src/test/pages/CentralSkillsView.repositories-and-installs.test.tsx、pnpm typecheck、pnpm lint、just ci。
4. 在 Windows 上用实际渲染检查宽窗口、900 CSS px 及单行/多行标签，测量中心和溢出，尝试从仓库选择进入安装对话框。注明运行环境与真实安装证据边界。

## 实测记录

- 在独立 Windows 桌面运行 SkillPort 调试程序和 WebView2，使用隔离的用户目录、SQLite 数据和目标项目。仓库夹具有 tw93/waza 的 8 个技能和另一个仓库的 1 个对照技能。
- 2048 CSS px 宽，系统缩放 125%。无标签、选单个仓库、22 个查询标签换行时，输入框和三个工具的垂直中心均为 130 CSS px。中英文入口已实测。900 CSS px 宽时三个工具整组换行，排序、视图和更新模式菜单均可打开。170 字符连续筛选值可折行，移除按钮仍处于主内容右边界内。
- 从仓库标签旁全选 8 项、清空并重新全选，打开既有批量安装对话框，选择项目、Claude Code 和复制。确认前目标为空，确认后 8 份 SKILL.md 与源文件逐字节一致，对照仓库没有文件被复制。自动测试另覆盖 65 个筛选结果和未挂载卡片。
- 本地证据放在 outputs/central-toolbar-20261119，包括原生截图、布局测量、安装结果和依赖审计日志。独立运行 just audit 时，现有锁文件中的 libsqlite3-sys、openssl、quinn-udp 共命中 10 条未批准公告。此次改动未调整依赖。

- 最终 just ci 通过。前端 2,348 项通过。Rust 1,742 项通过，12 项忽略。Trellis Python 50 项通过，4 项 POSIX 专用测试在 Windows 跳过。

## Windows 安装交付跟进

- 去除重复 CLI 构建；检查现有打包与 CLI 约定，补最小回归保护。保留独立构建命令。
- 等用户现有构建自然结束，使用正常 just install 验证缺少先前 CLI 产物时仍能正常交付；验证新安装的 CLI、NSIS 和 just ci。

现场证据：旧构建在 07:17:40 产生第一份 CLI，07:17:41 启动独立 Cargo 进程，07:22:02 进入 NSIS。修复后从 live 子进程读到 cargo build --bins --features tauri/custom-protocol --release。验收时暂存旧 release CLI，以验证新的安装能够从缺少 CLI 构建产物的状态重新生成它。

复测：修复后的 just install 用时 333.16 秒，release 构建 4 分 43 秒，只出现一次 Rust 构建，随后进入 makensis。新 CLI 与旧 CLI 的摘要不同；新 CLI 的 release 文件、NSIS 内文件与实际安装文件逐字节一致，安装后 --version 返回 skillport-cli 1.1.1。桌面程序与 NSIS 内文件也逐字节一致；它与原始 release 文件仅有预期的 Tauri 安装包类型标记差异。日志和验证结果位于 outputs/install-build-20261119。
安装修复后的首轮 just ci 在 Windows 临时数据库恢复备份测试遇到一次拒绝访问；同一用例单独复跑通过，完整 just ci 重跑通过（前端 2,349 项）。本轮实测覆盖 Windows x64 NSIS 本地安装。
