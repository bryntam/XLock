#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.BIPG_URL || "http://localhost:47831";
const command = process.argv[2] || "status";
const hookLogPath = resolve(root, "artifacts/hook-events.jsonl");
const hookWatchPath = resolve(root, "artifacts/hook-watch.json");
const notifyLogPath = resolve(root, "artifacts/notify-events.jsonl");
const sessionWatchLogPath = resolve(root, "artifacts/session-watch-events.jsonl");
const guardedWorkspace = resolve(process.env.BIPG_WORKSPACE || process.cwd());

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload.data;
}

async function serviceReachable() {
  try {
    await api("/status");
    return true;
  } catch {
    return false;
  }
}

function collectProcess(child, timeoutMs = 10_000) {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
  }, timeoutMs);

  return new Promise((resolve) => {
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

async function screenList() {
  const result = await collectProcess(spawn("screen", ["-ls"], { stdio: ["ignore", "pipe", "pipe"] }));
  return `${result.stdout}${result.stderr}`;
}

async function screenRunning(name) {
  return (await screenList()).includes(`.${name}`);
}

async function startScreen(name, commandLine) {
  if (await screenRunning(name)) return { started: false, name };
  const result = await collectProcess(spawn("screen", ["-dmS", name, "zsh", "-lc", commandLine], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  }));
  if (result.code !== 0) throw new Error(`Could not start ${name}: ${result.stderr || result.stdout}`);
  return { started: true, name };
}

async function launchApp() {
  const service = await serviceReachable()
    ? { started: false, name: "port 47831" }
    : await startScreen(
      "bipg-local",
      `cd '${root}' && npm start >> artifacts/service-screen.log 2>&1`
    );
  const watcher = await startScreen(
    "bipg-session-watcher",
    `cd '${root}' && npm run watch-sessions >> artifacts/session-watcher-screen.log 2>&1`
  );
  return { service, watcher };
}

async function installHooks() {
  const node = process.execPath;
  const bridge = resolve(root, "scripts/codex-hook-bridge.mjs");
  const start = `BIPG_WORKSPACE='${guardedWorkspace}' '${node}' '${bridge}' start`;
  const stop = `BIPG_WORKSPACE='${guardedWorkspace}' '${node}' '${bridge}' stop`;
  const hooks = {
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: "command", command: start, timeout: 5, statusMessage: "Opening X while Codex works" }] }],
      PreToolUse: [{ hooks: [{ type: "command", command: start, timeout: 5, statusMessage: "Opening X while Codex uses tools" }] }],
      Stop: [{ hooks: [{ type: "command", command: stop, timeout: 5, statusMessage: "Blocking X after Codex stops" }] }]
    }
  };
  const path = resolve(homedir(), ".codex/hooks.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(hooks, null, 2)}\n`);
  return path;
}

async function readHookEvents() {
  try {
    const text = await readFile(hookLogPath, "utf8");
    return text.trim().split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { at: null, raw: line };
      }
    });
  } catch {
    return [];
  }
}

async function readNotifyEvents() {
  try {
    const text = await readFile(notifyLogPath, "utf8");
    return text.trim().split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { at: null, raw: line };
      }
    });
  } catch {
    return [];
  }
}

async function readSessionWatchEvents() {
  try {
    const text = await readFile(sessionWatchLogPath, "utf8");
    return text.trim().split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { at: null, raw: line };
      }
    });
  } catch {
    return [];
  }
}

async function notifyConfigStatus() {
  const configPath = resolve(homedir(), ".codex/config.toml");
  const wrapper = resolve(root, "scripts/codex-notify-wrapper.mjs");
  try {
    const text = await readFile(configPath, "utf8");
    return {
      installed: text.includes(wrapper),
      configPath,
      wrapper
    };
  } catch {
    return {
      installed: false,
      configPath,
      wrapper
    };
  }
}

