-- Kokum schema, initial migration.
--
-- Design notes that matter:
--
-- 1. Everything is scoped to a household, not a user, because two people share one pantry.
--    Row-level security is enforced through household_member, so a user only ever sees rows
--    belonging to a household they belong to.
--
-- 2. Recipe quantities are stored per 2 adults, always. Scaling happens at read time in the
--    client. Never store a pre-scaled quantity: it makes the number meaningless the moment
--    someone changes the household size.
--
-- 3. pantry_item.last_confirmed_at is load-bearing. Confidence decays from it, so every write
--    that represents a human actually looking at their kitchen must set it to now().
--
-- 4. recipe.verified gates depletion math. Unverified recipes may be suggested but their
--    quantities are never subtracted. See AGENTS.md.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
create type unit_t          as enum ('g', 'ml', 'piece', 'bunch');
create type storage_t       as enum ('counter', 'fridge', 'freezer');
create type ingredient_cls  as enum ('staple', 'perishable');
create type diet_t          as enum ('veg', 'egg', 'nonveg', 'jain', 'vegan');
create type recipe_diet_t   as enum ('veg', 'egg', 'nonveg');
create type cooktop_t       as enum ('gas', 'induction', 'both');
create type recipe_cooktop  as enum ('any', 'gas-only');
create type member_role     as enum ('owner', 'member', 'cook');
create type capture_source  as enum ('bill', 'list-photo', 'shelf-photo', 'voice', 'manual');
create type capture_status  as enum ('parsing', 'awaiting-confirm', 'applied', 'discarded');

-- ---------------------------------------------------------------------------
-- household
-- ---------------------------------------------------------------------------
create table household (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null default 'My kitchen',
  adults              int  not null default 2 check (adults >= 1),
  children            int  not null default 0 check (children >= 0),
  cooktop             cooktop_t not null default 'gas',
  burners             int  not null default 2 check (burners >= 1),
  diet                diet_t not null default 'veg',
  allergies           text[] not null default '{}',
  dislikes            text[] not null default '{}',
  equipment           text[] not null default '{cooker,kadhai,tawa,mixer}',
  max_minutes_weekday int  not null default 45,
  max_minutes_weekend int  not null default 90,
  -- Festival and fasting filters, e.g. {navratri, shravan}. Empty means no filter.
  observances         text[] not null default '{}',
  weekly_budget_paise bigint,
  created_at          timestamptz not null default now()
);

