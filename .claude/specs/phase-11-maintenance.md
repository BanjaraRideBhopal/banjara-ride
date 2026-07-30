# Phase 11 — Vehicle Maintenance Page

**Status:** IMPLEMENTED — code complete, DB live, build clean. Awaiting owner manual QA in browser (no login credentials available to Claude to test interactively).

---

## Post-ship fixes (2026-07-29, same day as initial ship)

Owner tested in browser and reported 3 issues, all fixed:

1. **Rani Kamlapati Station showed 0 vehicles (bug).** The original centre switcher used literal tabs "Sonagiri" / "Rani Kamlapati Station" / "IISER Bhouri" with `.eq('centre_id', ...)` filtering — but all 52 company vehicles are registered under Sonagiri's literal `centre_id`; none are registered to Rani Kamlapati's. Since the RLS (and `vehicles`/`customers` generally) treat Sonagiri + Rani Kamlapati as one shared group, a literal per-centre filter was wrong for this data model. **Fix:** centre switcher rebuilt to load `centres` (with `is_franchise`) directly and offer "All Centres" / "Company Owned" (`.in('centre_id', companyCentreIds)`) / one tab per franchise centre — mirrors `VehicleMaster.js`'s existing "Company Owned" grouping exactly. No more separate Sonagiri/Rani Kamlapati tabs, since they were never going to show different data under the group-sharing model.

2. **Vehicle list clutter.** Originally rendered every vehicle at the filtered centre as a clickable tile (up to 52+ at once). **Fix:** replaced with a Vehicle Type dropdown → Vehicle Number dropdown cascade, same UX pattern as the booking form's Vehicle/Vehicle Number selection. Insurance status label shown inline in each `<option>` text (e.g. "MP04XX1234 — Overdue").

3. **Battery Replacement needed a Next Due date.** Added `next_due DATE` (nullable) to `battery_records` via migration, form field added to the inline Battery Replacement form. Owner confirmed (2026-07-29): optional field, plain data capture only — no status badge, no bell/nav-badge alert (unlike Insurance's `next_due`, which does drive alerts). Scope deliberately kept narrow to what was asked.

Also corrected in passing: `CLAUDE.md`/`CLAUDE_HANDOFF.md` said IISER Bhouri had 0 vehicles — live query showed it actually has 1 (`MP04SQ7201`, Access 125), added at some point after the last memory snapshot. Docs corrected to 53 total vehicles (52 Sonagiri + 1 IISER).

## Second round of post-ship fixes (2026-07-30)

Owner tested again in browser, reported 3 more issues, all fixed:

1. **Insurance badge label unclear.** "OK" (green, next_due > 7 days out) read as ambiguous out of context. Renamed to "Valid" — "Due Soon" and "Overdue" left unchanged (already self-explanatory).
2. **Insurance badge label appearing in the Vehicle Number dropdown** ("MP04YS5213 — OK") was confusing/unwanted. Removed entirely — the Vehicle Number dropdown now shows only the registration number, no status suffix. (Insurance status is still visible via the badge once a vehicle is selected and its detail view opens.)
3. **Notes not visible for insurance records, and history not shown as a table.** All 3 history sections (Expenses, Insurance, Battery) were plain flex-row lists, and Insurance's "history" list only rendered rows *after* the first one (`.slice(1)`) — so a vehicle with only one insurance record never showed its own notes anywhere, since the "latest record" summary line never included notes and the "history" section skipped it. Fixed by converting all 3 sections to real `<table>` markup (same plain inline-styled `<table>`/`th`/`td` pattern already used in `VehicleMaster.js`, not the heavyweight `desktop-table`/`mobile-cards` booking-table CSS) that lists **every** record including the latest, so notes are always visible regardless of how many records exist. Insurance keeps its prominent Last Renewed / Next Due / badge summary line above the table for at-a-glance status; Battery dropped the redundant summary line entirely since it has no badge/status concept (owner's earlier explicit scope decision) — the table's top row already shows the latest replacement.

## Third round of post-ship fixes (2026-07-30)

1. **Expense Type dropdown missing Insurance/Battery.** Added both alongside the original Fuel/Parts/Labour/Other, so staff can log insurance/battery-related costs directly as an expense line if needed, separate from the dedicated Insurance Status / Battery Status sections.
2. **Test data cleanup.** Owner had added test maintenance/insurance/battery records for MP04YS5213 (Pulsar 125, vehicle id 47) while trying out the feature. Deleted all 3 records (2 expenses, 1 insurance, 1 battery) directly via SQL — confirmed 0 remaining rows for that vehicle across all 3 tables.

---

## Implementation Notes (2026-07-29)

