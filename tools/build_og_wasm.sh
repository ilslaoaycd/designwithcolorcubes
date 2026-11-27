#!/bin/sh
# Builds workers/site/src/og.wasm from og.c: the tray link-preview renderer the site Worker runs.
# Needs clang and wasm-ld with the wasm32 target (LLVM 15 or later). Run from the repository root:
#   sh tools/build_og_wasm.sh
set -e
clang --target=wasm32 -O2 -nostdlib -fno-builtin -ffreestanding \
  -Wl,--no-entry -Wl,--strip-all -Wl,-z,stack-size=65536 \
  -o workers/site/src/og.wasm workers/site/src/og.c
ls -l workers/site/src/og.wasm
