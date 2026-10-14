import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { formatInviteCode, parseInviteCode } from './inviteCode';

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

export type MemberRole = 'owner' | 'member' | 'cook';

export interface CloudSession {
  userId: string;
  email: string | null;
  householdId: string | null;
  role: MemberRole | null;
}

export async function currentSession(): Promise<CloudSession | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;

  // A trigger on auth.users creates a household and membership row for every new signup,
  // so this is populated by the time the first sign-in completes. Someone who then joins
  // another household by invite belongs to two; the one they joined most recently is the
  // one they meant, so it wins.
  const { data: rows } = await sb
    .from('household_member')
    .select('household_id, role')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })
    .limit(1);

  return {
    userId: user.id,
    email: user.email ?? null,
    householdId: rows?.[0]?.household_id ?? null,
    role: (rows?.[0]?.role as MemberRole | undefined) ?? null,
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

export interface Invite {
  /** Display form, e.g. QY7NW-1TC8S. */
  code: string;
  expiresAt: string;
}

/**
 * Owner only: issues a one-use code that adds whoever redeems it to this household with the
 * given role. The database generates the code and the expiry (7 days); RLS rejects anyone who
 * is not an owner of the household, and a check constraint rejects inviting an owner.
 */
export async function createInvite(
  householdId: string,
  role: Exclude<MemberRole, 'owner'>,
): Promise<{ ok: true; invite: Invite } | { ok: false; message: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Sharing is not configured in this build.' };

  const { data, error } = await sb
    .from('household_invite')
    .insert({ household_id: householdId, role })
    .select('code, expires_at')
    .single();

  if (error || !data) {
    return { ok: false, message: 'Could not create an invite. Only the household owner can.' };
  }
  return { ok: true, invite: { code: formatInviteCode(data.code), expiresAt: data.expires_at } };
}

/**
 * Redeems an owner-issued invite code, so two phones share one pantry. The caller cannot
 * insert their own membership row (RLS forbids it); `join_household` checks the code and adds
 * them with the role the owner chose.
 */
export async function joinHousehold(input: string): Promise<{ ok: boolean; message: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Sharing is not configured in this build.' };

  const code = parseInviteCode(input);
  if (!code) return { ok: false, message: 'That is not an invite code. It has 10 letters and digits.' };

  const { data } = await sb.auth.getSession();
  if (!data.session?.user) return { ok: false, message: 'Sign in first.' };

  const { error } = await sb.rpc('join_household', { p_code: code });

  if (error) {
    // The server gives one answer for unknown, expired and used codes on purpose, so this
    // can only say what to do next, not which of the three it was.
    if (error.code === '23505') return { ok: false, message: 'You are already in that household.' };
    return {
      ok: false,
      message: 'That code did not work. Codes last 7 days and work once; ask for a new one.',
    };
  }
  return { ok: true, message: 'Joined. Your pantries are now shared.' };
}
