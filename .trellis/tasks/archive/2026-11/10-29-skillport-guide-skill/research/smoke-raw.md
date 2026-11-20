### CLI version

```text
cwd: $TMP_HOME
$ skillport-cli --version
exit: 0
```

stdout:

```json
skillport-cli 1.1.1
```

### List agents

```text
cwd: $TMP_HOME
$ skillport-cli --json agents list
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":[{"displayName":"Aider","enabled":false,"globalSkillsDir":"$TMP_HOME\\.aider\\skills","id":"aider"},{"displayName":"Amp","enabled":false,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"amp"},{"displayName":"Antigravity","enabled":true,"globalSkillsDir":"$TMP_HOME\\.gemini\\config\\skills","id":"antigravity"},{"displayName":"Augment","enabled":false,"globalSkillsDir":"$TMP_HOME\\.augment\\skills","id":"augment"},{"displayName":"AutoClaw","enabled":false,"globalSkillsDir":"$TMP_HOME\\.openclaw-autoclaw\\skills","id":"autoclaw"},{"displayName":"Claude Code","enabled":true,"globalSkillsDir":"$TMP_HOME\\.claude\\skills","id":"claude-code"},{"displayName":"Cline","enabled":false,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"cline"},{"displayName":"CodeBuddy","enabled":false,"globalSkillsDir":"$TMP_HOME\\.codebuddy\\skills","id":"codebuddy"},{"displayName":"Codex CLI","enabled":true,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"codex"},{"displayName":"Cursor","enabled":false,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"cursor"},{"displayName":"Deep Agents","enabled":false,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"deep-agents"},{"displayName":"EasyClaw","enabled":false,"globalSkillsDir":"$TMP_HOME\\.easyclaw\\skills","id":"easyclaw"},{"displayName":"Factory Droid","enabled":false,"globalSkillsDir":"$TMP_HOME\\.factory\\skills","id":"factory-droid"},{"displayName":"Firebender","enabled":false,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"firebender"},{"displayName":"Gemini CLI (legacy)","enabled":false,"globalSkillsDir":"$TMP_HOME\\.gemini\\skills","id":"gemini-cli"},{"displayName":"GitHub Copilot","enabled":false,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"copilot"},{"displayName":"Grok","enabled":true,"globalSkillsDir":"$TMP_HOME\\.grok\\skills","id":"grok"},{"displayName":"Hermes","enabled":false,"globalSkillsDir":"$TMP_HOME\\.hermes\\skills","id":"hermes"},{"displayName":"Junie","enabled":false,"globalSkillsDir":"$TMP_HOME\\.junie\\skills","id":"junie"},{"displayName":"KiloCode","enabled":false,"globalSkillsDir":"$TMP_HOME\\.kilocode\\skills","id":"kilocode"},{"displayName":"Kimi Code CLI","enabled":false,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"kimi-code-cli"},{"displayName":"Kiro","enabled":true,"globalSkillsDir":"$TMP_HOME\\.kiro\\skills","id":"kiro"},{"displayName":"OB1","enabled":false,"globalSkillsDir":"$TMP_HOME\\.ob1\\skills","id":"ob1"},{"displayName":"OpenClaw","enabled":false,"globalSkillsDir":"$TMP_HOME\\.openclaw\\skills","id":"openclaw"},{"displayName":"OpenCode","enabled":true,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"opencode"},{"displayName":"QClaw","enabled":false,"globalSkillsDir":"$TMP_HOME\\.qclaw\\skills","id":"qclaw"},{"displayName":"Qoder","enabled":false,"globalSkillsDir":"$TMP_HOME\\.qoder\\skills","id":"qoder"},{"displayName":"Qwen","enabled":false,"globalSkillsDir":"$TMP_HOME\\.qwen\\skills","id":"qwen"},{"displayName":"Reasonix","enabled":false,"globalSkillsDir":"$TMP_HOME\\.reasonix\\skills","id":"reasonix"},{"displayName":"Trae","enabled":false,"globalSkillsDir":"$TMP_HOME\\.trae\\skills","id":"trae"},{"displayName":"Trae CN","enabled":false,"globalSkillsDir":"$TMP_HOME\\.trae-cn\\skills","id":"trae-cn"},{"displayName":"Warp","enabled":false,"globalSkillsDir":"$TMP_HOME\\.agents\\skills","id":"warp"},{"displayName":"Windsurf","enabled":false,"globalSkillsDir":"$TMP_HOME\\.windsurf\\skills","id":"windsurf"},{"displayName":"WorkBuddy","enabled":false,"globalSkillsDir":"$TMP_HOME\\.workbuddy\\skills-marketplace\\skills","id":"workbuddy"},{"displayName":"Zed","enabled":false,"globalSkillsDir":"$TMP_HOME\\.config\\zed\\skills","id":"zed"}],"warnings":[]}
```

