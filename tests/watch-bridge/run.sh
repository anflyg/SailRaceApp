#!/bin/sh
set -eu
OUT=$(mktemp -d "${TMPDIR:-/tmp}/watch-bridge-tests.XXXXXX")
trap 'rm -rf "$OUT"' EXIT
swiftc -emit-library -emit-module -module-name Capacitor tests/watch-bridge/Capacitor.swift -o "$OUT/libCapacitor.dylib" -emit-module-path "$OUT/Capacitor.swiftmodule"
swiftc -emit-library -emit-module -module-name WatchConnectivity tests/watch-bridge/WatchConnectivity.swift -o "$OUT/libWatchConnectivity.dylib" -emit-module-path "$OUT/WatchConnectivity.swiftmodule"
swiftc -I "$OUT" -L "$OUT" -lCapacitor -lWatchConnectivity ios/App/App/WatchCountdownPlugin.swift tests/watch-bridge/BridgeTests.swift -o "$OUT/bridge-tests"
DYLD_LIBRARY_PATH="$OUT" "$OUT/bridge-tests"
