#!/bin/sh
set -eu

# Xcode Cloud discovers this hook beside App.xcodeproj and runs it before
# resolving Swift packages, including Capacitor's local node_modules packages.
cd "$(dirname "$0")/../../.."

# Capacitor 8 requires Node 22 or newer. Xcode Cloud provides Homebrew.
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  brew install node@22
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

# Archives must copy the ordinary app, even if a test opt-in was inherited.
unset TACKWISE_NATIVE_TEST_BUILD
npm ci --include=dev --no-audit --no-fund
npm run build
npx --no-install cap sync ios
