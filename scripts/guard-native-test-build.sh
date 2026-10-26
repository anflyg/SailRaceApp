#!/bin/sh
set -eu
assets="$1"
if [ -f "$assets/native-test-only.json" ] || { [ -f "$assets/index.html" ] && /usr/bin/grep -q TACKWISE_NATIVE_TEST_ONLY "$assets/index.html"; }; then
  if [ "${CONFIGURATION:-}" != Debug ] || [ "${ACTION:-}" != build ] || [ "${TACKWISE_NATIVE_TEST_BUILD:-}" != 1 ] || [ "${SKIP_INSTALL:-}" != YES ]; then
    echo 'error: Synthetic native test assets require explicit Debug build, TACKWISE_NATIVE_TEST_BUILD=1 and SKIP_INSTALL=YES. Release/archive/distribution is prohibited.' >&2
    exit 1
  fi
fi
