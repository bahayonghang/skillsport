import json
import time
from pathlib import Path

repo = Path(__file__).resolve().parents[5]
fixture = repo / 'outputs' / 'usage-native-smoke-profile'
assert fixture.is_relative_to(repo / 'outputs')
app_data = fixture / '.skillsmanage'
app_data.mkdir(parents=True, exist_ok=True)
database = app_data / 'db.sqlite'
# The existing file selects this isolated Windows profile before legacy HOME fallback.
if not database.exists():
    database.touch()
history_dir = fixture / '.claude'
history_dir.mkdir(exist_ok=True)
now_ms = int(time.time() * 1000)
rows = [
    {
        'display': f'/native-skill-{index % 144:03d}',
        'timestamp': now_ms - (index % 112) * 86400000 - (index // 112) * 61013,
        'project': f'D:/offline-native-fixture/project-{index % 5}',
        'sessionId': f'native-session-{index % 40}',
    }
    for index in range(1261)
]
(history_dir / 'history.jsonl').write_text(
    ''.join(json.dumps(row) + '\n' for row in rows), encoding='utf-8'
)
(fixture / 'AppData' / 'Local').mkdir(parents=True, exist_ok=True)
(fixture / 'AppData' / 'Roaming').mkdir(parents=True, exist_ok=True)
print(json.dumps({'profile': str(fixture), 'calls': 1261, 'skills': 144}))
