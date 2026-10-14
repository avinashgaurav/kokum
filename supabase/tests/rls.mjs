// Checks 0001_init.sql in PGlite (Postgres compiled to WASM) against a stub of Supabase's
// auth schema, running every client-side statement as the `authenticated` role with RLS on.
//
//   cd supabase/tests && npm install && npm test
//
// What it cannot check: real concurrency. PGlite is one connection, so the advisory lock on
// invite inserts and the household row lock in the last-owner guard are checked by looking
// at pg_locks inside a transaction, not by racing two sessions.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIG = process.argv[2] ?? fileURLToPath(new URL('../migrations/0001_init.sql', import.meta.url));
const sql = readFileSync(MIG, 'utf8').replace(/create extension if not exists "pgcrypto";/, '');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('PASS', label); } else { fail++; console.log('FAIL', label); } };

// Supabase-like stub: roles, auth schema, auth.uid() from a setting, default grants.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text) $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
await db.exec(sql);
console.log('migration applied');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const D = '00000000-0000-4000-8000-00000000000d';
for (const u of [A, B, C, D]) await db.query('insert into auth.users (id) values ($1)', [u]);

const home = async (u) =>
  (await db.query(`select household_id from household_member where user_id = $1 and role = 'owner'`, [u])).rows[0].household_id;
const HA = await home(A);

// Run fn as `authenticated` (RLS on) with auth.uid() = uid. Always resets to superuser.
async function as(uid, fn, role = 'authenticated') {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [role]);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function err(p) { try { await p; return null; } catch (e) { return e; } }
const whoami = async () => (await db.query('select current_user, (select rolbypassrls from pg_roles where rolname = current_user) b')).rows[0];

const r0 = await as(A, whoami);
ok(r0.current_user === 'authenticated' && r0.b === false, `tests run as role=${r0.current_user}, bypassrls=${r0.b}`);

// 1. Owner creates an invite; code is DB-generated Crockford base32.
const inv1 = await as(A, async () =>
  (await db.query(`insert into household_invite (household_id) values ($1) returning code, role, created_by, expires_at`, [HA])).rows[0]);
ok(/^[0-9A-HJKMNP-TV-Z]{10}$/.test(inv1.code) && inv1.role === 'member' && inv1.created_by === A, `owner creates invite ${inv1.code}`);

// 2. Client cannot choose the code, the creator or pre-redeem.
ok(!!(await as(A, () => err(db.query(`insert into household_invite (code, household_id) values ('AAAAAAAAAA', $1)`, [HA])))), 'owner cannot pick the code (column grant)');
ok(!!(await as(A, () => err(db.query(`insert into household_invite (household_id, created_by) values ($1, $2)`, [HA, B])))), 'owner cannot set created_by');
ok(!!(await as(A, () => err(db.query(`insert into household_invite (household_id) values ($1) returning code`, [HA]).then(() => db.query(`update household_invite set used_at = now()`)))) ), 'nobody can update invites directly');
ok(!!(await as(A, () => err(db.query(`insert into household_invite (household_id, role) values ($1, 'owner')`, [HA])))), 'owner role cannot be invited');
ok(!!(await as(A, () => err(db.query(`insert into household_invite (household_id, expires_at) values ($1, now() + interval '31 days')`, [HA])))), 'expiry over 30 days rejected');

// 3. Non-owner can neither see nor create invites; the old self-insert stays blocked.
ok((await as(B, () => db.query('select * from household_invite'))).rows.length === 0, 'non-member sees no invites');
ok(!!(await as(B, () => err(db.query(`insert into household_invite (household_id) values ($1)`, [HA])))), 'non-owner cannot create invite for another household');
ok(!!(await as(B, () => err(db.query(`insert into household_member (household_id, user_id, role) values ($1, $2, 'member')`, [HA, B])))), 'self-insert into household_member still rejected (old joinHousehold path)');

// 4. B joins via RPC, with a sloppily typed code.
const typed = inv1.code.toLowerCase().replace(/(.{5})/, '$1-').replace(/0/g, 'o').replace(/1/g, 'l');
const j = await as(B, () => db.query('select public.join_household($1) as h', [typed]));
ok(j.rows[0].h === HA, `B joins with "${typed}"`);
const bRow = (await db.query('select role from household_member where household_id = $1 and user_id = $2', [HA, B])).rows[0];
ok(bRow?.role === 'member', 'B is a member with the invited role');
const used = (await db.query('select used_by, used_at from household_invite where code = $1', [inv1.code])).rows[0];
ok(used.used_by === B && used.used_at, 'invite marked used');
ok((await as(B, () => db.query('select * from household_invite'))).rows.length === 0, 'plain member still cannot read invites');

