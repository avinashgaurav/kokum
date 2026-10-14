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
create or replace function is_household_member(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from household_member
    where household_id = h and user_id = auth.uid()
  );
$$;

-- Owner check for membership writes. Same security-definer pattern, for the same reason.
create or replace function is_household_owner(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from household_member
    where household_id = h and user_id = auth.uid() and role = 'owner'
  );
$$;

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
-- new users get a household automatically
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  insert into household default values returning id into h;
  insert into household_member (household_id, user_id, role) values (h, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
