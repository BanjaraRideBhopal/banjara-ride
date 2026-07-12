# Phase 1 — DB Migration (Multi-Centre Foundation)

Status: DRAFT — awaiting owner approval before any SQL is executed.
Source of truth for architecture: `MULTI_CENTRE_SPEC.md` §3, §4, §8.1, §9.
This document is the only place implementation SQL/code changes should be written. Do not write SQL or code directly into source files — follow this spec.

---

## 1. Goal

Establish the multi-centre database foundation — `centres`, `vehicle_types`, `vehicles` tables (fully seeded), and `centre_id` columns on `bookings` and `customers` (with `customers` restructured to a surrogate PK) — while keeping the live app fully functional throughout, with no auth, no RLS policies, and no staff-facing UI changes beyond what is strictly required to keep the app working.

## 2. Scope

**In scope:**
- Create `centres` table, seed 3 rows.
- Create `vehicle_types` and `vehicles` tables, seed from `src/data/vehicles.js`.
- Add `centre_id` to `bookings`; delete the 22 dummy legacy rows; enforce NOT NULL.
- Restructure `customers` to a surrogate PK + `(mobile, centre_id)` uniqueness; backfill `centre_id` from existing bookings before those bookings are deleted.
- Minimal code change to `BookingSheet.js` so the app does not break once these constraints are live: load vehicles from Supabase instead of `vehicles.js`, and populate `centre_id` on booking/customer writes.

**Explicitly out of scope (later phases per MULTI_CENTRE_SPEC §8.2):**
- Supabase Auth, `profiles` table, login page (Phase 2, 4).
- RLS policies of any kind (Phase 3). Tables remain open under the public anon key, exactly as today.
- Removing the manual Centre dropdown from the booking form, centre-scoped search/reminders/bell/customer-lookup, super-admin centre switcher (Phase 5).
- Dropping the legacy `bookings.centre` text column or deleting `src/data/vehicles.js` — both stay in the repo/DB until Phase 5 verification passes (MULTI_CENTRE_SPEC §3.5, §3.3).
- Vehicle Master admin UI, Employees, Dashboard (Phase 6).

## 3. Prerequisites (must be true before starting)

1. CSV export of `bookings` and `customers` tables taken from the Supabase dashboard (MULTI_CENTRE_SPEC §8.1 pre-flight). Confirm this exists before touching the DB — do not proceed on the implementer's own initiative if it's missing; stop and ask the owner.
2. Supabase MCP server connected (`claude mcp add`) with write access to the project.
3. The 3 subagent files exist in `.claude/agents/` (spec-writer, implementer, reviewer).
4. This spec has been reviewed and explicitly approved by the owner, step by step — see §9 Human Gate below. No step in §6 may be executed without that approval, even if earlier steps were approved.

## 4. Files to read before implementing