create table household_member (
  household_id uuid not null references household(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         member_role not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index on household_member (user_id);

-- Invite codes. Joining a household is an owner handing someone a code, never a user writing
-- their own membership row (RLS forbids that; see member_insert). The code is generated here,
-- not by the client, so its strength does not depend on which app version issued it.
--
-- Alphabet is Crockford base32: no I, L, O or U, so a code read aloud or copied off a screen
-- survives. 10 symbols at 5 bits each is 50 bits drawn from gen_random_uuid(), skipping the
-- uuid's version and variant bytes so every bit used is random. 32 divides 256, so taking each
-- byte mod 32 has no bias.
create or replace function public.new_invite_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(
           substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', get_byte(b, i) % 32 + 1, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) u,
       unnest(array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12]) as i;
$$;

-- It is the column default, so it runs as whoever inserts the invite.
revoke execute on function public.new_invite_code() from public, anon;
grant execute on function public.new_invite_code() to authenticated;

create table household_invite (
  code         text primary key default public.new_invite_code()
               check (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  household_id uuid not null references household(id) on delete cascade,
  -- Ownership is never handed out by code. Promoting someone is a deliberate owner action.
  role         member_role not null default 'member' check (role <> 'owner'),
  created_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  used_by      uuid references auth.users(id) on delete set null,
  used_at      timestamptz
);

create index on household_invite (household_id);

-- ---------------------------------------------------------------------------
-- ingredient dictionary (global, read-only to clients)
-- ---------------------------------------------------------------------------
create table ingredient (
  id                     text primary key,
  name                   text not null,
  cls                    ingredient_cls not null,
  unit                   unit_t not null,
  -- null for staples, which do not spoil on this timescale.
  shelf_life_days        jsonb,
  burn_per_adult_per_day numeric not null default 0 check (burn_per_adult_per_day >= 0),
  par_per_adult          numeric not null default 0 check (par_per_adult >= 0),
  aisle                  text not null default 'Other',
  allergens              text[] not null default '{}',
  jain_safe              boolean not null default true,
  vegan                  boolean not null default true,
  -- rough cost signal for the budget feature, in paise per base unit
  paise_per_unit         numeric
);

-- The alias table is what turns "tamatar", "टमाटर" and "Tomatoes (1kg pack)" into one row
-- you can do arithmetic on. Ingestion leans on this hard.
create table ingredient_alias (
  alias         text primary key,
  ingredient_id text not null references ingredient(id) on delete cascade
);

create index on ingredient_alias (ingredient_id);

-- ---------------------------------------------------------------------------
-- recipes (global corpus + household-authored)
-- ---------------------------------------------------------------------------
create table recipe (
  id           text primary key,
  name         text not null,
  cuisine      text not null,
  moods        text[] not null default '{}',
  minutes      int  not null check (minutes > 0),
  effort       int  not null check (effort between 1 and 3),
  diet         recipe_diet_t not null,
  jain_safe    boolean not null default false,
  vegan        boolean not null default false,
  equipment    text[] not null default '{}',
  cooktop      recipe_cooktop not null default 'any',
  observances  text[] not null default '{}',
  steps        text[] not null default '{}',
  -- Gates depletion math. False until quantities are checked against a reference.
  verified     boolean not null default false,
  -- null for the shared corpus; set for a household's own recipes.
  household_id uuid references household(id) on delete cascade
);

create index on recipe (household_id);

create table recipe_ingredient (
  recipe_id        text not null references recipe(id) on delete cascade,
  ingredient_id    text not null references ingredient(id),
  qty_per_2_adults numeric not null check (qty_per_2_adults > 0),
  unit             unit_t not null,
  -- Core ingredients decide the dish state. Optional ones never do.
  core             boolean not null default true,
  primary key (recipe_id, ingredient_id)
);

-- ---------------------------------------------------------------------------
-- pantry
-- ---------------------------------------------------------------------------
create table pantry_item (
  household_id      uuid not null references household(id) on delete cascade,
  ingredient_id     text not null references ingredient(id),
  quantity          numeric not null default 0 check (quantity >= 0),
  unit              unit_t not null,
  storage           storage_t not null default 'counter',
  -- Confidence decays from this. Any human confirmation must bump it.
  last_confirmed_at timestamptz not null default now(),
  -- Overrides ingredient.par_per_adult once we have learned this household's real cadence.
  par_override      numeric,
  updated_at        timestamptz not null default now(),
  primary key (household_id, ingredient_id)
);

create index on pantry_item (household_id, last_confirmed_at);

create table cook_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  recipe_id    text not null references recipe(id),
  cooked_at    timestamptz not null default now(),
  covers       numeric not null,
  -- What we actually subtracted, kept so a mistaken cook can be reversed exactly.
  deltas       jsonb not null default '{}'
);

create index on cook_log (household_id, cooked_at desc);

-- ---------------------------------------------------------------------------
-- ingestion: photo, voice and bill capture
-- ---------------------------------------------------------------------------
create table capture (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  source       capture_source not null,
  status       capture_status not null default 'parsing',
  -- Raw transcript or OCR text. Images stay on device; only extracted text is stored.
  raw_text     text,
  -- What the parser produced, before the user confirmed anything.
  parsed       jsonb not null default '[]',
  -- What the user actually approved. Differs from `parsed` when they corrected it,
  -- which is the signal we use to measure parse accuracy over time.
  confirmed    jsonb,
  total_paise  bigint,
  created_at   timestamptz not null default now(),
  applied_at   timestamptz
);

create index on capture (household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- shopping
-- ---------------------------------------------------------------------------
create table shopping_list (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  created_at   timestamptz not null default now(),
  ordered_at   timestamptz,
  provider     text
);

create table shopping_line (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references shopping_list(id) on delete cascade,
  ingredient_id text not null references ingredient(id),
  quantity      numeric not null check (quantity > 0),
  unit          unit_t not null,
  reason        text not null default 'below-par',
  ticked        boolean not null default false
);

create index on shopping_line (list_id);

-- ---------------------------------------------------------------------------
-- weekly plan
-- ---------------------------------------------------------------------------
create table meal_plan (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  week_start   date not null,
  unique (household_id, week_start)
);

create table meal_plan_slot (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references meal_plan(id) on delete cascade,
  day       date not null,
  slot      text not null default 'dinner',
  recipe_id text references recipe(id),
  cooked    boolean not null default false,
  unique (plan_id, day, slot)
);

-- ---------------------------------------------------------------------------
-- leftovers
-- ---------------------------------------------------------------------------
create table leftover (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  recipe_id    text references recipe(id),
  label        text not null,
  portions     numeric not null default 1,
  created_at   timestamptz not null default now(),
  -- Cooked food keeps about 2 days in a fridge. Default, overridable.
  expires_at   timestamptz not null default (now() + interval '2 days'),
  consumed_at  timestamptz
);

create index on leftover (household_id, expires_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger pantry_item_touch
  before update on pantry_item
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- row-level security
--
-- Membership is resolved through a security-definer function rather than a subquery in the
-- policy. A plain subquery against household_member inside a household_member policy
-- recurses; this breaks the cycle.
-- ---------------------------------------------------------------------------
--
-- Every security-definer function below names its objects with their schema and pins
-- search_path, so a caller cannot shadow a table or function with one of their own. Execute
-- is revoked from public and anon (Supabase grants it to both by default) and granted only to
-- the role that needs it.
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_member m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

-- Owner check for membership writes. Same security-definer pattern, for the same reason.
create or replace function public.is_household_owner(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_member m
    where m.household_id = h and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

revoke execute on function public.is_household_owner(uuid) from public, anon;
grant execute on function public.is_household_owner(uuid) to authenticated;

-- A household must always have an owner. RLS decides WHO may change membership; this decides
-- what no change may do: demote or remove the last owner, which would leave a household nobody
-- can manage. It also pins a row to its household and user: moving a membership row is a
-- delete and an insert, each checked by its own policy, never an update.
--
-- Two deletes are let through because they are not someone managing a household: the
-- household itself being deleted (its rows cascade away with it) and the user's account being
-- deleted (blocking that would make an account impossible to close).
create or replace function public.guard_household_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and (new.household_id <> old.household_id or new.user_id <> old.user_id) then
    raise exception 'household_member.household_id and user_id cannot be changed'
      using errcode = 'check_violation';
  end if;

  if old.role <> 'owner' or (tg_op = 'UPDATE' and new.role = 'owner') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' and (
       not exists (select 1 from public.household h where h.id = old.household_id)
    or not exists (select 1 from auth.users u where u.id = old.user_id)
  ) then
    return old;
  end if;

  if not exists (
    select 1 from public.household_member m
    where m.household_id = old.household_id and m.user_id <> old.user_id and m.role = 'owner'
  ) then
    raise exception 'a household must keep at least one owner'
      using errcode = 'check_violation',
            hint = 'Make another member an owner first.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

revoke execute on function public.guard_household_owner() from public, anon, authenticated;

create trigger household_member_keep_owner
  before update or delete on household_member
  for each row execute function public.guard_household_owner();

alter table household        enable row level security;
alter table household_member enable row level security;
alter table pantry_item      enable row level security;
alter table cook_log         enable row level security;
alter table capture          enable row level security;
alter table shopping_list    enable row level security;
alter table shopping_line    enable row level security;
alter table meal_plan        enable row level security;
alter table meal_plan_slot   enable row level security;
alter table leftover         enable row level security;
alter table recipe           enable row level security;
alter table ingredient       enable row level security;
alter table ingredient_alias enable row level security;
alter table recipe_ingredient enable row level security;

create policy household_rw on household
  for all using (is_household_member(id)) with check (is_household_member(id));

create policy member_read on household_member
  for select using (user_id = auth.uid() or is_household_member(household_id));

-- Only the household owner may add, change or remove membership rows. Any member (including
-- the cook role) may remove their own row, which is how someone leaves a household. Without
-- the role check, any member could add strangers, promote themselves, or delete the owner.
create policy member_insert on household_member
  for insert with check (is_household_owner(household_id));
create policy member_update on household_member
  for update using (is_household_owner(household_id)) with check (is_household_owner(household_id));
create policy member_delete on household_member
  for delete using (is_household_owner(household_id) or user_id = auth.uid());

-- Invites: the owner of a household creates, lists and revokes its codes. Nobody else can read
-- one, so a code cannot be harvested by listing the table; redeeming goes through
-- join_household() below. There is no update policy: only that function marks a code used.
--
-- Column grants close the rest. A client may choose the household, the role and an earlier
-- expiry, nothing else: the code, its creator and its used_by/used_at are always set by the
-- database, so nobody can mint a guessable code or insert one pre-redeemed.
alter table household_invite enable row level security;

revoke all on household_invite from public, anon, authenticated;
grant select, delete on household_invite to authenticated;
grant insert (household_id, role, expires_at) on household_invite to authenticated;

-- Open invites: unused and unexpired. Security definer for the same reason as the helpers
-- above, so the insert policy can count them without depending on the select policy.
create or replace function public.open_invite_count(h uuid) returns int
language sql security definer stable set search_path = '' as $$
  select count(*)::int from public.household_invite i
  where i.household_id = h and i.used_at is null and i.expires_at > now();
$$;

revoke execute on function public.open_invite_count(uuid) from public, anon;
grant execute on function public.open_invite_count(uuid) to authenticated;

create policy invite_read on household_invite
  for select using (is_household_owner(household_id));
create policy invite_insert on household_invite
  for insert with check (
    is_household_owner(household_id)
    and expires_at > now()
    and expires_at <= now() + interval '30 days'
    -- At most 20 open codes per household. Revoke or let some expire to issue more.
    and public.open_invite_count(household_id) < 20
  );
create policy invite_delete on household_invite
  for delete using (is_household_owner(household_id));

create policy pantry_rw on pantry_item
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy cooklog_rw on cook_log
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy capture_rw on capture
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy list_rw on shopping_list
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy line_rw on shopping_line
  for all using (
    exists (select 1 from shopping_list l
            where l.id = list_id and is_household_member(l.household_id))
  ) with check (
    exists (select 1 from shopping_list l
            where l.id = list_id and is_household_member(l.household_id))
  );

create policy plan_rw on meal_plan
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy slot_rw on meal_plan_slot
  for all using (
    exists (select 1 from meal_plan p where p.id = plan_id and is_household_member(p.household_id))
  ) with check (
    exists (select 1 from meal_plan p where p.id = plan_id and is_household_member(p.household_id))
  );

create policy leftover_rw on leftover
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Shared corpus is readable by any signed-in user; household recipes only by their household.
create policy recipe_read on recipe
  for select using (household_id is null or is_household_member(household_id));
create policy recipe_write on recipe
  for all using (household_id is not null and is_household_member(household_id))
  with check (household_id is not null and is_household_member(household_id));

create policy ingredient_read on ingredient for select using (auth.role() = 'authenticated');
create policy alias_read on ingredient_alias for select using (auth.role() = 'authenticated');
create policy recipe_ing_read on recipe_ingredient for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- joining a household by invite code
--
-- The caller is not a member yet, so member_insert would reject their own row. This function
-- is the one door: it runs as the table owner, checks the code, and adds exactly the caller
-- with exactly the role the owner chose. search_path is empty and every object is qualified.
--
-- Input is normalised the Crockford way (case-folded, spaces and hyphens dropped, O read as 0,
-- I and L as 1), so a code typed off a screen still works. A missing, expired, used or orphaned
-- code all get the same error, so the function does not tell a guesser which codes exist. Already being
-- a member is an error and leaves the code unused. The row lock stops two people redeeming one
-- code at the same moment.
-- ---------------------------------------------------------------------------
create or replace function public.join_household(p_code text) returns uuid
language plpgsql security definer volatile set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_inv  public.household_invite%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in to join a household' using errcode = 'insufficient_privilege';
  end if;

  v_code := translate(upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')), 'OIL', '011');

  select * into v_inv from public.household_invite i where i.code = v_code for update;

  -- A code is only as good as the owner who issued it: if they have since stopped being an
  -- owner of that household, so has the code.
  if not found or v_inv.used_at is not null or v_inv.expires_at <= now() or not exists (
       select 1 from public.household_member m
       where m.household_id = v_inv.household_id and m.user_id = v_inv.created_by
         and m.role = 'owner'
     ) then
    raise exception 'invite code is not valid' using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from public.household_member m
    where m.household_id = v_inv.household_id and m.user_id = v_uid
  ) then
    raise exception 'already a member of this household' using errcode = 'unique_violation';
  end if;

  insert into public.household_member (household_id, user_id, role)
  values (v_inv.household_id, v_uid, v_inv.role);

  update public.household_invite
     set used_by = v_uid, used_at = now()
   where code = v_inv.code;

  return v_inv.household_id;
end $$;

revoke execute on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;

-- ---------------------------------------------------------------------------
-- new users get a household automatically
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  insert into public.household default values returning id into h;
  insert into public.household_member (household_id, user_id, role) values (h, new.id, 'owner');
  return new;
end $$;

-- Only ever run by the trigger below, which does not need the caller to hold execute.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
