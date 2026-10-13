"""Document the user's accepted scope before committing and archiving."""
from pathlib import Path
import json
import re

root = next(p for p in Path(__file__).resolve().parents if (p / "package.json").is_file())
tasks = root / ".trellis/tasks"
parent = tasks / "10-12-skill-usage-optimization"
visual = tasks / "10-12-skill-usage-visual-polish"
performance = tasks / "10-12-skill-usage-performance"

for folder, criteria in [(parent, [1, 2, 3, 4, 6]), (visual, [1, 2, 3, 4, 5, 6]), (performance, [1, 2, 3, 4, 5, 6, 9])]:
    path = folder / "prd.md"
    text = path.read_text(encoding="utf-8")
    prefix = "AC" if folder == parent else "VA" if folder == visual else "PA"
    for criterion in criteria:
        text = text.replace(f"- [ ] {prefix}{criterion}", f"- [x] {prefix}{criterion}")
    if folder == parent:
        text = text.replace("本轮交付深入分析与可执行的 Trellis 任务树。用户已明确授权创建任务；所有任务保持 `planning`，实施需要后续确认规划。本轮不修改产品代码。", "规划及实施均已获用户授权。2026-10-13 用户人工验证后要求按当前结果收尾；完整证据与接受的限制见 `research/integration-verification.md`。")
    text += "\n## 最终验收与关闭\n\n2026-10-13 用户声明人工验证完成并接受当前结果收尾。技术证据见父任务 `research/integration-verification.md`；未勾选的数值指标保持未通过，不作为继续实施的本轮要求。PA7 memory 冷扫中位回退 19.2%，PA8 生产 paint/source/unused 完整对照以及父 AC5 的部分计时证据均按已知限制记录。CI 与 Windows bundle 均通过。\n"
    path.write_text(text, encoding="utf-8")
    path = folder / "implement.md"
    text = path.read_text(encoding="utf-8")
    # Native automatic coverage is deliberately narrower than the full matrix.
    excluded = 4 if folder == parent else 8 if folder == visual else 8
    for step in range(1, 12):
        if step != excluded and not (folder == performance and step == 10):
            text = re.sub(rf"^{step}\. \[ \]", f"{step}. [x]", text, flags=re.MULTILINE)
    text += "\n## 收尾结果\n\n用户已批准实施并人工验收当前结果，原“本轮只规划”描述为历史计划。产品代码与生成物质量门通过；原生自动验证限冷首屏/最大化，其余以单元/浏览器和用户人工验收为证据。剩余数值及完整 native trace 指标按接受的限制关闭，未虚构通过。\n"
    path.write_text(text, encoding="utf-8")
    path = folder / "task.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["notes"] = "2026-10-13 用户人工验证并要求按当前结果收尾；just ci 与 Windows x64 NSIS build 通过，接受并保留 memory 冷扫19.2%和生产分阶段计时缺口。"
    data["meta"].update(planning_only=False, implementation_approved=True, human_validation_accepted=True, closure_kind="accepted_with_known_limits", acceptance_record="research/integration-verification.md" if folder == parent else "../10-12-skill-usage-optimization/research/integration-verification.md")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
