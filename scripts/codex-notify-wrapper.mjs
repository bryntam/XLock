#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(root, "artifacts/notify-events.jsonl");
const baseUrl = process.env.BIPG_URL || "http://localhost:47831";
const args = process.argv.slice(2);
const originalNotifyCommand = args[0] || null;
const originalNotifyArgs = args.slice(1);

async function log(event) {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify({
    at: new Date().toISOString(),
    argv: args,
    ...event
  })}\n`);
}

async function blockTwitterIfTurnEnded() {
  if (!args.includes("turn-ended")) {
    await log({ stage: "ignored", reason: "not turn-ended" });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/codex-hook/stop`, {
      method: "POST",
      signal: AbortSignal.timeout(2000)
    });
    await log({ stage: response.ok ? "blocked" : "block-failed", status: response.status });
  } catch (error) {
    await log({ stage: "block-skipped", error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
  }
}

function forwardOriginalNotify() {
  if (!originalNotifyCommand) return Promise.resolve(0);

  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(originalNotifyCommand, originalNotifyArgs, {
      stdio: "ignore",
      detached: false
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, 3000);

    child.on("error", async (error) => {
      settled = true;
      clearTimeout(timeout);
      await log({ stage: "forward-error", error: error.message }).catch(() => undefined);
      resolve(0);
    });

    child.on("close", async (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      await log({ stage: "forwarded", code, signal }).catch(() => undefined);
      resolve(0);
    });
  });
}

await blockTwitterIfTurnEnded();
await forwardOriginalNotify();