async function startHookWatch() {
  const events = await readHookEvents();
  const watch = {
    baselineCount: events.length,
    startedAt: new Date().toISOString()
  };
  await mkdir(dirname(hookWatchPath), { recursive: true });
  await writeFile(hookWatchPath, `${JSON.stringify(watch, null, 2)}\n`);
  return watch;
}

async function hookWatchStatus() {
  const events = await readHookEvents();
  let watch = null;
  try {
    watch = JSON.parse(await readFile(hookWatchPath, "utf8"));
  } catch {
    return {
      watching: false,
      eventCount: events.length,
      newEvents: [],
      detail: "No hook watch has started. Run npm run watch-hooks."
    };
  }

  const baselineCount = typeof watch.baselineCount === "number" ? watch.baselineCount : events.length;
  const newEvents = events.slice(baselineCount);
  return {
    watching: true,
    startedAt: watch.startedAt || null,
    eventCount: events.length,
    newEvents,
    detail: newEvents.length > 0
      ? `Saw ${newEvents.length} hook event(s) since watch started.`
      : "Watching, but no Codex hook events have arrived yet."
  };
}

function printHookWatchStatus(status) {
  console.log(status.detail);
  if (status.startedAt) console.log(`Started: ${status.startedAt}`);
  console.log(`Total hook events: ${status.eventCount}`);
  for (const event of status.newEvents.slice(-10)) {
    console.log(`${event.at || "-"} ${event.action || "-"} ${event.stage || "-"} status=${event.status ?? "-"}`);
  }
}