### Import guide skill (dry run)

```text
cwd: $TMP_HOME
$ skillport-cli --json skills import --from-dir <repo>\skills\skillport --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"action":"create","exists":false,"fileCount":null,"method":null,"skillId":"skillport","skillName":"skillport","sourceType":"dir","syncAgents":[],"targetPath":"$TMP_HOME\\.skillsmanage\\skills\\skillport","totalBytes":null}],"result":null},"warnings":[]}
```

### Import guide skill

```text
cwd: $TMP_HOME
$ skillport-cli --json skills import --from-dir <repo>\skills\skillport
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":false,"plans":[{"action":"create","exists":false,"fileCount":null,"method":null,"skillId":"skillport","skillName":"skillport","sourceType":"dir","syncAgents":[],"targetPath":"$TMP_HOME\\.skillsmanage\\skills\\skillport","totalBytes":null}],"result":{"replacedExisting":false,"skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","sync":null,"syncError":null}},"warnings":[]}
```

### Import again without --replace

```text
cwd: $TMP_HOME
$ skillport-cli --json skills import --from-dir <repo>\skills\skillport
exit: 3
```

stderr:

```json
{"schemaVersion":1,"ok":false,"error":{"code":"skill.duplicate","message":"Skill 'skillport' already exists; pass --replace to overwrite it","details":{}}}
```

### List Central skills

```text
cwd: $TMP_HOME
$ skillport-cli --json skills list
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":[{"canonicalPath":"$TMP_HOME\\.skillsmanage\\skills\\skillport","description":"Operate the user's local SkillPort skill library through `skillport-cli`: list and inspect Central skills, import a skill from a local folder or ZIP, sync or unlink skills for global agents, register the current project and install skills into it, add or remove tags, and read or write skill notes. Use when the user mentions SkillPort, or asks to manage skills, install a skill into this project, tag skills, or write a skill description / 管理技能、把技能装到当前项目、给技能打标签、写技能说明. Not for writing a new SKILL.md from scratch or editing third-party skill content.","id":"skillport","linkedAgents":[],"name":"skillport","uid":"a6a66818-34d5-4f30-aac9-70335e07f659"}],"warnings":[]}
```

### Sync to Claude Code (dry run)

```text
cwd: $TMP_HOME
$ skillport-cli --json skills sync skillport --agent claude-code --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"agentId":"claude-code","id":"skillport","method":"auto","targetPath":"$TMP_HOME\\.claude\\skills\\skillport","uid":"a6a66818-34d5-4f30-aac9-70335e07f659"}],"result":null},"warnings":[]}
```

### Sync to Claude Code

```text
cwd: $TMP_HOME
$ skillport-cli --json skills sync skillport --agent claude-code
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":false,"plans":[{"agentId":"claude-code","id":"skillport","method":"auto","targetPath":"$TMP_HOME\\.claude\\skills\\skillport","uid":"a6a66818-34d5-4f30-aac9-70335e07f659"}],"result":{"failed":[],"skipped":[],"succeeded":[{"agent_id":"claude-code","skill_id":"skillport","target_path":"$TMP_HOME\\.claude\\skills\\skillport"}]}},"warnings":[]}
```

