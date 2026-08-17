# Phase 14 — Rate Groups + Vehicle Master Edit

**Status:** IMPLEMENTED — migration + RLS live, code complete, build clean. Verified at the DB/logic level (no login credentials available to Claude for a real browser click-through) — recommend the owner runs through the exit criteria in §9 once deployed.

---

## Implementation Notes (2026-08-17)

**Type correction:** all new tables/columns use `BIGINT`/`BIGSERIAL`, not the spec's `SERIAL`/`INT` — every existing PK in this DB (`vehicles.id`, `vehicle_types.id`, `centres.id`) is `BIGINT`, confirmed via `information_schema.columns` before writing any DDL (same correction class as Phase 11).

**Migration results:**
- `rate_groups`: 2 rows (Company Owned id 1, IISER id 2)
- `vehicle_type_rates`: 22 rows after Step 3c+3d (21 original vehicle_types migrated to Company Owned + 1 IISER card for VEHICLE BHAURI). Spot-check: Activa 6G Company Owned exact match with original `vehicle_types` row (deposit 800, late 65, 3hr 190, 1day 540, 3months 18000).
- `vehicles.rate_group_id`: backfilled on all 58 vehicles (53 company → Company Owned, 5 IISER → IISER), verified 0 nulls before `NOT NULL`.
- **Fleet size correction**: spec/docs said 53 total vehicles as of 2026-07-29; live count on 2026-08-17 is 58 (53 company + 5 IISER, up from 1 IISER vehicle) — the fleet grew in the ~3 weeks since the last doc snapshot, unrelated to this phase.

**Known live gap (not a bug, flagged before implementation):** of IISER's 5 vehicles, 4 use "VEHICLE BHAURI" (has an IISER rate card) and 1 — MP04SQ7201 — uses "Access 125" (no IISER rate card exists, only Company Owned). This vehicle will show the "no rate card" warning and block booking until an admin adds an Access 125 + IISER rate card via the new Rate Cards section. This is exactly the behavior §6.4 designs for, just confirming it has a real, immediate instance on day one.

**Two spec gaps caught and resolved with owner before building (not silently deviated):**
1. §7.1's new edit-form field table omitted Centre entirely, which would have silently removed Phase 6a's centre-reassignment capability. Owner chose to keep Centre as a 5th field, super_admin only.
2. §7.1 gives staff a Registration+Active edit capability, but nothing in the spec's file list (§8) touches `App.js` routing or the `BookingSheet.js` "Vehicles" nav link (both were previously gated to `super_admin`/`isOwner`), and `vehicles` had **no staff UPDATE RLS policy at all**. Owner chose to open both up: `App.js` and the nav link now allow all logged-in users, and a new `vehicles_update_staff_own_centre` policy (`USING`/`WITH CHECK` both `centre_id = get_my_centre_id()`) lets staff UPDATE their own centre's vehicles. Documented clearly in `CLAUDE.md` that RLS scopes by row/centre only, not by column — staff being limited to Registration+Active is a UI-only restriction, not a DB one.

