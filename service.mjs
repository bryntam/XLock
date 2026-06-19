import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 47831);
const stateFile = resolve(root, "artifacts/state.json");
const twitterUrl = "https://x.com/home";
const codexApp = "Codex";
const preferredBrowser = process.env.BIPG_BROWSER || "Arc";
const maxSessionSeconds = Number(process.env.BIPG_MAX_SESSION_SECONDS || 60 * 60);
const autoFocus = process.env.BIPG_AUTO_FOCUS !== "0";

const initialState = {
  locked: false,
  mode: "idle",
  twitterAllowed: false,
  sessionSource: "manual",
  startedAt: null,
  endedAt: null,
  preferredBrowser,
  lastHeartbeatAt: null,
  lastHeartbeatUrl: null,
  autoEndedAt: null
};

let state = await loadState();

async function loadState() {
  if (!existsSync(stateFile)) return { ...initialState };
  try {
    const loaded = JSON.parse(await readFile(stateFile, "utf8"));
    return {
      ...initialState,
      ...loaded,
      locked: typeof loaded.locked === "boolean" ? loaded.locked : loaded.armed === true
    };
  } catch {
    return { ...initialState };
  }
}

async function saveState() {
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function osascript(script) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], () => resolve());
  });
}

async function openTwitter() {
  const browser = state.preferredBrowser || preferredBrowser;
  if (hasRecentTwitterHeartbeat()) {
    await osascript(`tell application "${browser}" to activate`);
    return;
  }
  await osascript(`
set targetUrl to "${twitterUrl}"
tell application "${browser}"
  activate
  open location targetUrl
end tell
`);
}

async function focusCodex() {
  await osascript(`tell application "${codexApp}" to activate`);
}

async function trustHooksHelper() {
  await osascript(`set the clipboard to "/hooks"`);
  await focusCodex();
}

function elapsedSeconds() {
  if (!state.startedAt) return 0;
  const end = state.mode === "building" ? Date.now() : Date.parse(state.endedAt || state.startedAt);
  return Math.max(0, Math.floor((end - Date.parse(state.startedAt)) / 1000));
}

function hasRecentTwitterHeartbeat() {
  if (!state.lastHeartbeatAt || !state.lastHeartbeatUrl) return false;
  const ageMs = Date.now() - Date.parse(state.lastHeartbeatAt);
  if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) return false;
  return /^https?:\/\/(x|twitter)\.com\//.test(state.lastHeartbeatUrl);
}

async function expireStaleSessionIfNeeded() {
  if (state.mode !== "building" || !state.startedAt || maxSessionSeconds <= 0) return;
  if (elapsedSeconds() < maxSessionSeconds) return;
  state = {
    ...state,
    mode: "idle",
    twitterAllowed: false,
    endedAt: new Date().toISOString(),
    autoEndedAt: new Date().toISOString()
  };
  await saveState();
}

function publicState() {
  return {
    ...state,
    armed: state.locked,
    twitterAllowed: state.locked ? state.twitterAllowed : true,
    locked: state.locked,
    lockActive: state.locked,
    elapsedSeconds: elapsedSeconds()
  };
}

async function startSession(source = "manual") {
  if (!state.locked) return publicState();
  if (state.mode === "building") return publicState();
  state = {
    ...state,
    mode: "building",
    twitterAllowed: true,
    sessionSource: source,
    startedAt: new Date().toISOString(),
    endedAt: null,
    autoEndedAt: null
  };
  await saveState();
  if (autoFocus) openTwitter().catch(() => undefined);
  return publicState();
}

async function endSession() {
  if (state.mode !== "building") return publicState();
  state = {
    ...state,
    mode: "idle",
    twitterAllowed: false,
    endedAt: new Date().toISOString()
  };
  await saveState();
  if (autoFocus) focusCodex().catch(() => undefined);
  return publicState();
}

async function lockGate() {
  state = {
    ...state,
    locked: true,
    mode: "idle",
    twitterAllowed: false,
    sessionSource: "manual",
    endedAt: new Date().toISOString(),
    autoEndedAt: null
  };
  await saveState();
  return publicState();
}

async function unlockGate() {
  state = {
    ...state,
    locked: false,
    mode: "idle",
    twitterAllowed: false,
    endedAt: new Date().toISOString(),
    autoEndedAt: null
  };
  await saveState();
  return publicState();
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function send(response, status, data, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    ...headers
  });
  response.end(JSON.stringify(data, null, 2));
}