- `c:\Projects\banjara-ride\CLAUDE.md`
- `c:\Projects\banjara-ride\MULTI_CENTRE_SPEC.md` (§3 Data Model, §4, §8.1, §9 — do not re-open §9 decisions)
- `c:\Projects\banjara-ride\src\data\vehicles.js` (source of truth for rate seed values)
- `c:\Projects\banjara-ride\src\data\options.js` (`bookingTypes` — must match rate keys exactly)
- `c:\Projects\banjara-ride\.claude\memory\vehicles_rates.md`
- `c:\Projects\banjara-ride\.claude\memory\supabase_setup.md`
- `c:\Projects\banjara-ride\src\pages\BookingSheet.js` (full file — the code-change section below references exact line ranges as of this spec's writing; re-locate by function name if line numbers have drifted)
- `c:\Projects\banjara-ride\src\utils\calculations.js`

## 5. Flagged decision — customers backfill (read before Step 6)

The task brief states the 22 existing `bookings` rows are dummy POC data to be **deleted, not backfilled**. It does not say the same about `customers`. Silently deleting customer records was not authorized, so this spec does **not** default to deleting `customers`.

Instead, the sequence below backfills `customers.centre_id` **from the existing `bookings.centre` text values before those bookings are deleted** (this is exactly the derivation MULTI_CENTRE_SPEC §3.4 step 3 describes: "likely derivable from their bookings' centres; a customer with bookings at 2 centres becomes 2 rows"). This preserves data and requires no destructive assumption. Given there are only 22 source bookings, the mapping is small enough to inspect and write explicitly rather than script generically — see Step 7.

**If any customer has zero bookings, or only bookings with a NULL/blank `centre` value, their `centre_id` cannot be derived. STOP and ask the owner what centre to assign (default suggestion: Sonagiri, since it's the only centre with live vehicle inventory today) — do not guess silently.**

## 6. Migration Steps

**Every step below requires an explicit "go ahead" from the owner before it is run, one step at a time — do not chain steps even if the owner approved an earlier one in the same conversation.** After each step, the implementer should report back what ran and its result before proceeding.

### Step 0 — Snapshot current state (read-only, safe to run without separate approval)

```sql
select id, mobile, customer_name, centre, booking_date, status from bookings order by id;
select mobile, name from customers order by mobile;
```

Save this output (in addition to the CSV backup already taken). It is the reference data for Step 7's backfill and for Step 12's precise delete-by-id.

---

### Step 1 — Create `centres`, seed 3 rows

```sql
create table centres (
  id bigint generated always as identity primary key,
  name text unique not null,
  created_at timestamptz not null default now()
);

insert into centres (name) values
  ('Sonagiri'),
  ('Rani Kamlapati Station'),
  ('IISER Bhouri');
```

---

### Step 2 — Create `vehicle_types`

One rate column per booking duration, named to map cleanly to `bookingTypes` in `options.js` (mapping given in §7 Code Changes). `late_charge_per_hour` and `security_deposit` are NOT NULL — every vehicle type has both. Rate columns are nullable (Lectrix EV has no 3 Hr rate).

```sql
create table vehicle_types (
  id bigint generated always as identity primary key,
  name text unique not null,
  rate_3hr     numeric,
  rate_6hr     numeric,
  rate_12hr    numeric,
  rate_1day    numeric,
  rate_2days   numeric,
  rate_3days   numeric,
  rate_4days   numeric,
  rate_5days   numeric,
  rate_6days   numeric,
  rate_7days   numeric,
  rate_15days  numeric,
  rate_1month  numeric,
  rate_3months numeric,
  late_charge_per_hour numeric not null,
  security_deposit     numeric not null,
  created_at timestamptz not null default now()
);
```

---

### Step 3 — Seed `vehicle_types` (all 18 types, values copied exactly from `src/data/vehicles.js`)

```sql
insert into vehicle_types
  (name, rate_3hr, rate_6hr, rate_12hr, rate_1day, rate_2days, rate_3days, rate_4days, rate_5days, rate_6days, rate_7days, rate_15days, rate_1month, rate_3months, late_charge_per_hour, security_deposit)
values
  ('Lectrix EV',   NULL, 340, 514, 599,  1050, 1500, 2000, 2400, 2800, 3100, 5500,  7025,  15000, 65,  800),
  ('Jupiter BS6',  190,  340, 480, 540,  1000, 1450, 1750, 2100, 2450, 2700, 5000,  8100,  18000, 65,  800),
  ('Activa 6G',    190,  340, 480, 540,  1000, 1450, 1750, 2100, 2450, 2700, 5000,  8100,  18000, 65,  800),
  ('Activa 5G',    160,  300, 380, 430,  800,  1100, 1400, 1650, 1900, 2200, 4500,  7100,  15000, 55,  800),
  ('StarCityPlus', 160,  300, 400, 480,  900,  1300, 1600, 1800, 2100, 2300, 4700,  7100,  17000, 55,  800),
  ('HF Delux',     160,  300, 400, 480,  900,  1300, 1600, 1800, 2100, 2300, 4700,  7100,  17000, 55,  800),
  ('Dream Yuga',   160,  300, 380, 430,  800,  1100, 1400, 1650, 1900, 2200, 4300,  6300,  13000, 55,  800),
  ('Splendor+',    160,  300, 380, 430,  800,  1100, 1400, 1650, 1900, 2200, 4300,  6300,  13000, 55,  800),
  ('TVS Sport',    160,  300, 380, 430,  800,  1100, 1400, 1650, 1900, 2200, 4300,  6300,  13000, 55,  800),
  ('Shine',        160,  300, 380, 430,  800,  1100, 1400, 1650, 1900, 2200, 4300,  6300,  13000, 55,  800),
  ('Shine BS6',    190,  340, 480, 550,  1000, 1450, 1750, 2100, 2450, 2700, 5000,  8100,  17000, 65,  800),
  ('Honda SP',     200,  380, 550, 700,  1280, 1620, 2200, 2800, 3200, 3550, 6420,  8900,  22000, 75,  800),
  ('Pulsar 125',   200,  380, 550, 700,  1280, 1620, 2200, 2800, 3200, 3550, 6420,  8900,  22000, 75,  800),
  ('Gixxer',       200,  380, 550, 700,  1280, 1620, 2200, 2800, 3200, 3550, 6420,  8900,  22000, 75,  800),
  ('Thunderbird',  267,  535, 802, 909,  1712, 2461, 3210, 3852, 4494, 4598, 9630,  12900, 30000, 110, 1000),
  ('CB 350',       320,  620, 920, 1250, 2250, 3180, 4000, 4900, 5800, 6500, 12000, 16500, 40000, 120, 1500),
  ('Hunter 350',   320,  620, 920, 1250, 2250, 3180, 4000, 4900, 5800, 6500, 12000, 16500, 40000, 120, 1500),
  ('Classic 350',  320,  620, 920, 1250, 2250, 3180, 4000, 4900, 5800, 6500, 12000, 16500, 40000, 120, 1500);
```

Note: `'Shine'` here is the BS4 variant from `dreamYugaRates` in `vehicles.js` (id 10) — do not confuse with `'Shine BS6'` (id 11), which is a distinct rate group.

---

### Step 4 — Create `vehicles`

```sql
create table vehicles (
  id bigint generated always as identity primary key,
  registration_number text unique not null,
  vehicle_type_id bigint not null references vehicle_types(id),
  centre_id bigint not null references centres(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

---

### Step 5 — Seed `vehicles` (all 52 registrations, all assigned to Sonagiri per MULTI_CENTRE_SPEC §9)

```sql
insert into vehicles (registration_number, vehicle_type_id, centre_id)
select v.reg, vt.id, (select id from centres where name = 'Sonagiri')
from (values
  ('MP04YH8685', 'Lectrix EV'),
  ('MP04ZD6010', 'Jupiter BS6'),
  ('MP04YR5523', 'Activa 6G'), ('MP04ZA9765', 'Activa 6G'), ('MP04ZC1643', 'Activa 6G'),
  ('MP04UL2618', 'Activa 6G'), ('MP38S6057', 'Activa 6G'), ('MP04ZK7670', 'Activa 6G'),
  ('MP04ZQ6498', 'Activa 6G'), ('MP04ZU0958', 'Activa 6G'), ('MP04ZW2835', 'Activa 6G'),
  ('MP04ZW3265', 'Activa 6G'), ('MP04ZW3269', 'Activa 6G'), ('MP04ZW8614', 'Activa 6G'),
  ('MP04ZY7794', 'Activa 6G'), ('MP04YA1224', 'Activa 6G'), ('MP04YA1027', 'Activa 6G'),
  ('MP04YA1080', 'Activa 6G'), ('MP04YA1056', 'Activa 6G'), ('MP04YA8780', 'Activa 6G'),
  ('MP04YB1143', 'Activa 6G'), ('MP04YA9538', 'Activa 6G'), ('MP04YH0480', 'Activa 6G'),
  ('MP04YF0914', 'Activa 6G'), ('MP04YQ2197', 'Activa 6G'),
  ('MP04UF4596', 'Activa 5G'), ('MP04UF4729', 'Activa 5G'), ('MP04UE0280', 'Activa 5G'), ('MP04UE0281', 'Activa 5G'),
  ('MP04ZQ9887', 'StarCityPlus'),
  ('MP04YR6056', 'HF Delux'), ('MP04YR5740', 'HF Delux'), ('MP04YR5653', 'HF Delux'),
  ('MP04QU5468', 'Dream Yuga'),
  ('MP04QT7794', 'Splendor+'),
  ('MP04ML0524', 'TVS Sport'),
  ('MP04QT6138', 'Shine'),
  ('MP04ZF2527', 'Shine BS6'), ('MP04VF2469', 'Shine BS6'), ('MP04ZP3336', 'Shine BS6'),
  ('MP04VF2334', 'Shine BS6'), ('MP04VD6987', 'Shine BS6'), ('MP04YH2878', 'Shine BS6'), ('MP04YN6919', 'Shine BS6'),
  ('MP04VC9332', 'Honda SP'), ('MP04YS8465', 'Honda SP'),
  ('MP04YS5213', 'Pulsar 125'),
  ('MP04QN7669', 'Gixxer'),
  ('MP04QF1727', 'Thunderbird'),
  ('MP04ZU7811', 'CB 350'),
  ('MP04ZW2275', 'Hunter 350'),
  ('MP04UM3438', 'Classic 350')
) as v(reg, type_name)
join vehicle_types vt on vt.name = v.type_name;
```

Expected row count: 52. Verify with `select count(*) from vehicles;` after running.

---

### Step 6 — `customers`: add surrogate id + nullable centre_id

```sql
alter table customers add column id bigint generated always as identity;
alter table customers add column centre_id bigint references centres(id);
```

(Do not set NOT NULL or change the PK yet — that's Step 9, after backfill.)

---

### Step 7 — Backfill `customers.centre_id` from existing `bookings.centre`

Run the inspection query first (reuse Step 0 output), then, per customer:

- If all their bookings share one non-null `centre` value → update that customer's `centre_id` directly:
  ```sql
  update customers set centre_id = (select id from centres where name = '<centre_name>')
  where mobile = '<mobile>';
  ```
- If a customer's bookings span **two different centres** → update the existing row for one centre, and **insert a duplicate row** (same mobile, same name) for the other centre:
  ```sql
  insert into customers (mobile, name, centre_id)
  values ('<mobile>', '<name>', (select id from centres where name = '<other_centre_name>'));
  ```
- If a customer has zero bookings, or only bookings with NULL/blank `centre` → **STOP**, do not guess. Ask the owner which centre to assign (see §5).

Given the dataset is only 22 bookings, the implementer should write out the exact per-customer `update`/`insert` statements based on the Step 0 snapshot rather than a generic script, and show them to the owner before running.

After this step, verify every row in `customers` has a non-null `centre_id`:
```sql
select * from customers where centre_id is null;
```
This must return zero rows before proceeding to Step 9.

---

### Step 8 — Drop the FK from `bookings.mobile` to `customers.mobile`

`customers.mobile` will no longer be unique on its own after Step 9 (uniqueness moves to `(mobile, centre_id)`), so any FK constraint referencing `customers.mobile` alone must be dropped. Per MULTI_CENTRE_SPEC §3.4 step 5, this is an accepted Phase 1 decision: `mobile` becomes a plain lookup column on `bookings` (it already duplicates `customer_name` for the same reason — avoiding joins). No FK is re-added.

First find the constraint name:
```sql
select tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
where tc.table_name = 'bookings'
  and tc.constraint_type = 'FOREIGN KEY'
  and kcu.column_name = 'mobile';
```
Then drop it:
```sql
alter table bookings drop constraint <constraint_name_from_above>;
```
If the query returns no rows, there is no such FK — skip this step and note it in the report back to the owner.

---

### Step 9 — `customers`: restructure PK

```sql
-- confirm no NULLs remain (must return 0 rows — re-run Step 7 check)
select * from customers where centre_id is null;

-- drop old primary key on mobile (find its name first)
select constraint_name from information_schema.table_constraints
where table_name = 'customers' and constraint_type = 'PRIMARY KEY';

alter table customers drop constraint <old_pk_name>;
alter table customers add primary key (id);
alter table customers alter column centre_id set not null;
alter table customers add constraint customers_mobile_centre_id_key unique (mobile, centre_id);
```

---

### Step 10 — `bookings`: add nullable `centre_id`

```sql
alter table bookings add column centre_id bigint references centres(id);
```

Do **not** set NOT NULL yet — the app must be updated to populate this column first (Step 11) or every subsequent write will fail once Step 13 runs.

---

### Step 11 — Deploy the required code change (see §7 Code Changes below)

This is a code deploy, not SQL, but it is a hard dependency between Step 10 and Step 13 — do not run Step 13 until this is deployed to production (Vercel) and smoke-tested (create a real test booking, confirm it saves with a non-null `centre_id`, confirm the rent amount for at least one vehicle matches the expected value from `vehicles.js`/`vehicle_types`).

---

### Step 12 — Delete the 22 dummy legacy bookings

Use the **exact id list captured in Step 0**, not a blanket `delete from bookings;` — by this point real bookings created after the Step 11 deploy may already exist in the table and must not be touched.

```sql
delete from bookings where id in (<comma-separated ids from Step 0 snapshot>);
```

Confirm no other rows remain with a NULL `centre_id`:
```sql
select id from bookings where centre_id is null;
```
Must return zero rows before Step 13.

---

### Step 13 — `bookings`: enforce NOT NULL

```sql
alter table bookings alter column centre_id set not null;
```

---

## 7. Code Changes — `src/pages/BookingSheet.js`

Two changes are needed. The first was explicitly requested; the second is a consequence of Steps 9/10/13 above and is required to keep the app working — flagged explicitly rather than assumed silently (see note at end of this section).

### 7a. Load vehicles from Supabase instead of `src/data/vehicles.js`

- Remove: `import { vehicles } from '../data/vehicles';` (line 3).
- Add state near the other `useState` declarations: `const [vehicles, setVehicles] = useState([]);`
- On mount (in the existing load-on-mount `useEffect`, or a new one), fetch and reshape data to match the exact object shape the rest of the file already expects (`{ id, type, rates: {...}, lateChargePerHour, securityDeposit, registrations: [...] }`), so `calculations.js` and every existing `vehicles.find(...)` call site (lines ~210, ~226, ~373, ~580, ~586, ~722 as of this writing) need **no further changes**:

  ```js
  const RATE_COLUMN_TO_LABEL = {
    rate_3hr: '3 Hr', rate_6hr: '6 Hr', rate_12hr: '12 Hr',
    rate_1day: '1 Day', rate_2days: '2 Days', rate_3days: '3 Days',
    rate_4days: '4 Days', rate_5days: '5 Days', rate_6days: '6 Days',
    rate_7days: '7 Days', rate_15days: '15 Days', rate_1month: '1 Month',
    rate_3months: '3 Months',
  };

  async function loadVehicles() {
    const { data: types } = await supabase.from('vehicle_types').select('*');
    const { data: regs } = await supabase.from('vehicles').select('*').eq('active', true);
    if (!types) return;
    const combined = types.map(t => ({
      id: t.id,
      type: t.name,
      rates: Object.fromEntries(
        Object.entries(RATE_COLUMN_TO_LABEL)
          .filter(([col]) => t[col] !== null)
          .map(([col, label]) => [label, t[col]])
      ),
      lateChargePerHour: t.late_charge_per_hour,
      securityDeposit: t.security_deposit,
      registrations: (regs || []).filter(r => r.vehicle_type_id === t.id).map(r => r.registration_number),
    }));
    setVehicles(combined);
  }
  ```

- **Do not filter by `centre_id` in this query in Phase 1.** There is no login yet, so the manual Centre dropdown is still how staff pick a centre — the vehicle dropdown must keep showing all active vehicle types/registrations regardless of centre, exactly as it does today reading from `vehicles.js`. Centre-based filtering of the vehicle list is explicitly Phase 5 (MULTI_CENTRE_SPEC §7.1).
- Every rate value must round-trip exactly — this is the same rule that previously caused ₹0 rent bugs. Spot-check after deploy: selecting Activa 6G + "1 Day" must estimate ₹540; Lectrix EV must not offer "3 Hr" as an option (its `rate_3hr` is NULL, so it's correctly excluded by the `filter` above).
- Keep `src/data/vehicles.js` in the repo (unused after this change) — do not delete it in Phase 1, per MULTI_CENTRE_SPEC §3.5 ("keep until Phase 5 verification passes, then delete").

### 7b. Populate `centre_id` on writes (required so Steps 9/13 don't break production)

Without this, the customers `upsert` (currently `onConflict: 'mobile'`, line ~308) breaks the moment Step 9 changes the unique constraint to `(mobile, centre_id)` — Postgres requires the `onConflict` target to match an existing constraint exactly. And every new booking insert breaks the moment Step 13 makes `bookings.centre_id` NOT NULL, since nothing currently writes to that column.

- On mount, fetch `centres` (`select id, name from centres`) into state and build a `name → id` lookup map, e.g. `const [centreIdByName, setCentreIdByName] = useState({});`
- In `handleSubmit` (around line 296–369):
  - Add `centre_id: centreIdByName[form.centre]` to the `payload` object used for both the `insert` and `update` calls to `bookings`.
  - Change the `customers` upsert (line 306–308) to:
    ```js
    await supabase
      .from('customers')
      .upsert(
        { mobile: form.mobileNumber, name: form.customerName, centre_id: centreIdByName[form.centre] },
        { onConflict: 'mobile,centre_id' }
      );
    ```
  - If `form.centre` is empty at submit time, block submission with the same validation pattern already used for missing Customer Name/Mobile/Vehicle (line ~298), since `centre_id` cannot be null.
- In `lookupCustomer` (line ~193–201):
  - Change `.single()` to `.maybeSingle()` (avoids throwing when zero or multiple rows match, since `mobile` is no longer guaranteed unique across centres).
  - Add `.eq('centre_id', centreIdByName[form.centre])` to the query, guarded so the lookup only runs once a centre is selected (if `form.centre` is empty, skip the lookup rather than querying with `centre_id: undefined`).

Note to reviewer/owner: **7b was not explicitly requested in the task brief** (which only asked for 7a). It is included because Steps 9 and 13 of this migration are destructive to app functionality without it — this is flagged here rather than assumed silently, per the "flag ambiguity" rule. If the owner prefers to defer 7b, Steps 9's NOT NULL and Step 13 must also be deferred until it ships, and the customers/bookings columns stay nullable in the interim.

## 8. Exit Criteria (reviewer checklist, verify via Supabase MCP)

- [ ] `centres` has exactly 3 rows: Sonagiri, Rani Kamlapati Station, IISER Bhouri.
- [ ] `vehicle_types` has exactly 18 rows; spot-check at least: Lectrix EV (`rate_3hr` is NULL, `late_charge_per_hour` 65, `security_deposit` 800), CB 350 (`rate_1day` 1250, `late_charge_per_hour` 120, `security_deposit` 1500), Activa 6G (`rate_1day` 540).
- [ ] `vehicles` has exactly 52 rows, every row `centre_id` = Sonagiri's id, `active` = true, `registration_number` unique, and the full set of registration numbers matches `.claude/memory/vehicles_rates.md` exactly (no missing/extra registrations).
- [ ] `bookings.centre_id` column exists, is `NOT NULL`, FK → `centres(id)`; the FK from `bookings.mobile` → `customers.mobile` no longer exists.
- [ ] `bookings` no longer contains the 22 pre-migration dummy rows (verify against the Step 0 id list); any bookings created during/after migration are untouched.
- [ ] `customers` has surrogate `id` bigint PK (old `mobile` PK is gone), `centre_id` is `NOT NULL` FK → `centres(id)`, and a unique constraint exists on `(mobile, centre_id)`.
- [ ] `customers` row count accounts for legitimate duplication only (one row per distinct centre a mobile number has booked at) — no unexplained data loss.
- [ ] `src/pages/BookingSheet.js` no longer imports `src/data/vehicles.js`; `src/data/vehicles.js` still exists in the repo, untouched, unused.
- [ ] End-to-end smoke test: create a new booking (any vehicle, any centre) — saves successfully, `bookings.centre_id` and `customers.centre_id` are both populated and correct, estimated rent matches the expected value for that vehicle+duration.
- [ ] Close an existing 'start' booking — still works.
- [ ] Edit an existing booking (both 'start' and 'end' status) — still works, including the customer-name auto-fill by mobile number.
- [ ] `npm run build` completes with zero ESLint errors before the code change is pushed.
- [ ] Deployed app (banjara-ride.vercel.app) manually walked through on desktop and mobile card view — no regressions.
- [ ] `.claude/memory/` files and `CLAUDE.md` updated to reflect: vehicles now live in Supabase, `bookings`/`customers` schema changes, per existing memory-update discipline.

## 9. Human Gate

Per MULTI_CENTRE_SPEC §8.1: "owner approves between phases; no auto-chaining." Within this phase, additionally: **each numbered step in §6 requires its own explicit approval** before the implementer runs it — this spec itself is not blanket authorization to execute all steps in sequence. Step 0 (read-only snapshot) is the only step that may run without a separate go-ahead.

## 10. Rollback

- **Before Step 6 (customers/bookings not yet touched):** rollback is trivial — `drop table vehicles; drop table vehicle_types; drop table centres;` (in that order, for FK dependency reasons). No app impact since the code change (§7) hasn't shipped yet and nothing references these tables.
- **Steps 6–9 (customers restructure):** if something goes wrong before Step 9's `drop constraint <old_pk_name>` is run, simply `alter table customers drop column id; alter table customers drop column centre_id;` to fully revert. If Step 9 has already run (PK changed), full rollback requires restoring `customers` from the pre-migration CSV backup (drop the table, recreate with the original `mobile text primary key, name, created_at` schema, re-import CSV).
- **Steps 10–13 (bookings):** before Step 12's delete, rollback is `alter table bookings drop column centre_id;`. After Step 12 has deleted the dummy rows, those 22 rows can only be restored from the CSV backup taken in Prerequisites — re-insert from CSV, then decide whether to retry the migration or leave `centre_id` nullable.
- **Code (§7):** ship as its own commit/PR so it can be reverted independently via `git revert` without touching the DB migration, and vice versa. Do not delete `src/data/vehicles.js` in this phase specifically so a code-only rollback has something to import.
- In all cases: stop, do not attempt a fix-forward without the owner's sign-off, and report exactly which step failed and the error returned.
