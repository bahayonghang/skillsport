const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

let repo = __dirname;
while (!fs.existsSync(path.join(repo, 'package.json'))) {
  const parent = path.dirname(repo);
  if (parent === repo) throw new Error('Repository root not found');
  repo = parent;
}
const fixture = path.join(repo, 'outputs', 'usage-native-smoke-profile');
const release = process.argv.includes('--release');
const executable = path.join(repo, 'src-tauri', 'target', release ? 'release' : 'debug', 'skillport.exe');
if (!fs.existsSync(path.join(fixture, '.skillsmanage', 'db.sqlite'))) {
  throw new Error('Prepare the isolated fixture before launching');
}
if (!fs.existsSync(executable)) throw new Error('Build the native executable first');
const taskEnv = {
  ...process.env,
  USERPROFILE: fixture,
  LOCALAPPDATA: path.join(fixture, 'AppData', 'Local'),
  APPDATA: path.join(fixture, 'AppData', 'Roaming'),
  WEBVIEW2_USER_DATA_FOLDER: path.join(fixture, 'WebView2'),
};
// Only the child environment is isolated; no global HOME/CODEX_HOME is changed.
delete taskEnv.CODEX_HOME;
delete taskEnv.CLAUDE_CONFIG_DIR;
const log = fs.openSync(path.join(fixture, 'native-process.log'), 'a');
const child = spawn(executable, [], {
  cwd: repo,
  env: taskEnv,
  detached: true,
  // Release uses the Windows GUI subsystem; let the app show its own window.
  windowsHide: !release,
  stdio: ['ignore', log, log],
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.unref();
fs.closeSync(log);
fs.writeFileSync(path.join(fixture, 'process.json'), JSON.stringify({pid:child.pid,executable,profile:fixture}));
console.log(JSON.stringify({pid:child.pid,executable,profile:fixture}));
