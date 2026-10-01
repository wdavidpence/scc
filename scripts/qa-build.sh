#!/bin/bash
# QA helper: rebuild dist from current tree (one-shot vite build)
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
npx vite build 2>&1 | tail -5
echo "BUNDLE: $(ls dist/assets/index-*.js)"
