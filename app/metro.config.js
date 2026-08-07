// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

/**
 * The Anthropic SDK ships a credential chain that reads API keys from disk, so it imports
 * `node:fs`, `node:path` and friends. React Native has no equivalent, and Metro fails the
 * whole bundle on the unresolved import.
 *
 * We never use that path: `getClient()` in src/ai/client.ts always constructs the client
 * with an explicit `apiKey` pulled from the device keychain, so the file-based resolver is
 * dead code here. Point the Node builtins at an empty module and the bundle resolves.
 *
 * If a future SDK version starts calling into these at import time rather than only inside
 * the credential-chain functions, this will surface as a runtime TypeError on first API
 * call, not a silent wrong answer. The fallback is a small fetch client for the two
 * endpoints Kokum uses.
 */
const NODE_BUILTIN = /^node:(fs|path|os|crypto|stream|child_process|url|util|net|tls|zlib|http|https|buffer)$/;
const EMPTY = path.resolve(__dirname, 'src/shims/empty.js');

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (NODE_BUILTIN.test(moduleName)) {
    return { type: 'sourceFile', filePath: EMPTY };
  }
  return upstream
    ? upstream(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
