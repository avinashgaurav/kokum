import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { formatInviteCode, parseInviteCode } from './inviteCode';
import { pickActiveHousehold, type MemberRole, type Membership } from './households';

export type { MemberRole, Membership } from './households';

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

const ACTIVE_KEY = 'kokum.activeHousehold';

export interface CloudSession {
  userId: string;
  email: string | null;
  /** The household this phone syncs with. See households.ts for how it is chosen. */
  householdId: string | null;
  role: MemberRole | null;
  households: Membership[];
  /**
   * Set when the membership query failed. The households list is then empty because it could
   * not be read, not because there are none, and callers must say so rather than "no household".
   */
  error: string | null;
}

export async function currentSession(): Promise<CloudSession | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;

  // A trigger on auth.users creates a household and membership row for every new signup,
  // so this is populated by the time the first sign-in completes.
  const { data: rows, error } = await sb
    .from('household_member')
    .select('household_id, role, joined_at, household(name)')
    .eq('user_id', user.id);

  const households: Membership[] = (rows ?? []).map((r) => {
    const h = r.household as { name?: string } | { name?: string }[] | null;
    const name = (Array.isArray(h) ? h[0]?.name : h?.name) ?? 'Household';
    return { householdId: r.household_id, name, role: r.role as MemberRole, joinedAt: r.joined_at };
  });

  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(ACTIVE_KEY);
  } catch {
    // Unreadable storage falls back to the user's own household, which is the safe default.
  }
  const householdId = pickActiveHousehold(households, stored);

  return {
    userId: user.id,
    email: user.email ?? null,
    householdId,
    role: households.find((m) => m.householdId === householdId)?.role ?? null,
    households,
    error: error ? error.message : null,
  };
}

/** Makes this phone sync with another of the user's households. Never called implicitly. */
export async function setActiveHousehold(householdId: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY, householdId);
}

/**
 * Removes the signed-in user from a household. RLS allows anyone to delete their own row; the
 * database refuses it when they are the last owner, so a household is never left unmanaged.
 */
export async function leaveHousehold(householdId: string): Promise<{ ok: boolean; message: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Sharing is not configured in this build.' };

  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return { ok: false, message: 'Sign in first.' };

  const { error } = await sb
    .from('household_member')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', user.id);

  if (error) {
    if (error.code === '23514') {
      return { ok: false, message: 'You are its only owner. Make someone else an owner first.' };
    }
    return { ok: false, message: 'Could not leave. Try again.' };
  }
  try {
    if ((await AsyncStorage.getItem(ACTIVE_KEY)) === householdId) await AsyncStorage.removeItem(ACTIVE_KEY);
  } catch {
    // A stale choice is harmless: pickActiveHousehold ignores households the user has left.
  }
  return { ok: true, message: 'Left. This phone is back on your own household and its pantry.' };
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
 * Redeems an owner-issued invite code, so two phones can share one pantry. The caller cannot
 * insert their own membership row (RLS forbids it); `join_household` checks the code and adds
 * them with the role the owner chose.
 */
export async function joinHousehold(
  input: string,
): Promise<{ ok: boolean; message: string; householdId?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Sharing is not configured in this build.' };

  const code = parseInviteCode(input);
  if (!code) return { ok: false, message: 'That is not an invite code. It has 10 letters and digits.' };

  const { data } = await sb.auth.getSession();
  if (!data.session?.user) return { ok: false, message: 'Sign in first.' };

  const { data: joined, error } = await sb.rpc('join_household', { p_code: code });

  if (error) {
    // The server gives one answer for unknown, expired and used codes on purpose, so this
    // can only say what to do next, not which of the three it was.
    if (error.code === '23505') return { ok: false, message: 'You are already in that household.' };
    return {
      ok: false,
      message: 'That code did not work. Codes last 7 days and work once; ask for a new one.',
    };
  }
  // Joining does not switch this phone over. The caller asks first: switching changes which
  // pantry every screen syncs with.
  return { ok: true, message: 'Joined.', householdId: joined as string };
}
