#!/usr/bin/env bash
# Build a signed .ipa for personal sideload (AltStore / Sideloadly).
# Requires macOS + Xcode. Cannot run in Linux CI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${RM_OS_TARGET:-prod}"
SCHEME="App"
WORKSPACE_DIR="$ROOT/ios/App"
OUT_DIR="$ROOT/build"
ARCHIVE_PATH="$OUT_DIR/RM-OS.xcarchive"
IPA_DIR="$OUT_DIR/ipa"
EXPORT_PLIST="$OUT_DIR/ExportOptions.plist"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: IPA build needs macOS + Xcode."
  echo "This Linux/cloud environment cannot produce a real .ipa."
  echo "On a Mac:"
  echo "  cd mobile && npm ci"
  echo "  RM_OS_TARGET=$TARGET npm run sync"
  echo "  ./scripts/build-ipa.sh"
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "ERROR: xcodebuild not found. Install Xcode from the App Store."
  exit 1
fi

mkdir -p "$OUT_DIR" "$IPA_DIR"

cd "$ROOT"
npm ci
RM_OS_TARGET="$TARGET" npx cap sync ios

# Development export works with free Apple ID when signing in Xcode once.
cat > "$EXPORT_PLIST" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>development</string>
  <key>compileBitcode</key>
  <false/>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
</dict>
</plist>
PLIST

echo "Archiving RM OS (RM_OS_TARGET=$TARGET)…"
xcodebuild \
  -project "$WORKSPACE_DIR/App.xcodeproj" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  clean archive \
  CODE_SIGN_STYLE=Automatic

echo "Exporting IPA…"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$IPA_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST"

echo "Done. IPA (if signing succeeded):"
find "$IPA_DIR" -name '*.ipa' -print

echo
echo "Install with Sideloadly or AltStore (free Apple ID → re-sign every 7 days)."
echo "See docs: rm-os-iphone-ipa-sideload.md"