// 5. Used, expired, unknown codes rejected with one message.
const eUsed = await as(C, () => err(db.query('select public.join_household($1)', [inv1.code])));
ok(eUsed && /not valid/.test(eUsed.message), `used code rejected: ${eUsed?.message}`);
ok(!!(await as(A, () => err(db.query(`insert into household_invite (household_id, expires_at) values ($1, now() - interval '1 minute')`, [HA])))), 'already-expired invite rejected at insert');
const expired = await as(A, async () =>
  (await db.query(`insert into household_invite (household_id, expires_at) values ($1, now() + interval '1 minute') returning code`, [HA])).rows[0].code);
// Time passes (superuser stands in for the clock).
await db.query(`update household_invite set expires_at = now() - interval '1 second' where code = $1`, [expired]);
const eExp = await as(C, () => err(db.query('select public.join_household($1)', [expired])));
ok(eExp && /not valid/.test(eExp.message), `expired code rejected: ${eExp?.message}`);
const eUnk = await as(C, () => err(db.query('select public.join_household($1)', ['ZZZZZZZZZZ'])));
ok(eUnk && /not valid/.test(eUnk.message), 'unknown code rejected');

// 6. Already a member: error, code left unused.
const inv2 = await as(A, async () => (await db.query(`insert into household_invite (household_id) values ($1) returning code`, [HA])).rows[0].code);
const eDup = await as(B, () => err(db.query('select public.join_household($1)', [inv2])));
ok(eDup && eDup.code === '23505', `existing member rejected (${eDup?.code})`);
ok((await db.query('select used_at from household_invite where code = $1', [inv2])).rows[0].used_at === null, 'code stays unused after duplicate attempt');

// 7. Anon cannot call the RPC; authenticated without uid is refused.
ok(!!(await as(null, () => err(db.query('select public.join_household($1)', [inv2])), 'anon')), 'anon cannot execute join_household');
ok(!!(await as(null, () => err(db.query('select public.join_household($1)', [inv2])))), 'authenticated with no uid refused');

// 8. Cook joins, cannot delete the owner or promote themselves.
const cookCode = await as(A, async () => (await db.query(`insert into household_invite (household_id, role) values ($1, 'cook') returning code`, [HA])).rows[0].code);
await as(C, () => db.query('select public.join_household($1)', [cookCode]));
ok((await db.query('select role from household_member where household_id = $1 and user_id = $2', [HA, C])).rows[0]?.role === 'cook', 'C joined as cook');
await as(C, () => db.query('delete from household_member where household_id = $1 and user_id = $2', [HA, A]));
ok((await db.query('select 1 from household_member where household_id = $1 and user_id = $2', [HA, A])).rows.length === 1, 'cook cannot delete owner');
await as(C, () => db.query(`update household_member set role = 'owner' where household_id = $1 and user_id = $2`, [HA, C]));
ok((await db.query('select role from household_member where household_id = $1 and user_id = $2', [HA, C])).rows[0].role === 'cook', 'cook cannot promote self');
ok(!!(await as(C, () => err(db.query(`insert into household_invite (household_id) values ($1)`, [HA])))), 'cook cannot create invite');
await as(C, () => db.query('delete from household_invite where code = $1', [inv2]));
ok((await db.query('select 1 from household_invite where code = $1', [inv2])).rows.length === 1, 'cook cannot delete invite');

// 9. Last-owner guard holds under RLS.
ok(!!(await as(A, () => err(db.query('delete from household_member where household_id = $1 and user_id = $2', [HA, A])))), 'last owner cannot leave');
ok(!!(await as(A, () => err(db.query(`update household_member set role = 'member' where household_id = $1 and user_id = $2`, [HA, A])))), 'last owner cannot demote self');

// 10. Code dies with its issuer's ownership.
await as(A, () => db.query(`update household_member set role = 'owner' where household_id = $1 and user_id = $2`, [HA, B]));
const bCode = await as(B, async () => (await db.query(`insert into household_invite (household_id) values ($1) returning code`, [HA])).rows[0].code);
await as(A, () => db.query(`update household_member set role = 'member' where household_id = $1 and user_id = $2`, [HA, B]));
const eOrphan = await as(D, () => err(db.query('select public.join_household($1)', [bCode])));
ok(eOrphan && /not valid/.test(eOrphan.message), 'code from a demoted owner rejected');

