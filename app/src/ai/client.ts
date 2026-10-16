import Anthropic from '@anthropic-ai/sdk';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Claude client.
 *
 * The key is entered by the user in Setup and lives in the device keychain via
 * expo-secure-store. It is never bundled, never logged, and never sent anywhere except
 * api.anthropic.com.
 *
 * Being straight about the trade-off: calling Anthropic directly from a phone means the key
 * sits on the device. That is fine for a personal app where the key is the user's own, and it
 * is the wrong shape for a multi-tenant product, which would proxy through a server that holds
 * one key and rate-limits per account. If Kokum ever ships to other people, this file is the
 * seam where that proxy goes: swap the base URL, drop the key handling, nothing else moves.
 *
 * On web there is no keychain (expo-secure-store has no web implementation), so the key goes
 * in this browser's localStorage instead. Same trade-off, weaker storage: anyone with access
 * to this browser profile can read it. Remove it in Setup when done.
 */

const KEY_SLOT = 'kokum.anthropic.key';

/**
 * Opus 5.5, the current Opus: same features as Opus 5 at a lower price. The deterministic
 * engine does the load-bearing work, so one call per day is cheap. Reasoning in DECISIONS D-011.
 */
export const MODEL = 'claude-opus-5-5';

let cached: Anthropic | null = null;
let cachedKey: string | null = null;

const isWeb = Platform.OS === 'web';

export async function getApiKey(): Promise<string | null> {
  try {
    if (isWeb) return window.localStorage.getItem(KEY_SLOT);
    return await SecureStore.getItemAsync(KEY_SLOT);
  } catch {
    return null;
  }
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (isWeb) {
    if (trimmed) window.localStorage.setItem(KEY_SLOT, trimmed);
    else window.localStorage.removeItem(KEY_SLOT);
  } else if (trimmed) await SecureStore.setItemAsync(KEY_SLOT, trimmed);
  else await SecureStore.deleteItemAsync(KEY_SLOT);
  cached = null;
  cachedKey = null;
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

/** Null when no key is configured. Every caller must handle that and degrade, not throw. */
export async function getClient(): Promise<Anthropic | null> {
  const key = await getApiKey();
  if (!key) return null;
  if (cached && cachedKey === key) return cached;

  cached = new Anthropic({
    apiKey: key,
    // React Native looks like a browser to the SDK's environment check. The usual reason that
    // check exists is to stop a key being shipped to untrusted clients; here the key belongs
    // to the person holding the phone, so the check is not protecting anyone.
    dangerouslyAllowBrowser: true,
  });
  cachedKey = key;
  return cached;
}

/** Every AI call returns this shape. The app must stay fully usable when `ok` is false. */
export type AiResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'no-key' | 'network' | 'refused' | 'bad-output' | 'error'; message: string };

export function noKey<T>(): AiResult<T> {
  return { ok: false, reason: 'no-key', message: 'Add your Claude API key in Setup.' };
}

/**
 * Maps SDK exceptions onto the four failure modes the UI actually distinguishes.
 * Uses the SDK's typed error classes rather than matching on message strings.
 */
export function toFailure<T>(err: unknown): AiResult<T> {
  if (err instanceof Anthropic.AuthenticationError) {
    return { ok: false, reason: 'no-key', message: 'That API key was rejected. Check it in Setup.' };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { ok: false, reason: 'network', message: 'Rate limited. Try again in a moment.' };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { ok: false, reason: 'network', message: 'No connection. This works offline too.' };
  }
  if (err instanceof Anthropic.APIError) {
    return { ok: false, reason: 'error', message: `Claude returned ${err.status}.` };
  }
  return { ok: false, reason: 'error', message: 'Something went wrong reading that.' };
}
