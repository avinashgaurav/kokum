/**
 * Household invite codes, client side.
 *
 * The database generates every code (`public.new_invite_code()` in 0001_init.sql), so nothing
 * here creates one. This module only reads what a person typed and shows a code back in a form
 * that is easy to read aloud. It mirrors the server's normalisation exactly, so a code that
 * passes here is one the server will at least look up, and an obvious typo is caught before a
 * network round trip.
 *
 * Crockford base32: no I, L, O or U. People type O for 0 and I or L for 1, so those are mapped
 * rather than rejected. Pure, no imports, so it runs under the node test runner.
 */

export const INVITE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_LENGTH = 10;

const VALID = new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_LENGTH}}$`);

/** Case-folds, drops spaces and hyphens, reads O as 0 and I or L as 1. Same as the server. */
export function normalizeInviteCode(input: string): string {
  return input
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** The normalised code, or null when it cannot be a real code. */
export function parseInviteCode(input: string): string | null {
  const code = normalizeInviteCode(input);
  return VALID.test(code) ? code : null;
}

/** "QY7NW1TC8S" becomes "QY7NW-1TC8S": two halves are easier to read across a kitchen. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return c.length === INVITE_LENGTH ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}
