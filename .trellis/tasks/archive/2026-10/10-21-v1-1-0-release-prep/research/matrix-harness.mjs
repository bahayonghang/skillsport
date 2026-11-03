// C9 visual matrix harness (headless Chrome CDP against `pnpm dev` browser fixtures).
// usage: node c9-matrix.mjs <outDir> [filterRegex] [--dpr=2] [--png]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const outDir = args[0];
const filter = args[1] && !args[1].startsWith("--") ? new RegExp(args[1]) : null;
const dpr = Number((args.find((a) => a.startsWith("--dpr=")) ?? "--dpr=1").slice(6));
const asPng = args.includes("--png");
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7);
mkdirSync(outDir, { recursive: true });

const BASE = "http://localhost:24200";
const PORT = 9351;
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDir = join(process.env.TEMP ?? ".", `cdp-c9-${Date.now()}`);
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDir}`,
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clickText = (scope, text, exact = false) =>
  `(() => { const b=[...document.querySelectorAll(${JSON.stringify(scope)})].find(x=>${
    exact ? `x.textContent.trim()===${JSON.stringify(text)}` : `x.textContent.includes(${JSON.stringify(text)})`
  }); b && b.click(); return !!b; })()`;

// key -> { route, eval?, waitMs? }
const ROUTES = {
  dashboard: { route: "/dashboard" },
  central: { route: "/central" },
  "platform-claude-code": { route: "/platform/claude-code" },
  "platform-codex": { route: "/platform/codex" },
  rules: { route: "/rules" },
  "skills-cli": { route: "/skills-cli" },
  projects: { route: "/projects" },
  "projects-detail": {
    route: "/projects",
    afterEvalMs: 1500,
    // Browser fixtures have no projects; inject a scratch-only project into the
    // live store + IPC fixture registry (no repository change).
    eval: `(async()=>{
      const ipc=await import('/src/lib/ipc/index.ts');
      const st=await import('/src/stores/projectsStore.ts');
      const root='C:/Users/demo/projects/skills-manage';
      const mk=(name,agentId,agentDisplayName,origin,desc)=>({projectId:'p-skills-manage',skillId:name,name,description:desc,filePath:root+'/.'+agentId+'/skills/'+name+'/SKILL.md',sourceOrigin:origin,agentId,agentDisplayName,installedPath:root+'/.'+agentId+'/skills/'+name,linkType:origin==='central'?'symlink':'copy',symlinkTarget:null});
      const skills=[mk('frontend-design','claude-code','Claude Code','central','Create distinctive, production-grade frontend interfaces with high design quality.'),mk('release-checklist','claude-code','Claude Code','project','Project-local release checklist for the Windows installer.'),mk('code-review','grok','Grok','central','Review a diff for correctness, security and maintainability before merge.')];
      ipc.registerIpcFixtures({get_project_skills:()=>skills});
      st.useProjectsStore.setState({loadProjects:async()=>{},skillsByProject:{'p-skills-manage':skills},projects:[{id:'p-skills-manage',path:root,name:'skills-manage',pinned:true,addedAt:'2026-10-01T08:00:00Z',lastScannedAt:'2026-10-20T08:00:00Z',skillCount:3},{id:'p-docs',path:'C:/Users/demo/projects/docs',name:'docs',pinned:false,addedAt:'2026-10-02T08:00:00Z',lastScannedAt:null,skillCount:0}]});
      await new Promise(r=>setTimeout(r,400));
      const b=[...document.querySelectorAll('main button, main a')].find(x=>x.textContent.includes('skills-manage'));
      b&&b.click(); await new Promise(r=>setTimeout(r,700)); const c=[...document.querySelectorAll('main button')].find(x=>x.textContent.includes('Claude Code')); c&&c.click(); return !!b&&!!c; })()`,
  },
  discover: { route: "/discover" },
  collections: { route: "/collections" },
  marketplace: { route: "/marketplace" },
  "marketplace-import": {
    route: "/marketplace",
    afterEvalMs: 3000,
    eval: `(async()=>{const b=[...document.querySelectorAll('main button')].find(b=>b.textContent.includes('GitHub'));b&&b.click();await new Promise(r=>setTimeout(r,800));const i=document.getElementById('github-repo-url');if(!i)return false;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'https://github.com/anthropics/skills');i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));const p=[...document.querySelectorAll('[role=dialog] button')].find(b=>/预览|Preview/.test(b.textContent));p&&p.click();return true;})()`,
  },
  skill: { route: "/skill/fixture-central-skill" },
  "skill-content": {
    route: "/skill/fixture-central-skill",
    afterEvalMs: 1200,
    // Scratch-only: inject detail + SKILL.md (with a GFM table) into the live store.
    eval: `(async()=>{
      const st=await import('/src/stores/skillDetailStore.ts');
      const base='C:/Users/demo/.skillsmanage/skills/fixture-central-skill';
      const BT=String.fromCharCode(96), NL=String.fromCharCode(10);
      const md=['---','name: fixture-central-skill','description: Release checklist used to validate markdown rendering.','---','','# Release Checklist','','Run these steps before promoting a Windows build. Paths such as '+BT+'src-tauri/tauri.conf.json'+BT+' stay monospaced.','','## Artifact matrix','','| Step | Owner | Artifact | Status |','| --- | --- | --- | --- |','| Build NSIS installer | CI | skillport_1.1.0_x64-setup.exe | Done |','| Authenticode sign | Release | skillport.exe | Pending |','| Updater signature | Release | .sig + latest.json | Pending |','','> Sign the final NSIS before generating updater metadata.','',BT+BT+BT+'powershell','pnpm tauri build --bundles nsis msi',BT+BT+BT].join(NL);
      st.useSkillDetailStore.setState({isLoading:false,error:null,content:md,detail:{id:'fixture-central-skill',name:'fixture-central-skill',description:'Release checklist used to validate markdown rendering.',file_path:base+'/SKILL.md',dir_path:base,is_central:true,scanned_at:'2026-10-20T08:00:00Z',installations:[{skill_id:'fixture-central-skill',agent_id:'claude-code',installed_path:'C:/Users/demo/.claude/skills/fixture-central-skill',link_type:'symlink',installed_at:'2026-10-19T08:00:00Z'}],tags:[],collections:[]}});
      return true; })()`,
  },
  obsidian: { route: "/obsidian" },
  "obsidian-vault": { route: "/obsidian/fixture-vault" },
  logs: { route: "/logs" },
  usage: { route: "/usage" },
  "settings-appearance": { route: "/settings/appearance" },
  "settings-connections": { route: "/settings/connections" },
  "settings-platforms": { route: "/settings/platforms" },
  "settings-integrations": { route: "/settings/integrations" },
  "settings-skill-sources": { route: "/settings/skill-sources" },
  "settings-about": { route: "/settings/about" },
};

const HIGH_RISK = ["dashboard", "central", "settings-appearance", "skill", "skill-content"];
const THEMES = [
  ["light", "glass-light"],
  ["dark", "glass-dark"],
];
const LANGS = ["zh", "en"];
const SIZES = [
  [900, 600],
  [1280, 800],
  [1440, 900],
];
const SCALES = [0.875, 1, 1.125];

const shots = [];
const push = (key, theme, w, h, s, lang) =>
  shots.push({ name: `${key}-${theme[0]}-${w}x${h}-s${s}-${lang}`, key, theme: theme[1], w, h, s, lang });
for (const key of Object.keys(ROUTES))
  for (const theme of THEMES) for (const lang of LANGS) push(key, theme, 1280, 800, 1, lang);
for (const key of HIGH_RISK)
  for (const theme of THEMES)
    for (const lang of LANGS)
      for (const [w, h] of SIZES)
        for (const s of SCALES) if (!(w === 1280 && s === 1)) push(key, theme, w, h, s, lang);

if (args.includes("--readme")) {
  shots.length = 0;
  const R = [
    ["01", "central", "light"],
    ["02", "marketplace-import", "light"],
    ["03", "projects-detail", "dark"],
    ["04", "marketplace", "light"],
    ["05", "collections", "dark"],
    ["06", "platform-claude-code", "light"],
  ];
  for (const [file, key, t] of R)
    shots.push({ name: file, key, theme: `glass-${t}`, w: 1300, h: 900, s: 1, lang: "zh" });
}
const selected = shots.filter(
  (s) => (!filter || filter.test(s.name)) && (!only || only.split(",").includes(s.name)),
);

let targets;
for (let i = 0; i < 60; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.length) break;
  } catch {}
  await sleep(200);
}
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? "exception");
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { evalError: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: BASE + "/" });
await sleep(2000);

const METRICS = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const main = document.querySelector("main");
  const offRight = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.position === "fixed" && r.right <= 0) continue;
    if (r.right > vw + 1 && r.left < vw) {
      // ignore children of horizontally scrollable containers
      let p = el.parentElement, scrolls = false;
      while (p) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll" || o === "hidden" || o === "clip") && p !== document.documentElement && p !== document.body) { scrolls = true; break; } p = p.parentElement; }
      if (!scrolls) offRight.push((el.tagName + "." + String(el.className).slice(0, 60)).trim());
    }
  }
  return {
    theme: document.documentElement.dataset.theme,
    lang: document.documentElement.lang,
    fontScale: getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim(),
    docOverflowX: document.documentElement.scrollWidth > vw + 1,
    mainOverflowX: main ? main.scrollWidth > main.clientWidth + 1 : null,
    offRight: offRight.slice(0, 5),
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()).slice(0, 2),
  };
})()`;

