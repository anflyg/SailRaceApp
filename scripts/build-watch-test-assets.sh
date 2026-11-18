#!/bin/sh
set -eu
if [ "${PRODUCT_BUNDLE_IDENTIFIER:-}" != com.anflyg.sailraceapp.watchtest ] || [ "${CONFIGURATION:-}" != Release ]; then
  echo 'error: Watch Test assets require the isolated Release target' >&2; exit 1
fi
if [ "${TACKWISE_NATIVE_TEST_BUILD:-}" = 1 ]; then
  echo 'error: Synthetic native-test mode is forbidden in Watch Test' >&2; exit 1
fi
cd "$SRCROOT/../.."
out="$DERIVED_FILE_DIR/watch-test-public"
./node_modules/.bin/vite build --config watch-test/vite.config.js --outDir "$out"
if [ -e "$out/native-test-only.json" ] || /usr/bin/grep -q TACKWISE_NATIVE_TEST_ONLY "$out/index.html"; then
  echo 'error: synthetic native-test assets forbidden' >&2; exit 1
fi
mkdir -p "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/public"
ditto "$out" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/public"
cp "$SRCROOT/WatchTest/capacitor.config.json" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/capacitor.config.json"
