#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/dist/XLock.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
ENGINE_DIR="$RESOURCES_DIR/XLockEngine"

cd "$ROOT"
swift build -c release

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$ENGINE_DIR"

cp "$ROOT/.build/release/XLockMenuBar" "$MACOS_DIR/XLockMenuBar"
cp "$ROOT/macos/XLock/Info.plist" "$CONTENTS_DIR/Info.plist"

cp "$ROOT/package.json" "$ENGINE_DIR/package.json"
cp "$ROOT/service.mjs" "$ENGINE_DIR/service.mjs"
cp "$ROOT/cli.mjs" "$ENGINE_DIR/cli.mjs"
cp "$ROOT/README.md" "$ENGINE_DIR/README.md"
cp -R "$ROOT/scripts" "$ENGINE_DIR/scripts"
cp -R "$ROOT/extension" "$ENGINE_DIR/extension"
mkdir -p "$ENGINE_DIR/artifacts"

chmod +x "$MACOS_DIR/XLockMenuBar"
echo "Built $APP_DIR"
