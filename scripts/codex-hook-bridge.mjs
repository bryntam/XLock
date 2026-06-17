#!/usr/bin/env node

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
const baseUrl = process.env.BIPG_URL || "http://localhost:47831";
const workspace = process.env.BIPG_WORKSPACE ? resolve(process.env.BIPG_WORKSPACE) : null;
const logPath = resolve(root, "artifacts/hook-events.jsonl");

function inside(cwd, workspaceRoot) {
  const rel = relative(workspaceRoot, cwd);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function log(event) {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify({ at: new Date().toISOString(), action, ...event })}\n`);
}

if (action !== "start" && action !== "stop") process.exit(2);
if (workspace && !inside(resolve(process.cwd()), workspace)) {
  await log({ stage: "ignored", cwd: process.cwd(), workspace });
  process.exit(0);
}

try {
  const path = action === "start" ? "/codex-hook/start" : "/codex-hook/stop";
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", signal: AbortSignal.timeout(2000) });
  await log({ stage: response.ok ? "completed" : "failed", status: response.status });
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  await log({ stage: "skipped", error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
  process.exit(0);
}
