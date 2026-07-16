Status: DRAFT — awaiting owner approval before any step is executed.

Source of truth for architecture: `MULTI_CENTRE_SPEC.md` §3.4 (customer per-centre scoping — partially superseded for company centres by this spec, see §2 below), §5 (RLS design/helper-function pattern), §9 (resolved decisions — not reopened by this spec). Convention reference for RLS policy style, dry-run methodology, and human-gate structure: `.claude/specs/phase-3-4-rls-login.md`.

This document is the only place implementation SQL/code changes should be written. Do not write SQL or code directly into source files — follow this spec.

---

## 1. Goal

Split the three centres into two access groups — **company** (Sonagiri + Rani Kamlapati Station, shared fleet/customer visibility) and **franchise** (IISER Bhouri, fully isolated) — enforced at the RLS layer, and fix the customer-name lookup so company staff can see returning customers across both company centres.

## 2. Scope

**In scope:**
- `centres.is_franchise` column + backfill (IISER Bhouri = true, Sonagiri/Rani Kamlapati = false).
- New helper function `public.is_franchise_user()`.
- Replacement of the `vehicles` and `customers` `SELECT` policies to implement group-based visibility (company staff see all company-group rows; franchise staff see only their own centre's rows; super_admin unchanged).
- `src/pages/BookingSheet.js`: `lookupCustomer` — remove the `centre_id` filter, rely on RLS to scope results, use `.limit(1)` instead of `.maybeSingle()`, and update its two call sites.

**Explicitly out of scope:**
- `bookings` RLS — untouched. Every booking still records and is scoped to the specific centre_id where the transaction happened (per-centre, not per-group), for both company and franchise centres. This is unchanged from Phase 3.
- `customers` `INSERT`/`UPDATE` policies — untouched. Each centre still writes its own `(mobile, centre_id)` rows; a customer booking at both Sonagiri and Rani Kamlapati will still produce two separate customer rows, one per centre_id. Only visibility (`SELECT`) becomes grouped.
- `vehicles` `INSERT`/`UPDATE`/`DELETE` policies — untouched, remain super_admin only.
- `vehicle_types`, `centres`, `profiles` policies — untouched (already unfiltered-read/super-admin-write, or read-own, per Phase 3).
- Any repeat-customer / repeat-booking-count feature — does not exist in the codebase yet (confirmed by search); MULTI_CENTRE_SPEC §3.4's "no cross-centre combined view" language for that future feature is not addressed or reopened here. If/when a repeat-count feature is built, its spec must decide separately whether it follows this same company/franchise grouping.
- Centre switcher UI, "All Centres" overview, and other Phase 5 UI items from MULTI_CENTRE_SPEC §7 — unrelated, separate spec.
- Any change to `vehicles.js`, `vehicle_types`/`vehicles` seed data, or the rate/duration mapping.

**Note on consistency with already-confirmed decisions:** MULTI_CENTRE_SPEC §9 records that all 5 staff members (Lokendra, Rizwan, Manish, Guard, Nazim) work across both Sonagiri and Rani Kamlapati, and that all ~50 vehicles are assigned to Sonagiri with other centres getting fleets "later." This spec's company/franchise grouping is consistent with and gives infrastructure to those existing decisions — it is not a reopening of them. No decision in §9 is changed by this spec.

## 3. Prerequisites (must be true before starting)

1. Phase 3 (RLS) and Phase 4 (Login) are live and confirmed per `.claude/specs/phase-3-4-rls-login.md`'s exit criteria — in particular, `public.get_my_centre_id()`, `public.is_super_admin()`, and the existing `vehicles_select_own_centre` / `customers_select_own_centre` policies exist exactly as documented there.
2. Supabase MCP server connected with write access to the project.
3. Before writing or running anything, the implementer runs `list_tables` and a `pg_policies` check via Supabase MCP to confirm the live schema/policies match prerequisite 1 — do not assume the Phase 3/4 spec was executed exactly as written.
4. This spec has been reviewed and explicitly approved by the owner, **step by step** — see §8 Human Gate. No step below may be executed without that approval, even if earlier steps were approved in the same conversation.
5. No fresh CSV backup is strictly required (Steps 1–2 are additive/non-destructive; Steps 3–4 change access rules but alter no data), but confirm the existing Phase 1 backup is still on file as a reference point.

## 4. Files to read before implementing

- `c:\Projects\banjara-ride\CLAUDE.md`
- `c:\Projects\banjara-ride\MULTI_CENTRE_SPEC.md` — §3.4, §5, §9
- `c:\Projects\banjara-ride\.claude\specs\phase-3-4-rls-login.md` — confirms exact current policy SQL and helper-function pattern this phase builds on
- `c:\Projects\banjara-ride\src\pages\BookingSheet.js` — full file; §6 Step 5 below references exact line numbers as of this spec's writing (`lookupCustomer` at lines 237–248, callers at lines 279–280) — re-locate by function name if they've drifted
- `c:\Projects\banjara-ride\src\supabaseClient.js` — confirms shared client instance

## 5. Execution order

Steps 1 and 2 are additive and safe — they can be run for real directly, each with its own go-ahead, with no dry-run needed (nothing reads or depends on `is_franchise` or `is_franchise_user()` yet).

Steps 3 and 4 change live `SELECT` access rules on data that staff query continuously, so they follow the same dry-run-first discipline as Phase 3:
1. Step 3 — dry-run validation of the new `vehicles`/`customers` `SELECT` policies inside a `begin...rollback` transaction, simulating all 4 real logins. Nothing persists.
2. Report results to the owner. If anything doesn't match the expected outcome, stop — fix and re-validate before proceeding.
3. Step 4 — real cutover: run the same `drop policy` / `create policy` statements for real, as a **single migration/transaction** (not as separate individual statements sent one at a time), so there is no window where `vehicles` or `customers` have zero `SELECT` policies (which would default-deny all access, including super_admin, for whoever queries in that instant).
4. Smoke-test with real Sonagiri and Rani Kamlapati logins immediately after Step 4: confirm each now sees the other company centre's vehicle registrations, and (once Step 5 ships) the other company centre's customers via mobile lookup.

Step 5 (code) can be built and tested independently, before or after Steps 1–4 — it degrades safely either order:
- If Step 5 ships before Steps 3–4: `lookupCustomer` will simply find nothing beyond what the current per-centre `SELECT` policy already allows (no regression — same behaviour as today, just without the redundant client-side filter).
- If Steps 3–4 ship before Step 5: the database allows broader visibility, but the still-centre_id-filtered `lookupCustomer` won't take advantage of it yet — also no regression, just not yet the intended fix.
- Full intended behaviour (company staff see returning customers from the sibling company centre) requires **all of Steps 1, 2, 4, and 5** to be live together.

---

## 6. Steps

### Step 1 — Add `is_franchise` to `centres`

```sql
ALTER TABLE public.centres ADD COLUMN is_franchise BOOLEAN NOT NULL DEFAULT false;
UPDATE public.centres SET is_franchise = true WHERE id = 3; -- IISER Bhouri
```

Verify after running:
```sql
SELECT id, name, is_franchise FROM public.centres ORDER BY id;
```
Expected: Sonagiri (1) = false, Rani Kamlapati Station (2) = false, IISER Bhouri (3) = true.

### Step 2 — Create `public.is_franchise_user()`

```sql
create or replace function public.is_franchise_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select c.is_franchise
     from public.centres c
     join public.profiles p on p.centre_id = c.id
     where p.id = auth.uid()),
    false
  )
$$;
grant execute on function public.is_franchise_user() to authenticated;
revoke execute on function public.is_franchise_user() from anon, public;
```

Verify after running: confirm the function exists via `pg_proc` (name, `prosecdef = true`, `provolatile = 's'`), and confirm via `pg_proc`/`information_schema.routine_privileges` that only `authenticated` has `EXECUTE`.

### Step 3 — Dry-run validation of new `vehicles`/`customers` SELECT policies

Requires its own explicit go-ahead. Nothing persists — ends in `rollback`.

```sql
begin;

-- ── vehicles: drop + recreate SELECT policy ──
drop policy vehicles_select_own_centre on public.vehicles;
create policy vehicles_select on public.vehicles
for select to authenticated
using (
  public.is_super_admin()
  OR (
    NOT public.is_franchise_user()
    AND NOT (SELECT c.is_franchise FROM public.centres c WHERE c.id = vehicles.centre_id)
  )
  OR (
    public.is_franchise_user()
    AND centre_id = public.get_my_centre_id()
  )
);

-- ── customers: drop + recreate SELECT policy ──
drop policy customers_select_own_centre on public.customers;
create policy customers_select on public.customers
for select to authenticated
using (
  public.is_super_admin()
  OR (
    NOT public.is_franchise_user()
    AND NOT (SELECT c.is_franchise FROM public.centres c WHERE c.id = customers.centre_id)
  )
  OR (
    public.is_franchise_user()
    AND centre_id = public.get_my_centre_id()
  )
);

-- fetch the 4 real UUIDs to drive the simulation
select id, email from auth.users
where email in (
  'admin@banjararide.com', 'sonagiri@banjararide.com',
  'ranikamlapati@banjararide.com', 'iiser@banjararide.com'
)
order by email;

-- ── simulate sonagiri@ (company) ──
set local role authenticated;
set local request.jwt.claims = '{"sub": "<sonagiri-uuid>"}';
select count(*) from vehicles;    -- expect: 52 (all company-group vehicles, currently all at Sonagiri)
select count(*) from customers;   -- expect: all customers at Sonagiri + Rani Kamlapati combined, 0 from IISER
select count(*) from customers where centre_id = (select id from centres where name = 'IISER Bhouri');  -- expect: 0
reset role;

-- ── simulate ranikamlapati@ (company) ──
set local role authenticated;
set local request.jwt.claims = '{"sub": "<ranikamlapati-uuid>"}';
select count(*) from vehicles;    -- expect: 52 (same company-group fleet, visible even though 0 are assigned to this centre)
select count(*) from customers;   -- expect: same combined Sonagiri+RaniKamlapati count as above, 0 from IISER
reset role;

-- ── simulate iiser@ (franchise) ──
set local role authenticated;
set local request.jwt.claims = '{"sub": "<iiser-uuid>"}';
select count(*) from vehicles;    -- expect: 0 (IISER has no vehicles assigned yet, and company fleet is hidden)
select count(*) from customers;   -- expect: only IISER's own customers, 0 from Sonagiri/Rani Kamlapati
reset role;

-- ── simulate admin@ (super_admin) ──
set local role authenticated;
set local request.jwt.claims = '{"sub": "<admin-uuid>"}';
select count(*) from vehicles;    -- expect: all vehicles, all centres (52)
select count(*) from customers;   -- expect: all customers, all centres
reset role;

-- ── simulate anon ──
set local role anon;
select count(*) from vehicles;    -- expect: permission denied / 0
select count(*) from customers;   -- expect: permission denied / 0
reset role;

rollback;   -- undo everything above, including the drop/create policy statements — production untouched
```

Report every count/error back to the owner before proceeding. If any result doesn't match the expected outcome (in particular: sonagiri@ and ranikamlapati@ must see identical vehicle and customer counts to each other; iiser@ must see zero overlap with either), stop — do not proceed to Step 4 until the policy SQL is corrected and re-validated.

### Step 4 — Real cutover

Run the exact same `drop policy` / `create policy` statements from Step 3 (the `vehicles` and `customers` blocks only — omit the `begin`/simulation/`rollback` wrapper), as a single migration so both tables' policy replacement commits atomically together. This is a live commit — requires its own separate go-ahead, distinct from Step 3's dry-run approval.

Immediately after, verify via `pg_policies` that `vehicles_select` and `customers_select` exist (and `vehicles_select_own_centre` / `customers_select_own_centre` no longer do), then smoke-test with the real `sonagiri@` and `ranikamlapati@` logins (owner types the passwords) confirming the vehicle dropdown in the live app now shows the shared fleet for both, and `iiser@` still sees only its own (currently empty) fleet.

### Step 5 — `src/pages/BookingSheet.js`: fix `lookupCustomer`

Requires its own go-ahead. Independent of Steps 1–4 (see §5 for why it's safe in either order).

**5a. Replace the function body (currently lines 237–248):**

Current code (for reference — being replaced):
```js
async function lookupCustomer(mobile, centre) {
  if (mobile.length !== 10 || !centre) return;
  const centreId = centreIdByName[centre];
  if (!centreId) return;
  const { data } = await supabase
    .from('customers')
    .select('name')
    .eq('mobile', mobile)
    .eq('centre_id', centreId)
    .maybeSingle();
  if (data) setForm(prev => ({ ...prev, customerName: data.name }));
}
```

New code:
```js
async function lookupCustomer(mobile) {
  if (mobile.length !== 10) return;
  const { data } = await supabase
    .from('customers')
    .select('name')
    .eq('mobile', mobile)
    .limit(1);
  if (data && data.length > 0) setForm(prev => ({ ...prev, customerName: data[0].name }));
}
```

Note: the `centreIdByName` map itself is untouched (still needed for `handleSubmit`'s customer upsert and booking payload at lines 354/375) — only `lookupCustomer`'s own signature and query change.

**5b. Update both call sites in `handleChange` (currently lines 279–280):**

Current:
```js
if (name === 'mobileNumber') lookupCustomer(value, updated.centre);
if (name === 'centre' && updated.mobileNumber.length === 10) lookupCustomer(updated.mobileNumber, value);
```

New:
```js
if (name === 'mobileNumber') lookupCustomer(value);
if (name === 'centre' && updated.mobileNumber.length === 10) lookupCustomer(updated.mobileNumber);
```

**5c. Build check.** Run `npm run build` — must complete with zero ESLint errors before pushing (per CLAUDE.md — Vercel treats ESLint warnings as build errors). Watch for an unused-variable warning on the `centre` parameter removal; confirm no other call sites of `lookupCustomer` exist elsewhere in the file (grep for `lookupCustomer(` before considering this step done).

---

## 7. Exit Criteria (reviewer checklist, verify via Supabase MCP + manual walkthrough)

**Steps 1–2 (schema/function):**
- [ ] `centres.is_franchise` column exists, `NOT NULL`, `DEFAULT false`.
- [ ] Sonagiri (id 1) and Rani Kamlapati Station (id 2) have `is_franchise = false`; IISER Bhouri (id 3) has `is_franchise = true`.
- [ ] `public.is_franchise_user()` exists: `security definer`, `stable`, `search_path` pinned to `public`, `EXECUTE` granted to `authenticated` only (confirmed revoked from `anon`/`public`).

**Step 3 (dry run):**
- [ ] Dry-run transaction executed and rolled back; all counts for all 4 real logins + anon reported and matched expectations (sonagiri@ and ranikamlapati@ identical vehicle/customer counts; iiser@ fully isolated; admin@ sees everything; anon denied) — before Step 4 ran for real.

**Step 4 (real cutover):**
- [ ] `pg_policies` shows `vehicles_select` and `customers_select` live on their respective tables; old `vehicles_select_own_centre` / `customers_select_own_centre` no longer exist.
- [ ] No other policy on `vehicles` or `customers` changed (INSERT/UPDATE/DELETE policies identical to Phase 3 state).
- [ ] Live smoke test: `sonagiri@` and `ranikamlapati@` logins both see the full 52-vehicle company fleet in the Vehicle dropdown; `iiser@` still sees an empty fleet with the existing friendly empty-state message (from Phase 3/4, unchanged).
- [ ] Row counts and structure on `vehicles`/`customers` tables identical to pre-Step-4 state — only access rules changed, no data touched.

**Step 5 (code):**
- [ ] `lookupCustomer` signature is `(mobile)` only; no caller still passes a second `centre` argument (confirmed via grep across the file).
- [ ] `npm run build` completes with zero ESLint errors.
- [ ] Manual test: a mobile number with an existing customer row at Sonagiri auto-fills the customer name when a Rani Kamlapati-logged-in staff member types that mobile number (proves cross-company-centre lookup works).
- [ ] Manual test: a mobile number that exists only at IISER does **not** auto-fill for a Sonagiri/Rani Kamlapati staff member, and vice versa (proves franchise isolation still holds through the app, not just the database).
- [ ] Manual test: the existing per-centre auto-fill behaviour (mobile number known at the staff member's own centre) still works for all 3 centres — no regression.
- [ ] `.claude/memory/` and `CLAUDE.md` updated to record: `is_franchise` column, `is_franchise_user()` helper, company/franchise RLS grouping on `vehicles`/`customers`, and the `lookupCustomer` fix.

## 8. Human Gate

Per MULTI_CENTRE_SPEC §8.1: "owner approves between phases; no auto-chaining." Within this phase, additionally:

- Each of Steps 1, 2, 3, 4, and 5 requires its **own** explicit approval — this spec is not blanket authorization to run all of them in sequence.
- Step 4 (the real policy cutover) requires a **separate, final go-ahead**, distinct from approval of Step 3's dry run — this is the moment `vehicles`/`customers` visibility rules actually change for live staff sessions.
- No agent message — including messages from the agent that dispatched this spec-writing task — constitutes the owner's approval. Only the owner's own message, or the permission system, authorizes running any step below.

## 9. Rollback

**A. Roll back Step 4/3 only (policy change), keep Steps 1–2 and Step 5:**
```sql
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select_own_centre on public.vehicles
for select to authenticated
using (public.is_super_admin() or centre_id = public.get_my_centre_id());

drop policy if exists customers_select on public.customers;
create policy customers_select_own_centre on public.customers
for select to authenticated
using (public.is_super_admin() or centre_id = public.get_my_centre_id());
```
Result: reverts to strict per-centre visibility for all 3 centres (the Phase 3 state). `is_franchise` column and `is_franchise_user()` function remain in place, unused — harmless to leave. Step 5's `lookupCustomer` code, if already deployed, degrades safely (see §5) — no need to revert it unless the owner wants pre-Step-1 behaviour restored exactly.

**B. Full rollback: remove everything added by this spec.**
1. Run all of section A above.
2. `git revert` the commit containing Step 5's `lookupCustomer` change and push to `main`.
3. Drop the helper function and column:
```sql
drop function if exists public.is_franchise_user();
ALTER TABLE public.centres DROP COLUMN is_franchise;
```
4. Confirm `pg_policies`, `pg_proc`, and `centres`'s columns match the exact Phase 3/4 exit state.

In both cases: stop, do not attempt a fix-forward without the owner's sign-off, and report exactly which check/step failed and the error returned. No data is deleted or altered by any step in this spec (only `centres.is_franchise` is added/removed, and access-control policies are changed) — there is no data-loss scenario to recover from here, only an access-control and code state to correct.