**Two deviations from the spec's original §3.4/§6 wording, both discussed and approved by owner before running any SQL:**

1. **FK column types corrected to `BIGINT`, not `INT`** — `vehicles.id` and `centres.id` are both `bigint` in the live schema; the spec draft said `INT`. Using `BIGINT` for `vehicle_id`/`centre_id` matches the referenced columns exactly.

2. **RLS uses the group-sharing pattern from `vehicles`, not the bookings-style per-centre policy in the original spec.** The spec's draft RLS (`centre_id = get_my_centre_id()` only) would have meant Sonagiri and Rani Kamlapati — which already share the same physical vehicle fleet via `vehicles`' group RLS — could NOT see each other's maintenance/insurance/battery history for the same vehicle. Owner confirmed (2026-07-29) that sharing is the correct behavior, matching how `vehicles`/`customers` already work. The live RLS mirrors `vehicles`' exact `SELECT` policy logic (`is_super_admin() OR (company user AND target centre is non-franchise) OR (franchise user AND centre_id = own centre)`), and extends the same logic to `INSERT` too (unlike `vehicles`, which is write-locked to super_admin only — staff need to be able to log their own maintenance records). No `UPDATE`/`DELETE` policies exist on any of the 3 tables — append-only, per spec.
   - No explicit anon-deny policy was added, consistent with how `bookings`/`vehicles` are already set up in this project: RLS enabled + zero policies granted to `anon` = default-deny, no need for an explicit `USING (false)` policy.

3. **`centre_id` on every insert (all 3 tables) uses `selectedVehicle.centre_id`** — the vehicle's own home centre — for both staff and super_admin, not `profile.centre_id` for staff as the spec originally suggested. Under the group-sharing RLS above, this is simpler, always passes `WITH CHECK` regardless of which company centre the logged-in staff member belongs to, and is the semantically correct value (the record describes the vehicle, not whoever happened to log it).

**DB migration order (all approved individually before running):**
1. Confirmed via live schema query that none of the 3 tables existed yet (2026-07-29)
2. `maintenance_expenses` — table + RLS (select + insert) in one migration
3. `insurance_records` — table + RLS (select + insert) in one migration
4. `battery_records` — table + RLS (select + insert) in one migration
5. Verified all 3 tables exist, RLS enabled (`relrowsecurity = true`), and all 6 policies present

**Not verified:** owner login credentials are not available to Claude, so the exit-criteria checklist below has not been run interactively in a browser. `npm run build` passes with zero ESLint errors.
**Date:** July 2026
**Source of truth:** `CLAUDE.md`, `CLAUDE_HANDOFF.md`, `src/App.js`, `src/pages/BookingSheet.js`, `src/pages/VehicleMaster.js`, `src/index.css`

---

## 1. Goal

A new **Maintenance** page accessible to all logged-in users (staff and super_admin). Each centre's staff can log and view maintenance records for vehicles at their centre. Super_admin sees all centres. Records cover three areas per vehicle:

1. **Maintenance expenses** — date-stamped cost entries with type and description
2. **Insurance status** — last renewed date + next due date; full history log
3. **Battery status** — last replaced date; full history log

Insurance due within **7 days** triggers warnings: a badge on the Maintenance nav link AND a notification in the existing header bell icon.

---

## 2. Scope

**In scope:**
- New page `src/pages/Maintenance.js`
- New nav link in header (all users): "Maintenance" — with badge count when insurance renewals are due within 7 days
- 3 new Supabase tables: `maintenance_expenses`, `insurance_records`, `battery_records`
- RLS on all 3 tables (same centre-isolation pattern as bookings)
- Bell icon integration: insurance due ≤7 days appears in existing bell dropdown alongside return reminders
- Vehicle list filtered to centre's vehicles (staff) or all vehicles with centre switcher (super_admin)
- Empty state for centres with no vehicles ("No vehicles at this centre yet")

**Explicitly out of scope:**
- Any change to `vehicle_types` or `vehicles` tables
- Maintenance expense reporting / analytics (Phase 12+ if needed)
- Push notifications or email alerts — in-app only
- Editing or deleting maintenance records (append-only log for now — owner can request edit/delete later)

---

## 3. New Database Tables

All 3 tables require owner approval before running. Implementer checks live schema via Supabase MCP first.

### 3.1 `maintenance_expenses`

