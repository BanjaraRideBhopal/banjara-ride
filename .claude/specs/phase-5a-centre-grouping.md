Status: COMPLETE — all steps executed and live as of 2026-07-16.

Source of truth for architecture: `MULTI_CENTRE_SPEC.md` §3.4 (customer scoping — superseded by global customer model, see §2 amendment below), §5 (RLS design/helper-function pattern), §9 (resolved decisions). Convention reference: `.claude/specs/phase-3-4-rls-login.md`.

---

## Amendment (2026-07-16 — post-implementation)

During testing, the initial group-based customer model (company staff see company customers, franchise see own) was found to be wrong. The correct model is:

**Customers are globally unique by mobile number across ALL centres.**

One mobile = one customer. First booking sets the name. Any subsequent booking at any centre (Sonagiri, Rani Kamlapati, or IISER) auto-fills and can update that same record. This supersedes the original group-based customer scoping in this spec. The vehicles grouping (company vs franchise) is unchanged.

The amendment added two additional steps (6 and 7 below) beyond the original 5 steps.

---

## 1. Goal

Split the three centres into two access groups for **vehicles** — company (Sonagiri + Rani Kamlapati Station, shared fleet) and franchise (IISER Bhouri, own fleet) — enforced at the RLS layer. Make **customers globally unique by mobile number** across all centres. Fix the customer-name lookup so any staff member sees a returning customer's name regardless of which centre they originally booked at.

## 2. What was built

### Vehicles (group-based RLS)
- `centres.is_franchise` BOOLEAN column — IISER Bhouri = true, others = false
- `public.is_franchise_user()` helper function — returns true if current user's centre is franchise
- `vehicles` SELECT policy replaced: company staff see all non-franchise vehicles; franchise staff see only own centre's vehicles; super_admin sees all

### Customers (global model)
- `customers` UNIQUE constraint changed from `(mobile, centre_id)` to `mobile` only
- `customers` SELECT, INSERT, UPDATE policies: all open to authenticated (no centre scoping)
- Duplicate customer rows deduped: kept oldest record per mobile, deleted duplicates
- `lookupCustomer` in BookingSheet.js: simple `.eq('mobile').maybeSingle()` — no centre filter
- Customer upsert: `onConflict: 'mobile'`, no `centre_id` in payload

### Bookings (unchanged)
Every booking still records and is scoped to the specific `centre_id` where it happened. No change to bookings RLS from Phase 3.

## 3. Steps executed

### Step 1 — Add `is_franchise` to `centres` ✓
```sql
ALTER TABLE public.centres ADD COLUMN is_franchise BOOLEAN NOT NULL DEFAULT false;
UPDATE public.centres SET is_franchise = true WHERE id = 3; -- IISER Bhouri
```

### Step 2 — Create `public.is_franchise_user()` ✓
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

### Step 3 — Dry-run validation ✓
Executed inside `begin...rollback`. All 4 logins verified:
- sonagiri@ and ranikamlapati@: 52 vehicles each ✓
- iiser@: 0 vehicles ✓
- admin@: 52 vehicles ✓
- Rolled back — production untouched.

### Step 4 — Real vehicles SELECT policy cutover ✓
```sql
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
```

### Step 5 — `lookupCustomer` code fix (initial, group-based) ✓
Removed `centre_id` filter from customer lookup. Superseded by Step 7.

### Step 6 — Global customer model: schema + RLS ✓
```sql
-- Dedup: delete duplicate mobile rows, keep oldest (lowest id)
DELETE FROM public.customers WHERE id IN (14, 6, 9);

-- Change unique constraint from (mobile, centre_id) to mobile only
ALTER TABLE public.customers DROP CONSTRAINT customers_mobile_centre_id_key;
ALTER TABLE public.customers ADD CONSTRAINT customers_mobile_key UNIQUE (mobile);

-- Open customers RLS to all authenticated (global pool)
DROP POLICY customers_select ON public.customers;
CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated USING (true);

DROP POLICY customers_insert_own_centre ON public.customers;
CREATE POLICY customers_insert ON public.customers
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY customers_update_own_centre ON public.customers;
CREATE POLICY customers_update ON public.customers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
```

### Step 7 — `lookupCustomer` final code (global) ✓
```js
async function lookupCustomer(mobile) {
  if (mobile.length !== 10) return;
  const { data } = await supabase
    .from('customers')
    .select('name')
    .eq('mobile', mobile)
    .maybeSingle();
  if (data) setForm(prev => ({ ...prev, customerName: data.name }));
}
```
Call sites in `handleChange`:
```js
if (name === 'mobileNumber') lookupCustomer(value);
if (name === 'centre' && updated.mobileNumber.length === 10) lookupCustomer(updated.mobileNumber);
```
Customer upsert in `handleSubmit`:
```js
{ mobile: form.mobileNumber, name: form.customerName }   // no centre_id
{ onConflict: 'mobile' }
```

### Step 8 — Hide vehicle types with 0 registrations from dropdown ✓ (2026-07-16)
Vehicle dropdown in BookingSheet.js filtered to only show types where `registrations.length > 0`:
```jsx
{vehicles.filter(v => v.registrations.length > 0).map(v => <option key={v.id}>{v.type}</option>)}
```
**Why:** IISER had 0 vehicles assigned. RLS already returned 0 registration rows, but all 18 vehicle types still showed in the dropdown (vehicle_types has no centre filter). With this fix, IISER sees an empty Vehicle dropdown. Sonagiri/Rani Kamlapati see all 18 types (all have registrations). Super admin unchanged (sees all). When IISER vehicles are added to the DB, they appear automatically — no code change needed.

## 4. Current live state (as of 2026-07-16)

| Table | Policy | Who sees what |
|---|---|---|
| bookings | per-centre | staff see own centre only; super_admin all |
| customers | global | all authenticated read/write; one row per mobile globally |
| vehicles | group-based | company staff see 52 (all Sonagiri); franchise (IISER) see 0; super_admin all |
| vehicle_types | open | all authenticated |
| centres | open | all authenticated |
| profiles | own row | each user own; super_admin all |

## 5. Rollback

**Vehicles only (revert to Phase 3 per-centre):**
```sql
drop policy vehicles_select on public.vehicles;
create policy vehicles_select_own_centre on public.vehicles
for select to authenticated
using (public.is_super_admin() or centre_id = public.get_my_centre_id());
```

**Customers (revert to per-centre — destructive to cross-centre data):**
Not recommended — global customer data would need to be re-partitioned by centre, which is ambiguous for customers who have only one row (we no longer know which centre they originally came from).
