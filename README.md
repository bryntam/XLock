# XLock

XLock is a local macOS MVP for people who build with Codex and post on X.

X unlocks only while Codex works. When Codex is done, X is blocked with an overlay without closing the tab, so drafts stay in place.

## Status

This is a weekend-project MVP. The long-term direction is a native macOS menu bar app.

Current shape:

- Local Node service on `http://localhost:47831`
- Chromium extension for Arc/Chrome
- Codex hook integration
- Codex session-file watcher fallback
- Codex `notify` fallback for turn-ended blocking

## Requirements

- macOS
- Node.js 20+
- Codex Desktop or Codex CLI
- Arc, Chrome, or another Chromium browser that can load unpacked extensions

## Run

```sh
npm run launch
```

The dashboard is at:

```text
http://localhost:47831
```

## Menu Bar App

On the `macos-menu-bar-app` branch, XLock also includes a native Swift menu bar wrapper around the existing local engine.

Run it in development:

```sh
npm run menu-bar
```

Build a local app bundle:

```sh
npm run package-app
open dist/XLock.app
```

The menu bar app starts the existing Node service/session watcher, polls the local status endpoint, and gives quick controls for:

- Arm XLock / Pause XLock
- Open X
- Block Now
- Back to Codex
- Open Dashboard
- Open Extension Folder
- Install/Repair Codex Hooks
- Run Health Check

Use **Pause XLock** when you are not actively building and posting at the same time. While paused, XLock leaves X alone and ignores Codex start/stop signals. Use **Arm XLock** when you want the build-and-post loop: X is blocked while Codex is idle and unlocks only during Codex work.

## Extension

Load this folder as an unpacked extension in Arc or Chrome:

```text
extension
```

When XLock is paused, X is normal. When XLock is armed and idle, X gets an overlay and the tab stays open. When Codex starts a build turn, the overlay is removed. There is no manual unlock button, because X should stay blocked when XLock is armed and Codex is not working.

## Codex Hooks

Install the guarded global Codex hook:

```sh
npm run hook-install
```

By default, the hook is guarded to the directory where you run the command. Override it with:

```sh
BIPG_WORKSPACE=/path/to/your/project npm run hook-install
```

After installing, open `/hooks` in Codex and trust the hook if prompted.

To check hook events:

```sh
npm run watch-hooks
npm run hook-status
```

## Session Watcher

The Desktop app writes live turn events to `~/.codex/sessions`. The session watcher follows the newest session JSONL file and unlocks X when it sees a fresh user turn or task start. It blocks X again when it sees task completion.

Run it in the foreground:

```sh
npm run watch-sessions
```

To test the watcher without waiting for a real Codex turn:

```sh
npm run probe-session-watcher
```

## Notify Fallback

The install can wrap Codex's existing `notify` command with:

```text
scripts/codex-notify-wrapper.mjs
```

When Codex sends `turn-ended`, the wrapper posts to `/codex-hook/stop`, so X gets blocked when the chat finishes even if lifecycle hooks do not fire.

To test only this fallback:

```sh
npm run probe-notify
```

## Proof

```sh
npm run proof
npm run completion
```

`proof` verifies:

- Paused mode leaves X alone and ignores Codex starts
- Armed mode blocks idle X
- Manual unlock is blocked
- Codex/dev start can unlock
- Stop blocks X
- Notify fallback blocks X
- Session watcher start/stop works

## Privacy

This app runs locally. It watches local Codex session files to detect turn start/end events and talks to a local browser extension over `localhost`. It does not send data to a server.

Do not commit the `artifacts/` directory. It contains local logs and runtime state.

## Roadmap

- Native macOS menu bar app
- One-click Codex integration install/repair
- Browser extension publishing
- Cleaner onboarding for Arc and Chrome
- Config UI for preferred browser and watched projects
