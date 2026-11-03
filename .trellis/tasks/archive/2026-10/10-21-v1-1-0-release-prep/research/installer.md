# C9 Windows 安装包构建与验收（本任务 R6）

> 2026-10-21。本机为用户的真实工作站：本任务**只构建，不安装、不升级、不卸载、不运行构建出的 SkillPort**，也不接触 `~/.skillsmanage` 等真实用户数据。没有使用任何签名密钥或 secret。下方验收清单全部 **UNVERIFIED**，需在 Win11 / Win10 真机或虚拟机上由用户执行。

## 1. 构建

**结果：成功**（exit 0，约 9 分钟；Rust release 两轮编译各约 4 分钟：桌面端 + `beforeBundleCommand` 的 `pnpm build:cli`）。

命令（对齐发布工作流 `release-desktop.yml` 的 Windows 构建步骤，但**不带** `--config release-updater-config.json`，并显式清除签名环境变量）：

```text
env -u TAURI_SIGNING_PRIVATE_KEY -u TAURI_SIGNING_PRIVATE_KEY_PASSWORD   pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis,msi --ci
```

ZIP 按发布工作流同样的方式由 `skillport.exe` 生成（`Compress-Archive`），放在会话 scratchpad，不进仓库。

| 产物 | 路径 | 大小 | Authenticode | SHA-256 |
| --- | --- | --- | --- | --- |
| NSIS 安装器 | `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/SkillPort_1.1.0_x64-setup.exe` | 13,959,885 B（13.3 MiB） | NotSigned | `F14AC711F063719F6FA0A72AAE5F43AE0F9161A2ED96E39DDB25217AC15A5AE7` |
| MSI 安装器 | `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/SkillPort_1.1.0_x64_en-US.msi` | 19,709,952 B（18.8 MiB） | NotSigned | `C7759556154707266ECB8A0695088CF87E135D3479D34A15FC4AF0B11921B476` |
| 主程序 | `src-tauri/target/x86_64-pc-windows-msvc/release/skillport.exe` | 50,993,152 B（48.6 MiB） | NotSigned | `F85052B47907AAE0B63BBDD2076338BD6286C89F48BCFC7CD6A16C38AFE4E813` |
| ZIP（scratch） | `skillport_1.1.0_windows_x64.zip`（`skillport.exe` 单文件） | 17,076,934 B（16.3 MiB） | 不适用 | `C38271198FB032E71B2A5F11792183C9BC2929A26D10568DF07E59E7CE91923B` |

注意：本地产物名是 Tauri 默认名（`SkillPort_1.1.0_x64-setup.exe` / `..._x64_en-US.msi`）；发布工作流会改名为 `skillport_1.1.0_windows_x64_nsis.exe` / `skillport_1.1.0_windows_x64.msi` 并补齐 `.sig` 与 `latest.json`。

构建日志摘要：

- `beforeBuildCommand`（`pnpm build`）：Vite 生产构建成功，仅有既有的 chunk 体积提示（`build.chunkSizeWarningLimit`）。
- Rust：`Finished release profile [optimized]`，无编译警告；`mbx[warning]: rustc cache bypassed ...` 来自本机编译缓存包装器，与产物无关。
- 打包：`makensis` 生成 NSIS，WiX `candle` / `light` 生成 MSI；`Finished 2 bundles`。
- 未生成 updater 产物（`createUpdaterArtifacts: false`），没有 `.sig` / `latest.json`；内置 updater 公钥仍是占位符（`TAURI_UPDATER_PUBLIC_KEY_PLACEHOLDER_REPLACE_IN_RELEASE_CONFIG`）。
- 未对任何文件做 Authenticode 签名（Get-AuthenticodeSignature = `NotSigned`）。

**未做**：安装、升级、卸载、启动任何构建产物（真实工作站安全约束）。

## 2. 手动验收清单（全部 UNVERIFIED）

### 2.0 准备（必读）