### Register project (dry run)

```text
cwd: $TMP_HOME/sample-project
$ skillport-cli --json projects add . --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"exists":false,"id":"161cfe07d7463f0a","name":"sample-project","path":"$TMP_HOME/sample-project"}],"result":null},"warnings":[]}
```

### Register project

```text
cwd: $TMP_HOME/sample-project
$ skillport-cli --json projects add .
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":false,"plans":[{"exists":false,"id":"161cfe07d7463f0a","name":"sample-project","path":"$TMP_HOME/sample-project"}],"result":{"created":true,"project":{"id":"161cfe07d7463f0a","name":"sample-project","path":"$TMP_HOME/sample-project","pinned":false},"skillCount":0}},"warnings":[]}
```

### List projects

```text
cwd: $TMP_HOME
$ skillport-cli --json projects list
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":[{"id":"161cfe07d7463f0a","name":"sample-project","path":"$TMP_HOME/sample-project","pinned":false}],"warnings":[]}
```

### Install into project (dry run)

```text
cwd: $TMP_HOME/sample-project
$ skillport-cli --json projects install . skillport --agent claude-code --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"action":"install","agentId":"claude-code","alreadyInstalled":false,"method":"symlink","projectId":"161cfe07d7463f0a","projectPath":"$TMP_HOME/sample-project","skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","targetPath":"$TMP_HOME/sample-project\\.claude/skills\\skillport"}],"result":null},"warnings":[]}
```

### Install into project

```text
cwd: $TMP_HOME/sample-project
$ skillport-cli --json projects install . skillport --agent claude-code --yes
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":false,"plans":[{"action":"install","agentId":"claude-code","alreadyInstalled":false,"method":"symlink","projectId":"161cfe07d7463f0a","projectPath":"$TMP_HOME/sample-project","skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","targetPath":"$TMP_HOME/sample-project\\.claude/skills\\skillport"}],"result":{"failed":[],"skipped":[],"succeeded":[{"agentId":"claude-code","installedPath":"$TMP_HOME/sample-project/.claude/skills/skillport","skillId":"skillport"}]}},"warnings":[]}
```

### Project skills

```text
cwd: $TMP_HOME/sample-project
$ skillport-cli --json projects skills .
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":[{"agentDisplayName":"Claude Code","agentId":"claude-code","description":"Operate the user's local SkillPort skill library through `skillport-cli`: list and inspect Central skills, import a skill from a local folder or ZIP, sync or unlink skills for global agents, register the current project and install skills into it, add or remove tags, and read or write skill notes. Use when the user mentions SkillPort, or asks to manage skills, install a skill into this project, tag skills, or write a skill description / 管理技能、把技能装到当前项目、给技能打标签、写技能说明. Not for writing a new SKILL.md from scratch or editing third-party skill content.","installedPath":"$TMP_HOME/sample-project/.claude/skills/skillport","linkType":"symlink","name":"skillport","skillId":"skillport"}],"warnings":[]}
```

### List tags

