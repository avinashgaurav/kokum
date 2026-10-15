#!/bin/sh
# Eval-only. Creates throwaway packages in <repo>/node_modules (gitignored) so the app's
# `@anthropic-ai/sdk` and `expo-secure-store` imports resolve to the CLI shim under Bun.
# app/ has no node_modules of its own, so resolution from app/src/ai walks up to these.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
H="$ROOT/evals/harness"
mkdir -p "$ROOT/node_modules/@anthropic-ai/sdk" "$ROOT/node_modules/expo-secure-store"
printf '{"name":"@anthropic-ai/sdk","version":"0.0.0-eval","type":"module","main":"index.mjs"}' > "$ROOT/node_modules/@anthropic-ai/sdk/package.json"
printf "export * from '%s/claude-cli.mjs';\nexport { default } from '%s/claude-cli.mjs';\n" "$H" "$H" > "$ROOT/node_modules/@anthropic-ai/sdk/index.mjs"
printf '{"name":"expo-secure-store","version":"0.0.0-eval","type":"module","main":"index.mjs"}' > "$ROOT/node_modules/expo-secure-store/package.json"
printf "export * from '%s/secure-store-shim.mjs';\n" "$H" > "$ROOT/node_modules/expo-secure-store/index.mjs"
echo "shims installed in $ROOT/node_modules"