- **隔离环境**：在虚拟机、Windows Sandbox 之外的独立测试机，或**另一个 Windows 用户账户**中执行。SkillPort 的数据在当前用户下：`%USERPROFILE%\.skillsmanage\`（SQLite、Central 技能库、设置，含字体与窗口材质偏好），WebView2 数据（含主题 localStorage）在 `%LOCALAPPDATA%\com.bahayonghang.skillport\`。不要在日常账户上做升级测试。
  - Windows Sandbox 可用于安装 / 升级 / 卸载流程检查，但其窗口合成与实机不同；Mica、闪屏与 DPI 条目以实机或完整虚拟机为准。
- 需要的安装包：1.0.2 正式版 NSIS（GitHub Release `skillport_1.0.2_windows_x64_nsis.exe` 或同版本 `*-setup.exe`），以及本次构建的 1.1.0 NSIS（见 §1）。本次构建**未签名**：SmartScreen 会提示「未知发布者」，选择「仍要运行」；这与正式发布的 Authenticode 签名包不同。
- 本次构建的 updater 公钥是占位符，应用内「检查更新」会失败或 fail closed，这是预期行为，不在本清单验收范围。
- 每一步记录：OS 版本与 build（`winver`）、显示缩放比例、截图文件名、结果（PASS / FAIL + 现象）。

### 2.1 Win11：1.0.2 → 1.1.0 升级（Macchiato + Peach → 深色玻璃，正文 → Geist）

1. [ ] 全新环境安装 1.0.2，首启完成引导。
2. [ ] 设置 → 外观：主题选 **Macchiato**，accent 选 **Peach**；正文字体保持默认（JetBrains Mono），不设置自定义字体。
3. [ ] 导入或新建至少 3 个技能，其中至少 1 个安装到某个平台（如 Claude Code）；建 1 个集合。记录技能数、平台安装数与集合名。
4. [ ] 退出 1.0.2（确认托盘 / 进程已退出）。
5. [ ] 运行 1.1.0 NSIS 覆盖安装（不先卸载）。
6. [ ] 首启期望：
   - [ ] 启动过程无白闪、无透明穿透（窗口先显示不透明的深色背景，再透出 Mica）。
   - [ ] 主题为**深色玻璃**；侧栏底部按钮显示「浅色模式 / Light mode」。
   - [ ] 设置 → 外观 中不存在 accent / 强调色选择器，只有「浅色玻璃 / 深色玻璃」两张主题卡，深色被选中。
   - [ ] 正文字体为 **Geist**（无衬线）；设置 → 外观 → 字体 中正文字体显示 Geist；代码、路径、ID 仍为等宽。
   - [ ] 技能数、平台安装、集合与升级前一致（无数据丢失）；Central 卡片可正常打开详情。
7. [ ] 重启应用一次：主题仍为深色玻璃、正文仍为 Geist（迁移只执行一次，不回退）。
8. [ ] 在 设置 → 外观 把正文改回 JetBrains Mono，重启：保持 JetBrains Mono（一次性迁移标记生效，不会再次改成 Geist）。

### 2.2 Win11：1.0.2 Latte + Cascadia Code → 浅色玻璃，字体保留

1. [ ] 新的干净环境（或卸载并删除上一轮的 `%USERPROFILE%\.skillsmanage` 与 `%LOCALAPPDATA%\com.bahayonghang.skillport`，**仅限测试环境**）安装 1.0.2。
2. [ ] 主题选 **Latte**；正文字体选「自定义」并填 **Cascadia Code**（确认系统已安装该字体）。
3. [ ] 退出后覆盖安装 1.1.0。
4. [ ] 期望：主题为**浅色玻璃**；正文仍为 **Cascadia Code**（自定义字体不被迁移覆盖）；设置 → 外观 → 字体 中正文字体仍为自定义且字体名为 Cascadia Code。
5. [ ] （可选）用 Claude 亮色 / Claude 暗色、Frappé、Mocha 各重复一次，期望分别为浅色 / 深色 / 深色 / 深色玻璃。

### 2.3 Win11：Mica 开关

1. [ ] 1.1.0 首启（无偏好）：设置 → 外观 → 窗口材质 开关默认**开启**；窗口背景透出桌面壁纸色调（Mica），面板仍可读。
2. [ ] 切换 浅色 ↔ 深色玻璃：Mica 底色随明暗切换（浅色时偏亮、深色时偏暗），切换过程无闪烁、无颜色过渡残影。
3. [ ] 关闭开关：窗口立即变为不透明的玻璃渐变背景；重启后保持关闭。
4. [ ] 重新开启：再次透出 Mica；重启后保持开启。
5. [ ] 窗口失去焦点（点击其他窗口）：Mica 退化为纯色（系统行为），文字对比度仍正常；重新激活后恢复。
6. [ ] 在 Mica 开启下打开对话框（如 GitHub 导入）、菜单、Toast：浮层不透明度足够，正文可读。

### 2.4 Win10：不透明降级

1. [ ] Win10（build < 22000）全新安装 1.1.0。
2. [ ] 启动全过程：**无透明穿透**（看不到窗口后面的桌面 / 其他窗口）、无白闪。
3. [ ] 背景为不透明的薄荷 → 薰衣草渐变（深色主题为深墨渐变）。
4. [ ] 设置 → 外观 → 窗口材质：开关不可用或显示「Mica 需要 Windows 11，本系统保持不透明背景」。
5. [ ] 切换明暗、最小化 / 还原、最大化 / 还原、拖动窗口：任何时候都不出现透明区域。
6. [ ] （可选）1.0.2 → 1.1.0 升级在 Win10 上重复 §2.1 的步骤 6 的数据与主题检查。

### 2.5 启动闪屏

1. [ ] 冷启动（重启电脑后首次打开）与热启动各 3 次，亮 / 暗各至少 1 次：
   - [ ] 启动卡片（startup card）与应用 canvas 颜色一致，不出现 1.0.x 的 Catppuccin 深紫底色（`#1e1e2e`）。
   - [ ] 没有白色或黑色整窗闪烁；从启动卡片到主界面过渡平滑。
   - [ ] Mica 开启时，Mica 只在主界面出现后才透出（先不透明、后通透）。