function html(response, body) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function dashboard() {
  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XLock</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#101114;color:#f5f5f0}
  main{max-width:760px;margin:0 auto;padding:32px 20px}
  h1{font-size:24px;margin:0 0 18px}
  .status{border:1px solid #333842;padding:18px;border-radius:8px;background:#181a20;margin-bottom:16px}
  .mode{font-size:42px;font-weight:800;margin:6px 0}
  button{font:inherit;border:0;border-radius:8px;padding:12px 14px;margin:0 8px 8px 0;cursor:pointer}
  .lock{background:#36c275;color:#06140c}.end{background:#ff6b57;color:#1b0905}.plain{background:#2b303a;color:#f5f5f0}
  code{background:#252933;padding:2px 5px;border-radius:5px}
</style>
<main>
  <h1>XLock</h1>
  <section class="status">
    <div id="label">X is</div>
    <div id="mode" class="mode">...</div>
    <div id="meta"></div>
  </section>
  <button class="lock" onclick="post('/gate/lock')">Lock XLock</button>
  <button class="plain" onclick="post('/gate/unlock')">Unlock XLock</button>
  <button class="end" onclick="post('/session/end')">End & Block X</button>
  <button class="plain" onclick="post('/focus/twitter')">Open X</button>
  <button class="plain" onclick="post('/focus/codex')">Back to Codex</button>
  <button class="plain" onclick="post('/codex-hook/trust')">Trust Hooks</button>
  <p>Load extension folder: <code>${root}/extension</code></p>
  <p>Hook proof: click Trust Hooks, paste <code>/hooks</code> in Codex, trust the global hook, then run <code>npm run hook-status</code>.</p>
</main>
<script>
async function refresh(){
  const r = await fetch('/status'); const {data}=await r.json();
  label.textContent = data.locked ? 'X is' : 'XLock is';
  mode.textContent = data.locked ? (data.twitterAllowed ? 'unlocked' : 'locked') : 'unlocked';
  meta.textContent = (data.locked ? data.mode : 'off') + ' · ' + data.sessionSource + ' · ' + data.elapsedSeconds + 's' + (data.autoEndedAt ? ' · auto-locked' : '');
}
async function post(path){ await fetch(path,{method:'POST'}); await refresh(); }
refresh(); setInterval(refresh, 1000);
</script>`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${port}`);
  await expireStaleSessionIfNeeded();
  if (request.method === "OPTIONS") return send(response, 204, {});
  if (request.method === "GET" && url.pathname === "/") return html(response, dashboard());
  if (request.method === "GET" && url.pathname === "/status") return send(response, 200, { ok: true, data: publicState() });
  if (request.method === "POST" && (url.pathname === "/gate/lock" || url.pathname === "/gate/arm")) return send(response, 200, { ok: true, data: await lockGate() });
  if (request.method === "POST" && (url.pathname === "/gate/unlock" || url.pathname === "/gate/pause")) return send(response, 200, { ok: true, data: await unlockGate() });
  if (request.method === "POST" && url.pathname === "/session/start") return send(response, 403, { ok: false, error: "X only unlocks from a Codex build signal." });
  if (request.method === "POST" && url.pathname === "/dev/session/start") return send(response, 200, { ok: true, data: await startSession("dev") });
  if (request.method === "POST" && url.pathname === "/session/end") return send(response, 200, { ok: true, data: await endSession() });
  if (request.method === "POST" && url.pathname === "/codex-hook/start") return send(response, 200, { ok: true, data: await startSession("codex") });
  if (request.method === "POST" && url.pathname === "/codex-hook/stop") return send(response, 200, { ok: true, data: await endSession() });
  if (request.method === "POST" && url.pathname === "/focus/twitter") { await openTwitter(); return send(response, 200, { ok: true, data: publicState() }); }
  if (request.method === "POST" && url.pathname === "/focus/codex") { await focusCodex(); return send(response, 200, { ok: true, data: publicState() }); }
  if (request.method === "POST" && url.pathname === "/codex-hook/trust") { await trustHooksHelper(); return send(response, 200, { ok: true, data: publicState() }); }
  if (request.method === "POST" && url.pathname === "/extension/heartbeat") {
    const body = await readJson(request);
    state = { ...state, lastHeartbeatAt: new Date().toISOString(), lastHeartbeatUrl: typeof body.url === "string" ? body.url : null };
    await saveState();
    return send(response, 200, { ok: true, data: publicState() });
  }
  return send(response, 404, { ok: false, error: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`XLock listening on http://localhost:${port}`);
});