const report = [];
for (const shot of selected) {
  const spec = ROUTES[shot.key];
  consoleErrors.length = 0;
  await send("Emulation.setDeviceMetricsOverride", {
    width: shot.w,
    height: shot.h,
    deviceScaleFactor: dpr,
    mobile: false,
  });
  await evaluate(
    `(() => { localStorage.setItem("skillport-theme", ${JSON.stringify(shot.theme)}); localStorage.setItem("i18nextLng", ${JSON.stringify(shot.lang)}); })()`,
  );
  await send("Page.navigate", { url: BASE + spec.route });
  await sleep(spec.waitMs ?? 2200);
  if (shot.s !== 1) {
    await evaluate(
      `import("/src/lib/displayFont.ts").then((m) => { m.applyFontScale(${shot.s}); return true; })`,
    );
    await sleep(500);
  }
  let evalResult = null;
  if (spec.eval) {
    evalResult = await evaluate(spec.eval);
    await sleep(spec.afterEvalMs ?? 1000);
  }
  const metrics = await evaluate(METRICS);
  const format = asPng ? "png" : "webp";
  const shotRes = await send("Page.captureScreenshot", asPng ? { format } : { format, quality: 80 });
  writeFileSync(join(outDir, `${shot.name}.${format}`), Buffer.from(shotRes.result.data, "base64"));
  const entry = { name: shot.name, evalResult, ...metrics, errors: [...consoleErrors].slice(0, 3) };
  report.push(entry);
  const flag =
    metrics?.docOverflowX || metrics?.mainOverflowX || metrics?.offRight?.length || consoleErrors.length
      ? " <<<"
      : "";
  console.log(
    shot.name,
    `ovf=${metrics?.docOverflowX}/${metrics?.mainOverflowX} off=${metrics?.offRight?.length} err=${consoleErrors.length}${flag}`,
  );
}
writeFileSync(join(outDir, `_report-${Date.now()}.json`), JSON.stringify(report, null, 2));
console.log(`total ${report.length}`);
ws.close();
chrome.kill();
process.exit(0);