2. [ ] 若可以，用手机慢动作或屏幕录制（≥ 60fps）记录一次冷启动，存档备查。

### 2.6 窗口缩放与 DPI

1. [ ] 显示缩放 100%、125%、150%（及可用时 175% / 200%）下分别启动：
   - [ ] 侧栏、卡片、对话框边缘无锯齿 / 错位的透明缝；1px 白描边可见且不模糊成 2px。
   - [ ] Mica 开启时窗口四周无透明边框或黑边。
2. [ ] 将窗口拉到最小 900×600：无横向滚动、无裁切；Central 页面标题区按钮换行。
3. [ ] 最大化 / 还原、贴靠（Win+←/→）、跨显示器拖动（不同缩放比例的两块屏）：重绘无白闪、无残影，Mica 跟随。
4. [ ] Central ≥ 300 个技能网格快速滚动、Dashboard 与 技能使用 页滚动：无明显掉帧（父任务 AC4，可用任务管理器 GPU 曲线或录屏辅助判断）。

### 2.7 卸载

1. [ ] 控制面板 / 设置 → 应用 中卸载 SkillPort 1.1.0（NSIS currentUser 安装）。
2. [ ] 卸载程序正常结束；开始菜单与桌面快捷方式被移除；安装目录被删除。
3. [ ] 记录卸载后 `%USERPROFILE%\.skillsmanage\` 与 `%LOCALAPPDATA%\com.bahayonghang.skillport\` 是否保留（预期：用户数据默认保留；记录实际行为即可）。
4. [ ] 重新安装 1.1.0：保留的数据与偏好（主题、字体、窗口材质）被正确读取。
5. [ ] （MSI）用本次构建的 MSI 重复安装 → 启动 → 卸载一次，确认与 NSIS 行为一致。

## 3. 未覆盖 / UNVERIFIED

- 上述 §2 全部条目：**UNVERIFIED**（本任务未在任何机器上安装或运行构建产物）。
- Authenticode 签名、updater `.sig`、`latest.json`：本次构建未签名、未生成 updater 产物，**UNVERIFIED**；须由发布工作流按「Authenticode → updater 签名 → 元数据」顺序生成。
- 受控 `windows-2022` NSIS / MSI 安装冒烟（`windows-install-smoke`）：**UNVERIFIED**，需在发布工作流中运行。
- ARM64 Windows、Windows Server、Windows 11 早期 build（22000–22522，`Effect::Mica` 的旧路径）、高对比度模式、多显示器混合 DPI 的组合：**UNVERIFIED**。
- macOS / Linux 安装包：不在本次构建范围。
