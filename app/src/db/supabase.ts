import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase, used for one thing: letting more than one person share a pantry.
 *
 * Kokum is local-first and stays that way. Every screen renders from the on-device store,
 * every engine call runs offline, and the app is fully usable with no account and no
 * network. Sync is additive: when it is configured and signed in, the local state is pushed
 * up and pulled down; when it is not, nothing changes and nothing breaks.
 *
 * Config comes from EXPO_PUBLIC_ env vars, which Expo inlines at build time. The anon key is
 * designed to be public: row-level security in supabase/migrations/0001_init.sql is what
 * actually protects the data, scoping every row to households the signed-in user belongs to.
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const CLOUD_CONFIGURED = Boolean(URL && ANON);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!CLOUD_CONFIGURED) return null;
  if (client) return client;

  client = createClient(URL!, ANON!, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // No deep-link redirect handling in this build, so the URL-based session detection
      // that browsers rely on would only ever be a no-op here.
      detectSessionInUrl: false,
    },
  });
  return client;
}

export interface CloudSession {
  userId: string;
  email: string | null;
  householdId: string | null;
}

export async function currentSession(): Promise<CloudSession | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;

  // A trigger on auth.users creates a household and membership row for every new signup,
  // so this is populated by the time the first sign-in completes.
  const { data: rows } = await sb
    .from('household_member')
    .select('household_id')
    .eq('user_id', user.id)
    .limit(1);

  return {
    userId: user.id,
    email: user.email ?? null,
    householdId: rows?.[0]?.household_id ?? null,
  };
}

/**
 * Magic-link sign in. No password to store, and no password reset flow to build.
 * The link opens in a browser and Supabase returns the session to the app on next launch.
 */
export async function signIn(email: string): Promise<{ ok: boolean; message: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Sharing is not configured in this build.' };

  const { error } = await sb.auth.signInWithOtp({ email: email.trim() });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Check your email for a sign-in link.' };
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

/** Adds the signed-in user to an existing household, so two phones share one pantry. */
export async function joinHousehold(householdId: string): Promise<{ ok: boolean; message: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Sharing is not configured in this build.' };

  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return { ok: false, message: 'Sign in first.' };

  const { error } = await sb
    .from('household_member')
    .insert({ household_id: householdId, user_id: user.id, role: 'member' });

  if (error) {
    // The most common cause by far is a mistyped or stale id, which RLS turns into a
    // permission error rather than a not-found. Say the useful thing, not the literal one.
    return { ok: false, message: 'Could not join. Check the household code and try again.' };
  }
  return { ok: true, message: 'Joined. Your pantries are now shared.' };
}