```text
cwd: $TMP_HOME
$ skillport-cli --json tags list
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":[{"color":"#6366f1","description":"LLM prompts, agents, RAG, model integration workflows.","group":null,"id":"ai-prompt-engineering","name":"AI 与提示工程"},{"color":"#f97316","description":"CI/CD, containers, infrastructure, release and ops automation.","group":null,"id":"devops-deployment","name":"DevOps 与部署"},{"color":"#3b82f6","description":"Web UI, React/Vue, CSS, component and page building.","group":null,"id":"frontend-development","name":"前端开发"},{"color":"#a16207","description":"Word/Excel/PPT/PDF creation and manipulation.","group":null,"id":"office-documents","name":"办公文档"},{"color":"#8b5cf6","description":"Server-side APIs, databases, business logic, system services.","group":null,"id":"backend-development","name":"后端开发"},{"color":"#0891b2","description":"Paper search, academic writing, slides, and research workflows.","group":null,"id":"academic-research-writing","name":"学术研究与写作"},{"color":"#64748b","description":"Automation scripts, CLI helpers, personal productivity.","group":null,"id":"productivity-tools","name":"效率与工具"},{"color":"#14b8a6","description":"Data processing, SQL, visualization, reports and analytics.","group":null,"id":"data-analysis","name":"数据与分析"},{"color":"#eab308","description":"Technical docs, README, blogs, general writing and editing.","group":null,"id":"docs-writing","name":"文档与写作"},{"color":"#71717a","description":"Fallback category for skills that still need review.","group":null,"id":"uncategorized","name":"未分类"},{"color":"#22c55e","description":"Test writing, code review, linting, QA workflows.","group":null,"id":"testing-quality","name":"测试与质量"},{"color":"#ec4899","description":"Visual design, prototyping, design systems, UX polish.","group":null,"id":"design-ui","name":"设计与 UI"}],"warnings":[]}
```

### Add unknown tag

```text
cwd: $TMP_HOME
$ skillport-cli --json tags add skillport --tag agent-guide --dry-run
exit: 3
```

stderr:

```json
{"schemaVersion":1,"ok":false,"error":{"code":"tag.not_found","message":"Tag 'agent-guide' not found","details":{}}}
```

### Create tag (dry run)

```text
cwd: $TMP_HOME
$ skillport-cli --json tags create agent-guide --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"color":null,"description":null,"exists":false,"group":null,"id":"agent-guide","name":"agent-guide"}],"result":null},"warnings":[]}
```

### Create tag

```text
cwd: $TMP_HOME
$ skillport-cli --json tags create agent-guide
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":false,"plans":[{"color":null,"description":null,"exists":false,"group":null,"id":"agent-guide","name":"agent-guide"}],"result":{"created":true,"tag":{"color":null,"description":null,"group":null,"id":"agent-guide","name":"agent-guide"}}},"warnings":[]}
```

### Add tag (dry run)

```text
cwd: $TMP_HOME
$ skillport-cli --json tags add skillport --tag agent-guide --reason Guide skill for SkillPort CLI --confidence 0.9 --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"action":"link","alreadyLinked":false,"currentSource":null,"skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","tagId":"agent-guide","tagName":"agent-guide"}],"result":null},"warnings":[]}
```

### Add tag

```text
cwd: $TMP_HOME
$ skillport-cli --json tags add skillport --tag agent-guide --reason Guide skill for SkillPort CLI --confidence 0.9 --yes
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":false,"plans":[{"action":"link","alreadyLinked":false,"currentSource":null,"skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","tagId":"agent-guide","tagName":"agent-guide"}],"result":{"linked":1,"queued":0,"removed":0}},"warnings":[]}
```

### Read note (none yet)

```text
cwd: $TMP_HOME
$ skillport-cli --json --lang en notes get skillport
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"explanation":null,"id":"skillport","lang":"en","uid":"a6a66818-34d5-4f30-aac9-70335e07f659"},"warnings":[]}
```

### Write note (dry run)

```text
cwd: $TMP_HOME
$ skillport-cli --json --lang en notes set skillport --file $TMP_HOME\note.md --author claude-code --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"bytes":226,"id":"skillport","lang":"en","model":"agent:claude-code","previousModel":null,"replacesExisting":false,"uid":"a6a66818-34d5-4f30-aac9-70335e07f659"}],"result":null},"warnings":[]}
```

### Write note

```text
cwd: $TMP_HOME
$ skillport-cli --json --lang en notes set skillport --file $TMP_HOME\note.md --author claude-code --yes
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":false,"plans":[{"bytes":226,"id":"skillport","lang":"en","model":"agent:claude-code","previousModel":null,"replacesExisting":false,"uid":"a6a66818-34d5-4f30-aac9-70335e07f659"}],"result":{"explanation":{"lang":"en","model":"agent:claude-code","text":"Guides coding agents to manage the local SkillPort library through skillport-cli.\nUse it to import skills, install them into projects, tag them, and write notes.\nEvery write runs as a dry run first and needs user confirmation."},"id":"skillport","lang":"en","uid":"a6a66818-34d5-4f30-aac9-70335e07f659"}},"warnings":[]}
```