```sql
CREATE TABLE maintenance_expenses (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id INT NOT NULL REFERENCES vehicles(id),
  centre_id INT NOT NULL REFERENCES centres(id),
  expense_date DATE NOT NULL,
  expense_type TEXT NOT NULL,   -- 'Fuel' | 'Parts' | 'Labour' | 'Other'
  amount NUMERIC NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 `insurance_records`

```sql
CREATE TABLE insurance_records (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id INT NOT NULL REFERENCES vehicles(id),
  centre_id INT NOT NULL REFERENCES centres(id),
  last_renewed DATE NOT NULL,
  next_due DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.3 `battery_records`

```sql
CREATE TABLE battery_records (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id INT NOT NULL REFERENCES vehicles(id),
  centre_id INT NOT NULL REFERENCES centres(id),
  replaced_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 RLS policies

Same pattern as `bookings`. For each of the 3 tables:

```sql
-- Staff: own centre only
CREATE POLICY "staff_own_centre" ON <table>
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR centre_id = get_my_centre_id()
  )
  WITH CHECK (
    is_super_admin()
    OR centre_id = get_my_centre_id()
  );

-- Anon: blocked
CREATE POLICY "anon_blocked" ON <table>
  FOR ALL TO anon USING (false);
```

Enable RLS: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`

No DELETE policy for now — records are append-only.

---

## 4. Navigation Changes

### 4.1 App.js — add Maintenance page routing

Current `activePage` values: `'bookings'` | `'vehicles'` (super_admin only).
Add: `'maintenance'` (all users).

```js
// App.js — add import
import Maintenance from './pages/Maintenance';

// Add routing condition (before the BookingSheet return)
if (activePage === 'maintenance') {
  return <Maintenance profile={profile} setActivePage={setActivePage} />;
}
```

### 4.2 Header nav link

The Maintenance nav link lives in **`BookingSheet.js` header only** — visible to all logged-in users (staff and super_admin). Vehicle Master header does not need a Maintenance link.