// 11. Owner can list and revoke; member can leave.
ok((await as(A, () => db.query('select code from household_invite where household_id = $1', [HA]))).rows.length >= 3, 'owner lists invites');
await as(A, () => db.query('delete from household_invite where code = $1', [inv2]));
ok((await db.query('select 1 from household_invite where code = $1', [inv2])).rows.length === 0, 'owner revokes invite');
await as(C, () => db.query('delete from household_member where household_id = $1 and user_id = $2', [HA, C]));
ok((await db.query('select 1 from household_member where household_id = $1 and user_id = $2', [HA, C])).rows.length === 0, 'cook can leave');

// 12. Cap of 20 open invites per household, under RLS.
const open0 = (await db.query(`select count(*)::int n from household_invite where household_id = $1 and used_at is null and expires_at > now()`, [HA])).rows[0].n;
let made = 0, capErr = null;
for (let i = 0; i < 25 && !capErr; i++) {
  capErr = await as(A, () => err(db.query(`insert into household_invite (household_id) values ($1)`, [HA])));
  if (!capErr) made++;
}
const openN = (await db.query(`select count(*)::int n from household_invite where household_id = $1 and used_at is null and expires_at > now()`, [HA])).rows[0].n;
ok(capErr && openN === 20 && made === 20 - open0, `cap enforced at 20 open (started ${open0}, made ${made}, then: ${capErr?.message})`);
const anyCode = (await db.query(`select code from household_invite where household_id = $1 and used_at is null and expires_at > now() limit 1`, [HA])).rows[0].code;
await as(A, () => db.query('delete from household_invite where code = $1', [anyCode]));
ok(!(await as(A, () => err(db.query(`insert into household_invite (household_id) values ($1)`, [HA])))), 'revoking one frees a slot');

// 12b. The cap holds inside one multi-row insert, which a per-row policy check could not see.
const openNow = async () => (await db.query(`select count(*)::int n from household_invite where household_id = $1 and used_at is null and expires_at > now()`, [HA])).rows[0].n;
const two = (await db.query(`select code from household_invite where household_id = $1 and used_at is null and expires_at > now() limit 2`, [HA])).rows.map((r) => r.code);
await as(A, () => db.query('delete from household_invite where code = any($1)', [two]));
const before18 = await openNow();
const eMulti = await as(A, () => err(db.query(`insert into household_invite (household_id) select $1 from generate_series(1, 5)`, [HA])));
ok(before18 === 18 && eMulti && /20 open/.test(eMulti.message) && (await openNow()) === 18,
  `multi-row insert of 5 at 18 open rejected whole (${eMulti?.message})`);
ok(!(await as(A, () => err(db.query(`insert into household_invite (household_id) select $1 from generate_series(1, 2)`, [HA])))) && (await openNow()) === 20,
  'multi-row insert that lands exactly on 20 is allowed');

// 12c. The cap is no oracle: a non-owner gets the RLS error, never the cap error.
const eProbe = await as(B, () => err(db.query(`insert into household_invite (household_id) values ($1)`, [HA])));
ok(eProbe && /row-level security/.test(eProbe.message) && !/20 open/.test(eProbe.message), `non-owner at a full household sees only the RLS error (${eProbe?.message})`);
const fnGone = (await db.query(`select count(*)::int n from pg_proc where proname = 'open_invite_count'`)).rows[0].n === 0;
const capExec = (await db.query(`select has_function_privilege('authenticated', 'public.cap_open_invites()', 'execute') e`)).rows[0].e;
ok(fnGone && capExec === false, 'no callable invite-count function for clients');

// 12d. The insert takes a per-household advisory lock that lasts until the transaction ends.
await as(A, () => db.query('delete from household_invite where code = (select code from household_invite where household_id = $1 and used_at is null and expires_at > now() limit 1)', [HA]));
const advisory = await as(A, () => db.transaction(async (tx) => {
  await tx.query(`insert into household_invite (household_id) values ($1)`, [HA]);
  // Two-key form: classid holds the first key, objid the second, objsubid is 2.
  const r = (await tx.query(`select classid::int as k1, objid::int as k2, objsubid from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`)).rows;
  const want = (await tx.query(`select hashtext($1::text) as k`, [HA])).rows[0].k;
  await tx.rollback();
  return r.some((x) => x.k1 === 1 && x.k2 === want && x.objsubid === 2);
}));
ok(advisory, 'invite insert holds pg_advisory_xact_lock(1, hashtext(household_id))');

