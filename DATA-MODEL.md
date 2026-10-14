# Data model

Two stores, one shape. The device is the source of truth; Supabase is how a second phone
joins in.

Code: `app/src/store/useStore.tsx` (local), `supabase/migrations/` (cloud),
`app/src/db/sync.ts` (the bridge).

---

## Local first, and not as a slogan

Every screen renders from the on-device store. Every engine call runs offline. The app is
fully usable with no account, no key and no connection, and each of those absences degrades
exactly one feature rather than breaking the app:

| Absent | Lost |
|---|---|
| Network | Claude's phrasing and ordering. The deterministic engine is unaffected. |
| API key | Photo and voice capture. |
| Supabase config | Sharing with a second phone. |

The cloud is never consulted to answer "what can I cook", which is the question the app
exists for.

### Local persistence

AsyncStorage, one JSON blob under `kokum.state.v1`, written after every state change:

```ts
{ household, pantry: PantryItem[], cookLog, leftovers, householdId, needsPull, stash }
```

`householdId` is the shared household the pantry and profile belong to (null until the first
sync). `stash` holds this phone's copy of every other household it has been on, so switching
households swaps the pantry instead of merging it (DECISIONS D-015).

The pantry is a `Map` in memory and an array on disk. Corrupt or unreadable storage falls
through to the seed pantry rather than a blank app, and a failed write never takes the session
down.

**This is a deliberate stopgap, not the end state.** A JSON blob rewritten on every change is
fine at 40 pantry rows and wrong at 400. `expo-sqlite` is the intended replacement; the
repository shape is already right for the swap, because nothing outside the store touches
persistence.

---

## Cloud schema

`supabase/migrations/0001_init.sql`. Four design decisions worth stating:

**1. Everything is scoped to a household, not a user.** Two people share one pantry. The
membership table is the join, and row-level security resolves through it.

**2. Recipe quantities are stored per 2 adults, always.** Scaling happens at read time in the
client. Storing a pre-scaled quantity makes the number meaningless the moment someone changes
the household size.

**3. `pantry_item.last_confirmed_at` is load-bearing.** Confidence decays from it, so every
write representing a human actually looking at their kitchen must set it to now, and no other
write may.

**4. `recipe.verified` gates depletion math.** Unverified recipes may be suggested; their
quantities are never subtracted.

### Tables

| Table | Notes |
|---|---|
| `household` | Covers, cooktop, diet, allergies, equipment, observances, budget |
| `household_member` | The join. Roles: owner, member, cook. |
| `household_invite` | One-use codes an owner issues; redeemed only through `join_household()` |
| `ingredient` | Global dictionary, read-only to clients |
| `ingredient_alias` | What turns three spellings into one row you can do arithmetic on |
| `recipe`, `recipe_ingredient` | `household_id` null for the shared corpus |
| `pantry_item` | Composite PK on (household, ingredient) |
| `cook_log` | Append-only, keeps `deltas` so a mistaken cook can be reversed exactly |
| `capture` | Ingestion audit: raw text, what was parsed, what the user confirmed |
| `shopping_list`, `shopping_line` | |
| `meal_plan`, `meal_plan_slot` | |
| `leftover` | |

The `capture` table stores both `parsed` and `confirmed`. The difference between them is the
parse-accuracy signal, which is the only honest way to measure whether ingestion is getting
better. **Images are never stored**, only extracted text.

### Row-level security

Membership resolves through a security-definer function:

```sql
create function is_household_member(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from household_member
                 where household_id = h and user_id = auth.uid());
$$;
```

The function exists to break a recursion. A plain subquery against `household_member` inside a
policy *on* `household_member` re-enters the policy and fails. `security definer` runs it as
the owner, outside RLS, which cuts the cycle.

New users get a household automatically via a trigger on `auth.users`, so there is no
first-run state where a signed-in user has nowhere to put data.

### Seed generation

`app/scripts/gen-seed.ts` projects the TypeScript dictionary into `0002_seed.sql`. The TS
files stay the source of truth so the engine runs with no database at all; the SQL is
generated, never hand-edited. A dictionary that disagrees with itself across two files is
worse than having only one.

```bash
cd app && npm run gen:seed
```

---

## Sync

`app/src/db/sync.ts`. **Last write wins, per row, on `last_confirmed_at`.**

That is the right rule for this data rather than a lazy one. A pantry row means "the last time
a human looked, here is what they saw." Two people cannot both be right about how much atta is
in the jar, and the one who looked more recently is the one to believe.

One pass does both directions, so a shared household converges after a single sync from either
phone:

1. Pull remote rows; anything strictly newer than the local row replaces it
2. Push the merged set back, upserting on (household, ingredient)
3. The household profile is shared so both phones suggest the same dishes, and only owners
   may change it: every owner's phone pushes it (with two owners, whichever syncs last wins),
   and every other phone takes the household's copy. A failed profile upload is reported
   without failing the pantry sync
4. Upsert recent cook-log entries cooked in this household, ignoring duplicates

A sync only ever runs against the household the local pantry belongs to. Right after switching
to a household this phone holds no copy of, it pulls only (pantry and profile, merged onto
anything entered since the switch) and pushes nothing. A result that lands after the phone has
switched again is discarded.

An unbound pantry (never synced, or carried over from a build before this tracking existed) is
the user's own. It may only be pushed to their own household; if the phone is on any other, the
pantry and its cook log are put aside under the user's own household and the active one is
pulled. **Limitation:** an older build already merged its pantry into whichever household it
synced with. Those merges are on the server and cannot be undone from here.

Ties keep the local row, which stops a no-op sync from churning state and re-rendering every
screen. A failed sync returns an error and leaves the local pantry untouched.

**What this deliberately does not do:** operational transforms, vector clocks, or merging
concurrent edits to one row. A two-person household does not need them, and pretending
otherwise would add a worse class of bug than it solves.

### Configuration

Optional. `.env.example` documents both variables:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

The anon key is designed to be public. RLS protects the data, not the secrecy of that key.
Without these, `CLOUD_CONFIGURED` is false and the Setup screen says so plainly instead of
showing a broken sign-in form.

---

## Privacy

- **Grocery bills are personal financial data.** Images stay on the device. Only extracted
  text is ever transmitted, and only to Anthropic for parsing.
- **The API key** lives in the device keychain via `expo-secure-store`, never in app state,
  never in the AsyncStorage blob, never logged.
- **Nothing is uploaded** unless the user explicitly signs in for sharing.
- **Memory stores and prompts** never receive the API key or any credential.

---

## Known gaps

- **AsyncStorage, not SQLite.** Correct shape, wrong storage engine at scale.
- **Leftovers, meal plans and captures are local-only.** The tables exist in the schema and
  the sync does not touch them yet.
- **No conflict surface.** When last-write-wins discards a value, the user is told how many
  rows changed but not which, and cannot review or undo the merge.
- **The migration has never been run against a live project.** The SQL is written and
  reviewed, and nobody has applied it, which means the RLS policies in particular are
  unverified in practice.