### Overwrite note without --yes

```text
cwd: $TMP_HOME
$ skillport-cli --json --lang en notes set skillport --text Replacement text. --author claude-code
exit: 2
```

stderr:

```json
{"schemaVersion":1,"ok":false,"error":{"code":"input.confirmation_required","message":"This operation requires confirmation; review details.plans and rerun with --yes","details":{"plans":[{"bytes":17,"id":"skillport","lang":"en","model":"agent:claude-code","previousModel":"agent:claude-code","replacesExisting":true,"uid":"a6a66818-34d5-4f30-aac9-70335e07f659"}]}}}
```

### Show skill

```text
cwd: $TMP_HOME
$ skillport-cli --json --lang en skills show skillport
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"canonicalPath":"$TMP_HOME\\.skillsmanage\\skills\\skillport","description":"Operate the user's local SkillPort skill library through `skillport-cli`: list and inspect Central skills, import a skill from a local folder or ZIP, sync or unlink skills for global agents, register the current project and install skills into it, add or remove tags, and read or write skill notes. Use when the user mentions SkillPort, or asks to manage skills, install a skill into this project, tag skills, or write a skill description / 管理技能、把技能装到当前项目、给技能打标签、写技能说明. Not for writing a new SKILL.md from scratch or editing third-party skill content.","explanation":{"lang":"en","model":"agent:claude-code","text":"Guides coding agents to manage the local SkillPort library through skillport-cli.\nUse it to import skills, install them into projects, tag them, and write notes.\nEvery write runs as a dry run first and needs user confirmation."},"id":"skillport","linkedAgents":["claude-code"],"name":"skillport","projects":[{"agentId":"claude-code","installedPath":"$TMP_HOME/sample-project/.claude/skills/skillport","linkType":"symlink","name":"sample-project","path":"$TMP_HOME/sample-project","projectId":"161cfe07d7463f0a"}],"tags":[{"id":"agent-guide","name":"agent-guide","source":"agent"}],"uid":"a6a66818-34d5-4f30-aac9-70335e07f659"},"warnings":[]}
```

### Unlink without --yes

```text
cwd: $TMP_HOME
$ skillport-cli --json skills unlink skillport --agent claude-code
exit: 2
```

stderr:

```json
{"schemaVersion":1,"ok":false,"error":{"code":"input.confirmation_required","message":"This operation requires confirmation; review details.plans and rerun with --yes","details":{"plans":[{"agentId":"claude-code","installed":true,"linkType":"symlink","skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","targetPath":"$TMP_HOME\\.claude\\skills\\skillport"}]}}}
```

### Project uninstall (dry run)

```text
cwd: $TMP_HOME/sample-project
$ skillport-cli --json projects uninstall . skillport --agent claude-code --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"action":"uninstall","agentId":"claude-code","alreadyInstalled":true,"method":null,"projectId":"161cfe07d7463f0a","projectPath":"$TMP_HOME/sample-project","skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","targetPath":"$TMP_HOME/sample-project/.claude/skills/skillport"}],"result":null},"warnings":[]}
```

### Remove tag (dry run)

```text
cwd: $TMP_HOME
$ skillport-cli --json tags remove skillport --tag agent-guide --dry-run
exit: 0
```

stdout:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[{"action":"unlink","alreadyLinked":true,"currentSource":"agent","skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","tagId":"agent-guide","tagName":"agent-guide"}],"result":null},"warnings":[]}
```

### Filesystem checks

- Central copy has SKILL.md: True
- Central copy has references/: True
- Claude Code global skill installed: True
- Project skill installed: True
