#!/usr/bin/env node

import { readdir, readFile, stat, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.BIPG_URL || "http://localhost:47831";
const sessionsRoot = process.env.BIPG_SESSIONS_ROOT || resolve(homedir(), ".codex/sessions");
const forcedSessionFile = process.env.BIPG_SESSION_FILE || null;
const pollMs = Number(process.env.BIPG_WATCH_POLL_MS || 1000);
const startAtEnd = process.env.BIPG_WATCH_START_AT_END !== "0";
const once = process.env.BIPG_WATCH_ONCE === "1";
const logPath = resolve(root, "artifacts/session-watch-events.jsonl");

let watchedFile = null;
let offset = 0;

async function log(event) {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify({
    at: new Date().toISOString(),
    ...event
  })}\n`);
}

async function post(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(2000)
  });
  await log({ stage: response.ok ? "posted" : "post-failed", path, status: response.status });
}

async function newestJsonlFile(dir) {
  let best = null;

  async function walk(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(entries.map(async (entry) => {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) return;
      try {
        const info = await stat(path);
        if (!best || info.mtimeMs > best.mtimeMs) best = { path, mtimeMs: info.mtimeMs, size: info.size };
      } catch {
        // Ignore files that disappear while walking.
      }
    }));
  }

  await walk(dir);
  return best;
}

function eventAction(event) {
  const payload = event.payload || {};

  if (event.type === "response_item" && payload.type === "message" && payload.role === "user") {
    return "start";
  }

  if (event.type === "event_msg" && payload.type === "task_started") {
    return "start";
  }

  if (event.type === "event_msg" && payload.type === "task_complete") {
    return "stop";
  }

  return null;
}

async function processLine(line, source) {
  if (!line.trim()) return;
  let event = null;
  try {
    event = JSON.parse(line);
  } catch {
    await log({ stage: "parse-skipped", source });
    return;
  }

  const action = eventAction(event);
  if (!action) return;

  await log({
    stage: "detected",
    action,
    source,
    eventType: event.type,
    payloadType: event.payload?.type || null
  });
  await post(action === "start" ? "/codex-hook/start" : "/codex-hook/stop");
}

async function chooseFile() {
  if (forcedSessionFile) {
    if (!existsSync(forcedSessionFile)) return null;
    const info = await stat(forcedSessionFile);
    return { path: forcedSessionFile, size: info.size, mtimeMs: info.mtimeMs };
  }
  return newestJsonlFile(sessionsRoot);
}

async function readNewLines(file) {
  const text = await readFile(file.path, "utf8");
  const chunk = text.slice(offset);
  offset = text.length;
  const lines = chunk.split("\n");
  if (!chunk.endsWith("\n")) lines.pop();
  for (const line of lines) await processLine(line, file.path);
}

async function tick() {
  const file = await chooseFile();
  if (!file) {
    await log({ stage: "waiting", reason: "no session file" });
    return;
  }

  if (file.path !== watchedFile) {
    watchedFile = file.path;
    offset = startAtEnd ? file.size : 0;
    await log({ stage: "watching", file: watchedFile, offset });
    if (offset === 0) await readNewLines(file);
    return;
  }

  if (file.size < offset) offset = 0;
  if (file.size > offset) await readNewLines(file);
}

await log({ stage: "started", sessionsRoot, forcedSessionFile, baseUrl });
await tick();

if (!once) {
  setInterval(() => {
    tick().catch((error) => log({ stage: "error", error: error instanceof Error ? error.message : String(error) }).catch(() => undefined));
  }, pollMs);
}