async function runCodexCliHookProbe() {
  await startHookWatch();
  const codex = spawn("codex", [
    "--dangerously-bypass-hook-trust",
    "-C",
    guardedWorkspace,
    "--ask-for-approval",
    "never",
    "--sandbox",
    "read-only",
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "Reply with exactly OK."
  ], {
    cwd: root,
    env: { ...process.env, BIPG_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  codex.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  codex.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  const timeout = setTimeout(() => {
    codex.kill("SIGTERM");
  }, 90_000);
  const code = await new Promise((resolve) => codex.on("close", resolve));
  clearTimeout(timeout);
  const hookStatus = await hookWatchStatus();
  return { code, stdout, stderr, hookStatus };
}

async function runNotifyProbe() {
  const wrapper = resolve(root, "scripts/codex-notify-wrapper.mjs");
  const node = process.execPath;
  const notify = spawn(node, [wrapper, "/usr/bin/true", "turn-ended"], {
    cwd: root,
    env: { ...process.env, BIPG_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  notify.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  notify.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  const timeout = setTimeout(() => {
    notify.kill("SIGTERM");
  }, 10_000);
  const code = await new Promise((resolve) => notify.on("close", resolve));
  clearTimeout(timeout);
  return { code, stdout, stderr };
}

async function runSessionWatcherProbe() {
  const probeFile = resolve(root, "artifacts/session-watcher-probe.jsonl");
  const now = new Date().toISOString();
  const events = [
    {
      timestamp: now,
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "probe" }]
      }
    },
    {
      timestamp: now,
      type: "event_msg",
      payload: { type: "task_complete", turn_id: "probe" }
    }
  ];
  await writeFile(probeFile, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

  const watcher = spawn(process.execPath, [resolve(root, "scripts/codex-session-watcher.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      BIPG_URL: baseUrl,
      BIPG_SESSION_FILE: probeFile,
      BIPG_WATCH_ONCE: "1",
      BIPG_WATCH_START_AT_END: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  watcher.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  watcher.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  const timeout = setTimeout(() => {
    watcher.kill("SIGTERM");
  }, 10_000);
  const code = await new Promise((resolve) => watcher.on("close", resolve));
  clearTimeout(timeout);
  return { code, stdout, stderr };
}

if (command === "status") {
  console.log(await api("/status"));
} else if (command === "launch") {
  const result = await launchApp();
  console.log(`Service: ${result.service.started ? "started" : "already running"} (${result.service.name})`);
  console.log(`Session watcher: ${result.watcher.started ? "started" : "already running"} (${result.watcher.name})`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log(await api("/status"));
} else if (command === "start") {
  console.error("Manual start is disabled. X only unlocks from a Codex build signal.");
  process.exit(1);
} else if (command === "lock" || command === "arm") {
  console.log(await api("/gate/lock", { method: "POST" }));
} else if (command === "unlock" || command === "pause") {
  console.log(await api("/gate/unlock", { method: "POST" }));
} else if (command === "end") {
  console.log(await api("/session/end", { method: "POST" }));
} else if (command === "hook-install") {
  console.log(`Installed guarded global hooks at ${await installHooks()}`);
} else if (command === "hook-status") {
  console.log(`Hook bridge: ${resolve(root, "scripts/codex-hook-bridge.mjs")}`);
  console.log(`Service: ${baseUrl}`);
  printHookWatchStatus(await hookWatchStatus());
} else if (command === "trust-hooks") {
  await api("/codex-hook/trust", { method: "POST" });
  console.log("Focused Codex and copied /hooks to the clipboard.");
  console.log("Paste it in Codex, trust the global hook, then run npm run hook-status after a fresh prompt.");
} else if (command === "watch-hooks") {
  await startHookWatch();
  console.log("Hook watch started.");
  console.log(`Now send a new Codex prompt from ${guardedWorkspace}, then run npm run hook-status.`);
} else if (command === "probe-cli-hooks") {
  console.log("Running Codex CLI hook probe...");
  const result = await runCodexCliHookProbe();
  console.log(`Codex CLI exit: ${result.code}`);
  if (result.stdout.trim()) console.log(`stdout: ${result.stdout.trim()}`);
  if (result.stderr.trim()) console.error(`stderr: ${result.stderr.trim()}`);
  printHookWatchStatus(result.hookStatus);
  if (!result.hookStatus.newEvents?.length) process.exit(1);
} else if (command === "probe-notify") {
  const result = await runNotifyProbe();
  console.log(`Notify probe exit: ${result.code}`);
  if (result.stdout.trim()) console.log(`stdout: ${result.stdout.trim()}`);
  if (result.stderr.trim()) console.error(`stderr: ${result.stderr.trim()}`);
  const status = await api("/status");
  console.log(`Service: ${status.mode}, twitter=${status.twitterAllowed ? "unlocked" : "locked"}`);
  if (result.code !== 0 || status.twitterAllowed !== false) process.exit(1);
} else if (command === "probe-session-watcher") {
  await api("/gate/lock", { method: "POST" });
  const result = await runSessionWatcherProbe();
  console.log(`Session watcher probe exit: ${result.code}`);
  if (result.stdout.trim()) console.log(`stdout: ${result.stdout.trim()}`);
  if (result.stderr.trim()) console.error(`stderr: ${result.stderr.trim()}`);
  const status = await api("/status");
  console.log(`Service: ${status.mode}, twitter=${status.twitterAllowed ? "unlocked" : "locked"}`);
  if (result.code !== 0 || status.twitterAllowed !== false) process.exit(1);
} else if (command === "completion") {
  const status = await api("/status");
  const serviceLive = true;
  const extension = status.lastHeartbeatAt ? "OK" : "OPEN";
  const hookWatch = await hookWatchStatus();
  const notify = await notifyConfigStatus();
  const notifyEvents = await readNotifyEvents();
  const sessionWatchEvents = await readSessionWatchEvents();
  const screens = await screenList();
  const notifyBlocked = notifyEvents.some((event) => event.stage === "blocked");
  const sessionWatcherStarted = sessionWatchEvents.some((event) => event.stage === "detected" && event.action === "start");
  const sessionWatcherStopped = sessionWatchEvents.some((event) => event.stage === "detected" && event.action === "stop");
  console.log(`Manual lock control: OK`);
  console.log(`Service: OK (${status.locked ? "locked" : "unlocked"}, ${status.mode}, twitter=${status.twitterAllowed ? "unlocked" : "locked"})`);
  console.log(`Background app: ${serviceLive && screens.includes(".bipg-session-watcher") ? "OK" : "OPEN"} (${serviceLive ? "service reachable" : "service missing"}, ${screens.includes(".bipg-session-watcher") ? "watcher running" : "watcher missing"})`);
  console.log(`Extension heartbeat: ${extension}`);
  console.log(`Hooks: ${hookWatch.newEvents?.length ? "OK" : "OPEN"} (${hookWatch.detail})`);
  console.log(`Notify fallback: ${notify.installed && notifyBlocked ? "OK" : "OPEN"} (${notify.installed ? "installed" : "not installed"}, ${notifyBlocked ? "locked at least once" : "no lock event yet"})`);
  console.log(`Session watcher: ${sessionWatcherStarted && sessionWatcherStopped ? "OK" : "OPEN"} (${sessionWatcherStarted ? "saw start" : "no start yet"}, ${sessionWatcherStopped ? "saw stop" : "no stop yet"})`);
} else if (command === "proof") {
  const initial = await api("/status");
  const unlocked = await api("/gate/unlock", { method: "POST" });
  if (unlocked.locked !== false || unlocked.twitterAllowed !== true) throw new Error("Unlock did not leave X normal.");
  const unlockedHookStart = await api("/codex-hook/start", { method: "POST" });
  if (unlockedHookStart.locked !== false || unlockedHookStart.mode !== "idle" || unlockedHookStart.twitterAllowed !== true) throw new Error("Unlocked XLock still reacted to Codex start.");
  const locked = await api("/gate/lock", { method: "POST" });
  if (locked.locked !== true || locked.twitterAllowed !== false) throw new Error("Lock did not lock idle X.");
  await api("/session/end", { method: "POST" });
  const lockedOut = await fetch(`${baseUrl}/session/start`, { method: "POST" });
  if (lockedOut.status !== 403) throw new Error("Manual start loophole is still open.");
  const started = await api("/dev/session/start", { method: "POST" });
  if (started.mode !== "building" || started.twitterAllowed !== true || started.sessionSource !== "dev") throw new Error("Dev start did not unlock X for proof.");
  const ended = await api("/session/end", { method: "POST" });
  if (ended.mode !== "idle" || ended.twitterAllowed !== false) throw new Error("Manual end did not lock X.");
  const hookStarted = await api("/codex-hook/start", { method: "POST" });
  if (hookStarted.mode !== "building" || hookStarted.sessionSource !== "codex") throw new Error("Hook start did not create a Codex session.");
  const hookEnded = await api("/codex-hook/stop", { method: "POST" });
  if (hookEnded.mode !== "idle" || hookEnded.twitterAllowed !== false) throw new Error("Hook stop did not lock X.");
  const notifyStarted = await api("/dev/session/start", { method: "POST" });
  if (notifyStarted.mode !== "building" || notifyStarted.twitterAllowed !== true) throw new Error("Notify proof could not start a build session.");
  const notifyResult = await runNotifyProbe();
  if (notifyResult.code !== 0) throw new Error(`Notify wrapper exited ${notifyResult.code}.`);
  const notifyEnded = await api("/status");
  if (notifyEnded.mode !== "idle" || notifyEnded.twitterAllowed !== false) throw new Error("Notify fallback did not lock X.");
  const watcherResult = await runSessionWatcherProbe();
  if (watcherResult.code !== 0) throw new Error(`Session watcher exited ${watcherResult.code}.`);
  const watcherEnded = await api("/status");
  if (watcherEnded.mode !== "idle" || watcherEnded.twitterAllowed !== false) throw new Error("Session watcher did not return X to locked.");
  await api("/gate/unlock", { method: "POST" });
  console.log("Proof OK");
  console.log(`Started from ${initial.mode}; ended ${watcherEnded.mode}, twitter=${watcherEnded.twitterAllowed ? "unlocked" : "locked"}`);
} else {
  console.error("Usage: node cli.mjs status|launch|lock|unlock|start|end|hook-install|hook-status|trust-hooks|watch-hooks|probe-cli-hooks|probe-notify|probe-session-watcher|completion|proof");
  process.exit(2);
}
