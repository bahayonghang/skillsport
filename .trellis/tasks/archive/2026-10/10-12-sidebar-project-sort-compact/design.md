# 设计提案

推荐 ArrowUpDown + Button ghost + 已有 @base-ui/react/menu。可见size-8，预留40px操作槽，以既有after:size-10模式扩展热区，不覆盖flex-1折叠按钮。图标沿用size-3.5或size-4，实际光学对齐用渲染验证。

菜单三项使用单选语义和当前项提示；触发器有“项目排序”和当前方式的翻译说明，可通过提示/accessible description与菜单获知当前值。保持hover、focus、expanded反馈，无额外动画。
备选为ghost图标加短文本，可读性更直接但占宽更多；推荐纯图标，实施前随方案审阅。

修改拥有控件的src/components/layout/SidebarSection.tsx，必要时补src/i18n/locales/en.json与zh.json。Sidebar.tsx、sidebarWorkspacePrefs.ts的onChange、排序及持久化链不改。参考CentralSkillsShellMenus.tsx的primitive模式，不新增通用菜单框架或迁移Central模块。

Global Workspace没有sort属性，不出现新控件或行高改变。无数据迁移，本子任务可独立回退UI/翻译/测试。