// 12e. With no auth.uid() (the service role path, superuser standing in) the cap does not
// apply: documented in the migration. Clean up afterwards so later checks see 19 open.
await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
const svc = (await db.query(`insert into household_invite (household_id, created_by) select $1, $2 from generate_series(1, 2) returning code`, [HA, A])).rows.map((r) => r.code);
ok((await openNow()) === 21, 'no uid, no cap: the server side can exceed 20');
await db.query('delete from household_invite where code = any($1)', [svc]);

// 14. Household rows: members read, owners update, nobody inserts or deletes from a client.
// State here: A owns HA, B is a member of HA, C has left.
const HB = await home(B);
const hRead = await as(B, () => db.query('select id from household where id = $1', [HA]));
ok(hRead.rows.length === 1, 'member reads the household profile');
ok((await as(C, () => db.query('select id from household where id = $1', [HA]))).rows.length === 0, 'non-member cannot read the household');
await as(B, () => db.query(`update household set adults = 9 where id = $1`, [HA]));
ok((await db.query('select adults from household where id = $1', [HA])).rows[0].adults !== 9, 'member cannot update the household profile');
const cook2 = await as(A, async () => (await db.query(`insert into household_invite (household_id, role) values ($1, 'cook') returning code`, [HA])).rows[0].code);
await as(D, () => db.query('select public.join_household($1)', [cook2]));
await as(D, () => db.query(`update household set diet = 'nonveg' where id = $1`, [HA]));
ok((await db.query('select diet from household where id = $1', [HA])).rows[0].diet !== 'nonveg', 'cook cannot update the household profile');
await as(A, () => db.query(`update household set adults = 3 where id = $1`, [HA]));
ok((await db.query('select adults from household where id = $1', [HA])).rows[0].adults === 3, 'owner updates the household profile');
ok(!!(await as(A, () => err(db.query(`insert into household default values`)))), 'client cannot insert a household');
await as(A, () => db.query('delete from household where id = $1', [HA]));
ok((await db.query('select 1 from household where id = $1', [HA])).rows.length === 1, 'owner cannot delete the household from a client');
await as(B, () => db.query('delete from household where id = $1', [HB]));
ok((await db.query('select 1 from household where id = $1', [HB])).rows.length === 1, 'sole owner cannot delete their own household from a client');

// 15. Last-owner guard: removing an owner locks the household row first, so two owners
// leaving at once are serialised and the second sees the first gone.
await as(A, () => db.query(`update household_member set role = 'owner' where household_id = $1 and user_id = $2`, [HA, B]));
const rowLock = await as(B, () => db.transaction(async (tx) => {
  await tx.query('delete from household_member where household_id = $1 and user_id = $2', [HA, B]);
  const r = (await tx.query(`select mode from pg_locks where relation = 'public.household'::regclass and pid = pg_backend_pid()`)).rows.map((x) => x.mode);
  await tx.rollback();
  return r;
}));
ok(rowLock.includes('RowShareLock'), `owner leaving takes a row lock on the household (${rowLock.join(', ')})`);
await as(B, () => db.query('delete from household_member where household_id = $1 and user_id = $2', [HA, B]));
ok(!!(await as(A, () => err(db.query('delete from household_member where household_id = $1 and user_id = $2', [HA, A])))), 'once one of two owners leaves, the other is the last and cannot');
await db.query('delete from household where id = $1', [HB]);
ok((await db.query('select count(*)::int n from household_member where household_id = $1', [HB])).rows[0].n === 0, 'deleting a household still cascades past the guard');
await db.query('delete from auth.users where id = $1', [A]);
ok((await db.query('select count(*)::int n from household_member where user_id = $1', [A])).rows[0].n === 0, 'deleting a sole owner\'s account still goes through');

// 13. Generator sanity (superuser).
const codes = (await db.query('select public.new_invite_code() c from generate_series(1, 2000)')).rows.map((r) => r.c);
ok(new Set(codes).size === 2000 && codes.every((c) => /^[0-9A-HJKMNP-TV-Z]{10}$/.test(c)), '2000 generated codes unique and well-formed');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