- Add a "Maintenance" button/link in the BookingSheet header that calls `setActivePage('maintenance')`
- Show a red badge on the link when `insuranceDueCount > 0` (count of vehicles with insurance due ≤7 days at the user's centre)
- Badge style: same pattern as the bell icon badge — small red circle with count

`insuranceDueCount` is fetched inside the existing 60-second `useEffect` in `BookingSheet.js` alongside the return reminders check — no new timer needed.

---

## 5. Maintenance Page — UI & Behaviour

### 5.1 Vehicle list (left panel or top selector)

- Load vehicles from `vehicles` table joined with `vehicle_types` (for name)
- Staff: filtered to `centre_id = their centre` via RLS automatically
- Super_admin: centre switcher tabs (same pattern as BookingSheet — "All Centres | Sonagiri | Rani Kamlapati | IISER Bhouri") or filter by centre dropdown
- Empty state: if no vehicles at centre, show "No vehicles at this centre yet" — no error
- Each vehicle shown as a card or row: registration number + vehicle type name + insurance status badge (green = OK, amber = due within 7 days, red = overdue)

### 5.2 Vehicle detail view

Clicking a vehicle opens its detail view (inline expand or separate section). Three sections:

**A — Maintenance Expenses**

- List of past expenses, newest first: date | type | amount | description
- "+ Add Expense" button opens a small inline form:
  - Expense Date (date picker, default today)
  - Expense Type (dropdown: Fuel / Parts / Labour / Other)
  - Amount ₹ (number)
  - Description (text, optional)
  - Save button
- On save: insert into `maintenance_expenses`, refresh list
- `centre_id` set automatically from user's profile (staff) or selected centre (super_admin)

**B — Insurance Status**

- Latest record shown prominently: Last Renewed | Next Due | status badge
- Status badge logic:
  - Green: next_due > today + 7 days
  - Amber: next_due within 7 days (≥ today)
  - Red: next_due < today (overdue)
- "+ Update Insurance" button opens inline form:
  - Last Renewed Date (date picker)
  - Next Due Date (date picker)
  - Notes (text, optional)
  - Save button
- Full history below: all past insurance records, newest first
- On save: insert new record (history preserved), latest record re-derived as most recent by `created_at`

**C — Battery Status**

- Latest record shown prominently: Last Replaced date
- "+ Log Battery Replacement" button opens inline form:
  - Replaced Date (date picker, default today)
  - Notes (text, optional)
  - Save button
- Full history below: all past battery records, newest first
- On save: insert new record (history preserved)

### 5.3 Layout

- Reuse existing CSS classes from `index.css` (br-form-card, br-grid-N, etc.) — no new layout classes unless genuinely needed
- Mobile: vehicle list stacks vertically, detail view appears below selected vehicle
- Desktop: vehicle list on left (~30%), detail view on right (~70%) — or full-width single column if simpler (Ponytail: pick whichever needs fewer lines)

---

## 6. Bell Icon Integration

The existing bell icon in `BookingSheet.js` already shows a dropdown of active bookings with return reminders. Extend it to also show insurance due alerts.

### 6.1 Fetch insurance due alerts

In the existing 60-second `useEffect` that checks return reminders, add a parallel query:

```js
const today = localDateString(); // existing helper
const sevenDaysLater = localDateString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

const { data: dueInsurance } = await supabase
  .from('insurance_records')
  .select('id, vehicle_id, next_due, vehicles(registration_number, vehicle_types(name))')
  .lte('next_due', sevenDaysLater)
  // RLS handles centre filter automatically
  .order('next_due', { ascending: true });

// De-duplicate: only the latest insurance record per vehicle matters
// Group by vehicle_id, keep the one with the highest created_at
```

Note: since multiple insurance records per vehicle exist (history), only the **most recent** record per vehicle should be checked. Simplest approach: add a DB function or fetch all and de-duplicate in JS by `vehicle_id`, keeping the record with the latest `created_at`.

### 6.2 Bell dropdown additions

In the bell dropdown, below the existing return reminder rows, add a divider and insurance due rows:

```
── Insurance Due ──────────────────
🛡 MP09AB1234 (Activa 6G) — due 2026-08-01  [amber/red badge]
🛡 MP09XY5678 (Jupiter)   — OVERDUE          [red badge]
```

- Clicking an insurance row navigates to `activePage = 'maintenance'` (and ideally highlights that vehicle — pass a `highlightVehicleId` prop to Maintenance)
- Bell badge count = return reminders count + insurance due count

### 6.3 Maintenance nav badge

`insuranceDueCount` = count of vehicles with insurance due ≤7 days (de-duplicated). Shown as a red badge on the Maintenance nav link. Reuse the same data already fetched for the bell.

---

## 7. Files to create / modify

| File | Action | Notes |
|---|---|---|
| `src/pages/Maintenance.js` | Create | New page |
| `src/App.js` | Modify | Add `'maintenance'` routing + import |
| `src/pages/BookingSheet.js` | Modify | Add Maintenance nav link + badge in header; extend bell useEffect for insurance alerts |
| `src/pages/VehicleMaster.js` | No change | Maintenance nav link not needed here |
| `src/index.css` | Modify only if needed | Reuse existing classes first |

---

## 8. Exit Criteria (reviewer checklist)

**DB:**
- [ ] All 3 tables created with correct columns and FK constraints
- [ ] RLS enabled on all 3 tables; tested with staff login (own centre only) and super_admin (all centres)
- [ ] Anon access blocked on all 3 tables

**Navigation:**
- [ ] "Maintenance" nav link visible to all logged-in users (staff + super_admin)
- [ ] Clicking nav link opens Maintenance page for all user types
- [ ] Nav badge shows correct count of insurance due ≤7 days; updates every 60 seconds
- [ ] Nav badge hidden when count = 0

**Vehicle list:**
- [ ] Staff sees only their centre's vehicles
- [ ] Super_admin sees all vehicles with centre switcher
- [ ] IISER staff (0 vehicles): empty state shown, no error
- [ ] Insurance status badge (green/amber/red) correct on each vehicle card

**Maintenance expenses:**
- [ ] Add Expense form saves correctly to DB with correct `centre_id`
- [ ] Expense list shows newest first
- [ ] All 4 expense types available in dropdown

**Insurance records:**
- [ ] Update Insurance form saves new record (does not overwrite old)
- [ ] Latest record shown prominently; full history below
- [ ] Status badge correct (green >7 days, amber ≤7 days, red overdue)

**Battery records:**
- [ ] Log Battery Replacement saves new record
- [ ] Latest record shown prominently; full history below

**Bell icon:**
- [ ] Insurance due vehicles appear in bell dropdown below return reminders
- [ ] Bell badge count includes insurance due count
- [ ] Clicking insurance row in bell navigates to Maintenance page
- [ ] Only most recent insurance record per vehicle checked (no duplicate alerts for same vehicle)

**General:**
- [ ] Mobile card view works correctly on Maintenance page
- [ ] `npm run build` passes zero ESLint errors before pushing
- [ ] `CLAUDE.md` and memory files updated after implementation

---

## 9. Human Gate

- Implementer shows all 3 `CREATE TABLE` statements and waits for owner approval before running any SQL
- RLS policies shown and approved before applying
- Code for the page may be drafted in parallel but not pushed until DB is confirmed live
- Write spec to `.claude/specs/phase-11-maintenance.md` in repo before implementing

---

## 10. Rollback

- New page (`Maintenance.js`): `git revert` the commit — App.js routing reverts, page disappears
- Nav link changes in BookingSheet/VehicleMaster: same revert covers it
- DB tables: `DROP TABLE battery_records; DROP TABLE insurance_records; DROP TABLE maintenance_expenses;` — no FK dependencies from other tables; safe to drop
