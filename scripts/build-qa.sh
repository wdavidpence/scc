#!/bin/bash
# One-shot QA bundle rebuild for gate runs (P1.027-i3b).
cd "$(dirname "$0")/.."
node node_modules/vite/bin/vite.js build
exit $?