**Post-ship cleanup (2026-08-17):** owner spotted "VEHICLE BHAURI | Company Owned" and "Access 125 | Company Owned" both listed in the Rate Cards table and flagged that *both* types are actually IISER-only in practice (Claude's initial assumption that Access 125 was a legitimate standalone company type was wrong — corrected by owner). Step 3c's migration copies *every* vehicle type into Company Owned per spec, regardless of where it's actually used, which is what produced these two dead/misleading entries. Confirmed via query that 0 company-centre vehicles use either type.
- **VEHICLE BHAURI**: deleted its Company Owned row directly via SQL (not through the app — no delete UI exists for rate cards, per spec's explicit "no delete" rule for the *feature*; this was one-off cleanup, not a new capability). Now has exactly one rate card (IISER only).
- **Access 125**: rather than delete-then-separately-add, the owner pointed out the simpler fix — **UPDATE the existing Company Owned row's `rate_group_id` to IISER**. This simultaneously removed the wrong Company Owned entry and created the IISER rate card that MP04SQ7201 (the only registered Access 125, at IISER) actually needed, reusing its real existing rates (₹0 deposit, ₹70/hr, ₹200/3hr, ₹1000/1day) instead of requiring someone to re-enter them from scratch. **This also resolves the "known live gap" flagged at ship time** — MP04SQ7201 no longer shows the "no rate card" warning.

**Scope expanded beyond §5/§6 (owner approved after being flagged):** the spec's rate-lookup rewrite only covered the initial booking form's rent/deposit auto-fill. Left as originally scoped, two things would have kept reading the old `vehicle_types` fallback instead of the new rate-group-aware source: the Booking Duration dropdown's option-filtering, and `recalculateFinal()`'s (close-booking) extra-hour/day charge calculations — a latent risk of wrong-group rates when closing an IISER booking, or a duration option that resolves to ₹0. Both now route through the same `lookupRateCard`/`rateCardToVehicle` helpers as the initial form. This also required switching the `vehicles` fetch from `.eq('active', true)` to unfiltered (a separate `activeRegs` derivation still feeds the Vehicle Number dropdown for new bookings) — `vehicleRegToGroup` needs inactive vehicles covered too, so closing an old booking whose vehicle was later deactivated still resolves correctly.

---
**Date:** August 2026
**Source of truth:** `CLAUDE.md`, `CLAUDE_HANDOFF.md`, `src/pages/VehicleMaster.js`, `src/pages/BookingSheet.js`, `src/utils/calculations.js`

---

## 1. Goal

Two related improvements shipped together:

1. **Rate Groups** — introduce per-group rate cards so the same vehicle type (e.g. Activa) can have different rates at different centres/groups (Company Owned vs IISER). Currently rates live on `vehicle_types` globally — this makes it impossible for IISER to have its own prices for the same vehicle type.

2. **Vehicle Master full edit** — the current Edit button only allows changing `centre_id` and `active` status. Extend it to allow editing: registration number, vehicle type, rate group, and active status. Staff can edit registration + active status only; super_admin can edit all fields including rate group.

---

## 2. The Problem (for context)

Current schema: `vehicle_types` stores both the vehicle name AND its rate card. One rate card per type globally.

Problem: Adding an Activa at IISER pulls Sonagiri's Activa rates (₹190/3hr etc.) because they share the same `vehicle_type`. IISER needs different pricing.

Current workaround: IISER uses a placeholder type "VEHICLE BHAURI" with its own rate card. This breaks as soon as a real vehicle type (Activa, Jupiter etc.) is needed at IISER with different rates.

---

## 3. New Schema

### 3.1 New table: `rate_groups`

```sql
CREATE TABLE rate_groups (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,   -- e.g. 'Company Owned', 'IISER'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Seed data (2 rows):
```sql
INSERT INTO rate_groups (name) VALUES ('Company Owned'), ('IISER');
```

### 3.2 New table: `vehicle_type_rates`

One row per (vehicle_type × rate_group) combination. Stores the rate card for that combination.

```sql
CREATE TABLE vehicle_type_rates (
  id SERIAL PRIMARY KEY,
  vehicle_type_id INT NOT NULL REFERENCES vehicle_types(id),
  rate_group_id INT NOT NULL REFERENCES rate_groups(id),
  security_deposit NUMERIC NOT NULL DEFAULT 0,
  late_charge_per_hour NUMERIC NOT NULL DEFAULT 0,
  rate_3hr NUMERIC,
  rate_6hr NUMERIC,
  rate_12hr NUMERIC,
  rate_1day NUMERIC,
  rate_2days NUMERIC,
  rate_3days NUMERIC,
  rate_4days NUMERIC,
  rate_5days NUMERIC,
  rate_6days NUMERIC,
  rate_7days NUMERIC,
  rate_15days NUMERIC,
  rate_1month NUMERIC,
  rate_3months NUMERIC,
  UNIQUE (vehicle_type_id, rate_group_id)
);
```

### 3.3 `vehicles` — add `rate_group_id`

```sql
ALTER TABLE vehicles ADD COLUMN rate_group_id INT REFERENCES rate_groups(id);
```

### 3.4 `vehicle_types` — keep rate columns for now

Do NOT drop rate columns from `vehicle_types` yet — the booking form currently reads from them. They will be removed in a follow-up phase once `vehicle_type_rates` is the confirmed source of truth and all code is migrated. Mark them as deprecated in CLAUDE.md after this phase.

---

## 4. Migration Plan

All steps require owner approval before running. Implementer checks live schema via Supabase MCP first and reports before executing any SQL.

**Step 1 — Create `rate_groups` + seed:**
```sql
CREATE TABLE rate_groups (...);
INSERT INTO rate_groups (name) VALUES ('Company Owned'), ('IISER');
```

**Step 2 — Create `vehicle_type_rates`:**
```sql
CREATE TABLE vehicle_type_rates (...);
```

**Step 3 — Migrate existing rate cards from `vehicle_types` → `vehicle_type_rates` (Company Owned group):**
```sql
INSERT INTO vehicle_type_rates (
  vehicle_type_id, rate_group_id,
  security_deposit, late_charge_per_hour,
  rate_3hr, rate_6hr, rate_12hr, rate_1day, rate_2days, rate_3days,
  rate_4days, rate_5days, rate_6days, rate_7days, rate_15days, rate_1month, rate_3months
)
SELECT
  vt.id,
  (SELECT id FROM rate_groups WHERE name = 'Company Owned'),
  vt.security_deposit, vt.late_charge_per_hour,
  vt.rate_3hr, vt.rate_6hr, vt.rate_12hr, vt.rate_1day, vt.rate_2days, vt.rate_3days,
  vt.rate_4days, vt.rate_5days, vt.rate_6days, vt.rate_7days, vt.rate_15days, vt.rate_1month, vt.rate_3months
FROM vehicle_types vt;
```
This creates one "Company Owned" rate card for every existing vehicle type — including VEHICLE BHAURI.

**Step 4 — Create IISER rate card for VEHICLE BHAURI:**
Copy VEHICLE BHAURI's rates into the IISER rate group as well (so IISER vehicles keep working immediately after migration):
```sql
INSERT INTO vehicle_type_rates (
  vehicle_type_id, rate_group_id,
  security_deposit, late_charge_per_hour,
  rate_3hr, rate_6hr, rate_12hr, rate_1day, rate_2days, rate_3days,
  rate_4days, rate_5days, rate_6days, rate_7days, rate_15days, rate_1month, rate_3months
)
SELECT
  vt.id,
  (SELECT id FROM rate_groups WHERE name = 'IISER'),
  vt.security_deposit, vt.late_charge_per_hour,
  vt.rate_3hr, vt.rate_6hr, vt.rate_12hr, vt.rate_1day, vt.rate_2days, vt.rate_3days,
  vt.rate_4days, vt.rate_5days, vt.rate_6days, vt.rate_7days, vt.rate_15days, vt.rate_1month, vt.rate_3months
FROM vehicle_types vt
WHERE vt.name = 'VEHICLE BHAURI';
```
After migration you can edit the IISER rate card via Vehicle Master to set proper IISER prices.

**Step 5 — Add `rate_group_id` to `vehicles`:**
```sql
ALTER TABLE vehicles ADD COLUMN rate_group_id INT REFERENCES rate_groups(id);
```

**Step 6 — Backfill `rate_group_id` on existing vehicles:**
```sql
-- All Sonagiri/Rani Kamlapati vehicles → Company Owned
UPDATE vehicles
SET rate_group_id = (SELECT id FROM rate_groups WHERE name = 'Company Owned')
WHERE centre_id IN (
  SELECT id FROM centres WHERE is_franchise = false
);

-- IISER vehicles → IISER
UPDATE vehicles
SET rate_group_id = (SELECT id FROM rate_groups WHERE name = 'IISER')
WHERE centre_id IN (
  SELECT id FROM centres WHERE is_franchise = true
);
```

Verify: `SELECT COUNT(*) FROM vehicles WHERE rate_group_id IS NULL;` should return 0.

**Step 7 — Add NOT NULL constraint after backfill:**
```sql
ALTER TABLE vehicles ALTER COLUMN rate_group_id SET NOT NULL;
```

---

## 5. RLS for New Tables

```sql
-- rate_groups: readable by all authenticated; writable by super_admin only
ALTER TABLE rate_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all" ON rate_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin_write" ON rate_groups FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- vehicle_type_rates: readable by all authenticated; writable by super_admin only
ALTER TABLE vehicle_type_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all" ON vehicle_type_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin_write" ON vehicle_type_rates FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Anon blocked on both (RLS enabled + no anon policy = default deny)
```

---

## 6. Booking Form Changes (`BookingSheet.js`)

### 6.1 Rate lookup change

Currently: booking form loads `vehicle_types` with rate columns, looks up rate by `vehicle_type_id`.

New: booking form loads `vehicle_type_rates` joined with `rate_groups`, looks up rate by `(vehicle_type_id, rate_group_id)` where `rate_group_id` comes from the selected vehicle registration.

```js
// When vehicle type selected → filter registrations
// When registration selected → get its rate_group_id
// Look up vehicle_type_rates where vehicle_type_id = selectedType.id AND rate_group_id = selectedVehicle.rate_group_id
// If no rate card found → show warning "No rate card configured for this vehicle in its rate group"
```

### 6.2 Data loading change

Add `rate_group_id` to the vehicles query:
```js
supabase.from('vehicles')
  .select('id, registration_number, vehicle_type_id, centre_id, active, rate_group_id')
```

Add a new query for `vehicle_type_rates`:
```js
supabase.from('vehicle_type_rates')
  .select('vehicle_type_id, rate_group_id, security_deposit, late_charge_per_hour, rate_3hr, rate_6hr, rate_12hr, rate_1day, rate_2days, rate_3days, rate_4days, rate_5days, rate_6days, rate_7days, rate_15days, rate_1month, rate_3months')
```

### 6.3 Rate key mapping

Existing booking type → rate column mapping must be preserved exactly (rate key mismatch previously caused ₹0 rent bugs — Phase 1 note). Confirm mapping from `calculations.js` and `.claude/memory/vehicles_rates.md` before changing any rate lookup logic.

### 6.4 Null rate card handling

If `vehicle_type_rates` returns no row for `(vehicle_type_id, rate_group_id)`:
- Show an inline warning below the vehicle number dropdown: "⚠ No rate card configured for this vehicle. Contact admin."
- Set `rentAmount = ''` and `securityDeposit = ''` — do not auto-fill with 0 (0 would be silently wrong)
- Staff cannot save the booking until a rate card is configured

---

## 7. Vehicle Master Changes (`VehicleMaster.js`)

### 7.1 Full edit form (extended)

Current edit form: only `centre_id` + `active`.

New edit form fields:

| Field | Editable by | Notes |
|---|---|---|
| Registration Number | Staff + super_admin | Text input, trim on save |
| Vehicle Type | Super admin only | Dropdown from `vehicle_types` |
| Rate Group | Super admin only | Dropdown from `rate_groups` |
| Active | Staff + super_admin | Toggle/dropdown |

- Staff see Registration + Active fields only; Vehicle Type and Rate Group rows hidden
- Super admin sees all 4 fields
- On save: update `vehicles` row with changed fields
- Validation: registration number must not be blank; must be unique (check before save, show inline error if duplicate)

### 7.2 Rate group column in vehicle list

Add a "Rate Group" column to the vehicle list table showing each vehicle's assigned rate group name.

Current columns: Registration | Vehicle Type | Centre | Status | Edit
New columns: Registration | Vehicle Type | Centre | **Rate Group** | Status | Edit

### 7.3 Rate card management (super_admin only)

New section below the vehicle list: **"Rate Cards"** — a table of all `vehicle_type_rates` entries.

Columns: Vehicle Type | Rate Group | Deposit | Late Charge/hr | 3hr | 6hr | 12hr | 1 Day | ... | Edit

- Edit button per row: opens an inline edit form with all 13 rate fields + deposit + late charge
- "+ Add Rate Card" button: opens a form with Vehicle Type dropdown + Rate Group dropdown + all rate fields
  - Validation: `(vehicle_type, rate_group)` combination must be unique — show error if already exists
- No delete on rate cards — mark as awareness: deleting a rate card would break vehicles using it

### 7.4 Add new vehicle form (updated)

Current add form: registration + vehicle type (or new type) + centre.

New add form: registration + vehicle type + **rate group** + centre + active.

- Rate Group dropdown: loaded from `rate_groups`
- Default: auto-select based on centre (Company Owned for Sonagiri/Rani Kamlapati, IISER for IISER) — staff can override
- When adding a new vehicle type inline ("+Add new type..."): the new type's rate card goes into `vehicle_type_rates` for the selected rate group, not into `vehicle_types` columns
  - `vehicle_types` insert: name only (no rate columns — they're now in `vehicle_type_rates`)
  - `vehicle_type_rates` insert: the full rate card for `(new_type_id, selected_rate_group_id)`

---

## 8. Files to Create / Modify

| File | Action | Notes |
|---|---|---|
| `src/pages/VehicleMaster.js` | Modify | Full edit form, rate group column, rate card management section, updated add form |
| `src/pages/BookingSheet.js` | Modify | Rate lookup from `vehicle_type_rates` instead of `vehicle_types`; null rate card warning |
| `src/utils/calculations.js` | Read only | Do not modify — confirm rate key mapping before changing BookingSheet lookup |

---

## 9. Exit Criteria (reviewer checklist)

**Migration:**
- [ ] `rate_groups` table exists with 2 rows: Company Owned, IISER
- [ ] `vehicle_type_rates` has one "Company Owned" row for every existing vehicle type
- [ ] `vehicle_type_rates` has one "IISER" row for VEHICLE BHAURI type
- [ ] All vehicles have non-null `rate_group_id` (verify: `SELECT COUNT(*) FROM vehicles WHERE rate_group_id IS NULL` = 0)
- [ ] Spot-check: Activa Company Owned rates in `vehicle_type_rates` match current `vehicle_types` Activa rates exactly

**Booking form:**
- [ ] Selecting a Sonagiri vehicle → rates load from `vehicle_type_rates` (Company Owned), correct amounts
- [ ] Selecting an IISER vehicle → rates load from `vehicle_type_rates` (IISER), correct amounts
- [ ] If no rate card exists for a vehicle → warning shown, rent/deposit blank, booking cannot be saved
- [ ] Rate key mapping preserved — no ₹0 rent bugs

**Vehicle Master — edit:**
- [ ] Staff edit: registration + active only; vehicle type + rate group fields hidden
- [ ] Super admin edit: all 4 fields editable
- [ ] Registration number updated correctly in DB on save
- [ ] Duplicate registration number shows inline error
- [ ] Rate group assignment updated correctly in DB on save

**Vehicle Master — list:**
- [ ] Rate Group column visible in vehicle list
- [ ] Each vehicle shows correct rate group name

**Vehicle Master — rate cards:**
- [ ] Rate Cards section visible to super_admin
- [ ] All existing rate cards listed correctly
- [ ] Edit rate card: saves updated rates to `vehicle_type_rates`
- [ ] Add rate card: new `(vehicle_type, rate_group)` row created
- [ ] Duplicate `(vehicle_type, rate_group)` combination rejected with error

**Vehicle Master — add vehicle:**
- [ ] Rate Group dropdown present in add form
- [ ] Default rate group auto-selected based on centre
- [ ] New vehicle saved with correct `rate_group_id`
- [ ] Adding new vehicle type inline: rates go to `vehicle_type_rates`, not `vehicle_types` columns

**Build:**
- [ ] `npm run build` passes zero ESLint errors before pushing
- [ ] `CLAUDE.md` updated: `vehicle_types` rate columns marked deprecated; new tables documented

---

## 10. Human Gate

- Implementer shows all migration SQL (Steps 1–7 in §4) before running anything
- Owner approves each step individually — especially Step 3 (mass INSERT) and Step 6 (mass UPDATE)
- Take CSV backup of `vehicles` and `vehicle_types` before Step 3
- Code changes may be drafted in parallel but not pushed until all migration steps confirmed complete
- Write spec to `.claude/specs/phase-14-rate-groups.md` in repo before implementing

---

## 11. Rollback

- **Code:** `git revert` — booking form falls back to `vehicle_types` rate columns (still present, not dropped)
- **DB:** `ALTER TABLE vehicles DROP COLUMN rate_group_id; DROP TABLE vehicle_type_rates; DROP TABLE rate_groups;` — safe, no FK dependencies from other tables except `vehicles.rate_group_id` which is dropped first
- No data loss: `vehicle_types` rate columns were never touched
