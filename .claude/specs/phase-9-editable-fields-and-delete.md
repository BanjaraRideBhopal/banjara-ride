# Phase 9 — Editable Auto-Filled Fields + Extra Days + Super Admin Delete

**Status:** IMPLEMENTED — code complete, build clean, awaiting owner manual QA in browser (no login credentials available to Claude to test interactively).
**Date:** July 2026
**Source of truth:** `CLAUDE.md`, `CLAUDE_HANDOFF.md`, `src/pages/BookingSheet.js`, `src/utils/calculations.js`

---

## Implementation Notes (2026-07-29)

- **DB migration:** all 3 columns confirmed missing via live schema check, then added one at a time with explicit owner approval per column: `security_deposit NUMERIC DEFAULT 0`, `extra_days NUMERIC DEFAULT 0`, `extra_days_charge NUMERIC DEFAULT 0`. RLS `bookings_delete_super_admin_only` confirmed already live — no DB change needed for Feature 2 (delete).
- **`fullAmountReceived`** was already editable/non-readOnly in the live code before this phase (contrary to spec's framing) — no change needed there.
- **Refund formula changed slightly from spec's literal wording:** implemented as `refundAmount = fullAmount - updated.rentAmount - deduction`, using whatever value is currently in `rentAmount` (auto or manually overridden) rather than recomputing `baseRent + totalExtraCharge` separately. This is necessary so a manual Actual Rent override correctly flows into Refund Amount — recomputing from `baseRent + totalExtraCharge` would have silently ignored a manual Actual Rent edit.
- **Table columns:** spec referenced "existing extra_hours / extra_charge columns" as a pattern to follow, but no `extra_charge` column actually exists in the live table (only `extra_hours` is shown; `final_rent` already embeds it). Added `Extra Days` and `Extra Days ₹` as the two new columns per the explicit exit criteria, without introducing an `Extra Charge ₹` column that didn't exist before.
- **Not verified:** owner login credentials are not available to Claude, so the full interactive QA pass (exit criteria checklist below) has not been run in a live browser. `npm run build` passes with zero ESLint errors; all code changes were traced against the existing cascade logic and guard pattern before commit. Recommend the owner runs through the exit criteria checklist manually before/after deploy.

---

## 1. Goal

Three improvements shipped as one phase:

1. **Editable auto-filled fields** — Rent Amount, Security Deposit, Extra Charge, Actual Rent, and Refund Amount are currently read-only (`readOnly`). Make them editable while keeping auto-fill on trigger events. When any of these is manually overridden, downstream fields that depend on it recalculate automatically.

2. **Extra Days** — parallel to the existing Extra Hours fields in the close booking form. Staff can fill Extra Hours, Extra Days, or both. Each has its own charge line; Total Extra Charge sums them. Actual Rent and Refund Amount cascade from Total Extra Charge.

3. **Delete booking** — super_admin only can delete any booking row (any status, any centre) directly from the booking list, with a confirmation step before deletion. No change to the customer record.

---

## 2. Scope

**In scope:**
- Remove `readOnly` from the 5 auto-filled fields; wire manual edits into the existing recalculation chain.
- Add Extra Days + Extra Days Charge fields to the close booking form; wire into the calc chain alongside Extra Hours.
- Add a Delete button inline in each booking row in the table and mobile card view (super_admin only).
- Confirmation dialog before delete executes.
- Supabase `.delete()` call for the booking row only — customers table untouched.
- Delete works across all booking statuses (`start` and `end`) and both list sections (Today's Bookings and Active Bookings).
- After delete: remove the row from local state immediately (no full reload needed).

**Explicitly out of scope:**
- Any change to the RLS DELETE policy — it already exists: `bookings_delete_super_admin_only` (Phase 3, `using (is_super_admin())`). No DB changes needed for delete.
- Staff delete — super_admin only per owner decision.
- Deleting customer records on booking delete — keep the customer row, per owner decision.
- Any change to `calculations.js` function signatures — the Extra Days logic lives in `BookingSheet.js`'s `recalculateFinal()`, not in `calculations.js`.

---

## 3. Files to read before implementing

- `c:\Projects\banjara-ride\CLAUDE.md`
- `c:\Projects\banjara-ride\src\pages\BookingSheet.js` — full file; key line ranges:
  - `emptyForm` (line 27): `rentAmount` field
  - `emptyFinal` (line 56): `extraHours`, `extraCharge`, `rentAmount`, `refundAmount`
  - `recalculate()` (line 263): initial booking calc chain
  - `handleChange()` (line 281): initial booking change handler
  - `recalculateFinal()` (line 443): close booking calc chain
  - `handleFinalChange()`: close booking change handler
  - Rent Amount field (line 876): currently `readOnly`
  - Security Deposit field (line 879): currently `readOnly`, value from `selectedVehicle.securityDeposit`
  - Extra Charge field (line 1020): currently `readOnly`
  - Actual Rent field (line 1023): currently `readOnly`
  - Refund Amount field (line 1042): currently `readOnly`
  - `emptyFinal` (line 56): confirm current fields — `extraDays` and `extraDaysCharge` do not exist yet
- `c:\Projects\banjara-ride\src\utils\calculations.js` — read for understanding; do not modify
- `c:\Projects\banjara-ride\src\index.css` — reuse existing button/colour classes

---

## 4. Feature 1 — Editable Auto-Filled Fields

### 4.1 Fields and their current state

| Field | Form | Currently | Change |
|---|---|---|---|
| Rent Amount (base) | Initial booking | `readOnly`, blue bg (`#f0f4ff`) | Editable, blue bg retained |
| Security Deposit | Initial booking | `readOnly`, blue bg, value from `selectedVehicle.securityDeposit` (not in form state) | Editable, move into form state as `securityDeposit` |
| Extra Charge (hours × rate) | Close booking | `readOnly`, orange bg (`#fff7ed`) | Editable, orange bg retained |
| Actual Rent (base + extra) | Close booking | `readOnly`, blue bg | Editable, blue bg retained |
| Refund Amount | Close booking | `readOnly`, blue bg | Editable, blue bg retained |

Visual distinction: retain the coloured background on all 5 fields — it signals "auto-filled" even when editable. This is consistent with how `fullAmountReceived` already works (auto-filled, editable, blue bg).

### 4.2 Initial booking form changes

**Security Deposit into form state:**
- Add `securityDeposit: ''` to `emptyForm` (line 27).
- In `recalculate()` (line 263), when a vehicle is selected, set `updated.securityDeposit = v.securityDeposit` (same trigger as `rentAmount` — vehicle change auto-fills it).
- In `formFromBooking()` (line ~315), map `securityDeposit: b.security_deposit || ''` when editing an existing booking.
  - Note: check whether `security_deposit` is currently saved to the `bookings` table in `handleSubmit` — if not, add it to the payload. It is already a column (Phase 1 seed data shows `security_deposit` on `vehicle_types`; confirm `bookings` schema has this column in `CLAUDE.md` — if missing, add `security_deposit NUMERIC` to the table first and note it as a DB step in §6).
- In `handleSubmit`, add `security_deposit: form.securityDeposit || 0` to the booking payload.
- The `fullAmountReceived` auto-fill (line 274) currently uses `v.securityDeposit` directly — change to use `parseFloat(updated.securityDeposit) || 0` so a staff override flows into the Full Amount recalc.

**Rent Amount editable:**
- Remove `readOnly` from the Rent Amount input (line 876).
- Add `name="rentAmount"` so `handleChange` picks it up.
- In `handleChange`, when `name === 'rentAmount'` is changed manually by staff:
  - Trigger `recalculate()` so `fullAmountReceived` updates: Full Amount = new Rent + Security Deposit + Delivery Charges.
  - Do NOT re-overwrite `rentAmount` inside `recalculate()` when the trigger is a manual rent edit — add a guard: only auto-set `rentAmount` when the trigger is `vehicle` or `bookingType` change, not when the user is typing into the rent field itself.

**Security Deposit editable:**
- Remove `readOnly`.
- Add `name="securityDeposit"`, `value={form.securityDeposit}`, `onChange={handleChange}`.
- In `handleChange`, when `name === 'securityDeposit'`: trigger `recalculate()` so Full Amount updates.

**Recalculate cascade (initial booking):**

```
vehicle / bookingType change → auto-fill rentAmount + securityDeposit → auto-fill fullAmountReceived
rentAmount manual edit       → recalc fullAmountReceived (= rentAmount + securityDeposit + delivery)
securityDeposit manual edit  → recalc fullAmountReceived
deliveryCharges change       → recalc fullAmountReceived  (already works today)
fullAmountReceived change    → no further cascade (it is the terminal target field)
```

### 4.3 Close booking form changes

**Extra Charge editable:**
- Remove `readOnly` from Extra Charge (line 1020).
- Add `name="extraCharge"` so `handleFinalChange` picks it up.
- In `handleFinalChange`, when `name === 'extraCharge'` is manually edited:
  - Recalculate Actual Rent: `rentAmount = baseRent + newExtraCharge`
  - Recalculate Refund Amount: `refundAmount = fullAmount - baseRent - newExtraCharge - deduction`
  - Do NOT re-overwrite `extraCharge` from `extraHours × rate` inside `recalculateFinal()` when the trigger is a manual extra charge edit — add a guard: only auto-set `extraCharge` when trigger is `extraHours` change.

**Actual Rent editable:**
- Remove `readOnly` from Actual Rent (line 1023).
- Add `name="rentAmount"` (it maps to `finalForm.rentAmount`) so `handleFinalChange` picks it up.
- In `handleFinalChange`, when `name === 'rentAmount'` manually edited:
  - Recalculate Refund Amount: `refundAmount = fullAmount - newActualRent - deduction`
  - Do NOT re-overwrite `rentAmount` inside `recalculateFinal()` when the trigger is a manual rent edit.

**Refund Amount editable:**
- Remove `readOnly` from Refund Amount (line 1042).
- Add `name="refundAmount"` so `handleFinalChange` picks it up.
- No cascade — Refund Amount is the terminal field in the close booking chain.

**Recalculate cascade (close booking):**

```
extraHours change        → auto-fill extraCharge → auto-fill rentAmount → auto-fill refundAmount
extraCharge manual edit  → recalc rentAmount → recalc refundAmount
rentAmount manual edit   → recalc refundAmount
deduction change         → recalc refundAmount  (already works today)
refundAmount manual edit → no further cascade (terminal field)
```

### 4.4 Feature 1b — Extra Days (close booking form)

**New fields in `emptyFinal`:**
```js
extraDays: '',
extraDaysCharge: '',
```

**New DB columns on `bookings` (see §6):**
```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_days NUMERIC DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_days_charge NUMERIC DEFAULT 0;
```

**Daily late charge rate:**
`rate_1day` from `vehicle_types` — already loaded into `vehicles` state as `rates['1 Day']`. No new DB column needed on `vehicle_types`.

**UI — close booking form (after Extra Hours / Extra Hours Charge rows):**

```
Extra Hours      [number input]    → Extra Hours Charge ₹   [auto, editable, orange bg]
Extra Days       [number input]    → Extra Days Charge ₹    [auto, editable, orange bg]
Total Extra Charge ₹               [auto, editable, orange bg — sum of both]
Actual Rent ₹                      [auto, editable, blue bg]
```

- Extra Hours and Extra Days are independent — both, either, or neither may be filled.
- Extra Days Charge: `extraDays × vehicle.rates['1 Day']` — auto-fills when `extraDays` changes.
- Extra Days Charge is editable (same guard pattern as Extra Hours Charge — see §4.5).
- Total Extra Charge = `extraHoursCharge + extraDaysCharge` — replaces the current single `extraCharge` field as the rolled-up value fed into Actual Rent.
- Actual Rent = Base Rent + Total Extra Charge.

**`recalculateFinal()` updated cascade:**

```
extraHours change         → auto-fill extraHoursCharge → recalc totalExtraCharge → recalc rentAmount → recalc refundAmount
extraDays change          → auto-fill extraDaysCharge  → recalc totalExtraCharge → recalc rentAmount → recalc refundAmount
extraHoursCharge manual   → recalc totalExtraCharge    → recalc rentAmount → recalc refundAmount
extraDaysCharge manual    → recalc totalExtraCharge    → recalc rentAmount → recalc refundAmount
totalExtraCharge manual   → recalc rentAmount → recalc refundAmount
rentAmount manual         → recalc refundAmount
deduction change          → recalc refundAmount  (unchanged)
refundAmount manual       → no further cascade (terminal)
```

**Naming note:** The existing `extraCharge` field in `emptyFinal` and DB (`extra_charge`) becomes **Extra Hours Charge** in the UI label. A new `extraDaysCharge` / `extra_days_charge` tracks the days charge separately. A new `totalExtraCharge` derived value (not stored separately in DB — it is `extra_charge + extra_days_charge` and can be computed on read) drives Actual Rent. The existing `extra_charge` column keeps its name in the DB — no rename, no migration of existing data.

**`formFromBooking` mapping for edit:**
```js
extraHours: b.extra_hours || '',
extraHoursCharge: b.extra_charge || '',   // renamed from extraCharge in emptyFinal
extraDays: b.extra_days || '',
extraDaysCharge: b.extra_days_charge || '',
rentAmount: b.final_rent || '',
refundAmount: b.refund_amount || '',
```

**`handleFinalSubmit` payload additions:**
```js
extra_days: finalForm.extraDays || 0,
extra_days_charge: finalForm.extraDaysCharge || 0,
// extra_charge now maps to finalForm.extraHoursCharge
extra_charge: finalForm.extraHoursCharge || 0,
```

**Table column:** Add `Extra Days` and `Extra Days ₹` columns to the desktop table and mobile card view alongside the existing Extra Hours columns. Follow the same pattern as the existing `extra_hours` / `extra_charge` columns.

### 4.5 Guard pattern for recalculate functions

Both `recalculate()` and `recalculateFinal()` need a guard to avoid overwriting a field that the user just manually edited. Simplest approach — pass the trigger field name:

```js
// recalculate(updated, autoFillAmount, triggerField)
// recalculateFinal(updated, booking, triggerField)
```

Inside each function:
- Only set `updated.rentAmount` if `triggerField !== 'rentAmount'`
- Only set `updated.extraHoursCharge` if `triggerField !== 'extraHoursCharge'`
- Only set `updated.extraDaysCharge` if `triggerField !== 'extraDaysCharge'`
- Only set `updated.totalExtraCharge` if `triggerField !== 'totalExtraCharge'`
- Only set `updated.refundAmount` if `triggerField !== 'refundAmount'`
- Only set `updated.securityDeposit` if `triggerField !== 'securityDeposit'`

All existing call sites pass the field name from `handleChange`/`handleFinalChange` already — just thread it through.

---

## 5. Feature 2 — Super Admin Delete Booking

### 5.1 UI placement

- **Desktop table:** Add a **Delete** button in the Actions column of each row, after the existing Edit and Close buttons. Visible only when `isOwner` (super_admin). Style: small red-tinted button, distinct from Edit (blue) and Close (amber). Suggested: `background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5`.
- **Mobile cards:** Add a Delete button in the card's action area alongside Edit/Close, same condition (`isOwner` only).
- **Active Bookings section:** same — Delete button appears on those rows too (same `renderTable` closure handles both sections, so the change propagates automatically).

### 5.2 Confirmation dialog

Use a native `window.confirm()` — no modal component needed (Ponytail: simplest thing that works).

```js
async function handleDelete(bookingId) {
  const ok = window.confirm('Delete this booking? This cannot be undone.');
  if (!ok) return;
  const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
  if (error) {
    alert('Delete failed: ' + error.message);
    return;
  }
  // Remove from local state — no full reload needed
  setBookings(prev => prev.filter(b => b.id !== bookingId));
  setActiveOutBookings(prev => prev.filter(b => b.id !== bookingId));
}
```

Notes:
- Both `bookings` and `activeOutBookings` state arrays are filtered — covers delete from either section.
- RLS `bookings_delete_super_admin_only` policy (Phase 3) already enforces that only super_admin can delete. If a staff user somehow calls this, the DB rejects it. The `isOwner` UI condition is a convenience guard only.
- No change to the `customers` table — customer record is preserved on booking delete (owner decision).
- `window.confirm` is synchronous and blocks — acceptable for an infrequent admin action. No new dependency needed.

### 5.3 renderTable closure

`renderTable` is a shared closure inside `BookingSheet` that drives both Today's Bookings and Active Bookings. The Delete button must be added once inside `renderTable`'s Actions cell — it will appear in both sections automatically. Confirm the current `renderTable` signature handles `isOwner` already (it should, since the Centre column is already conditionally rendered via `isOwner`).

---

## 6. DB changes

All migrations are additive (new columns, default values) — non-destructive. Each requires owner approval before running, per development rules. Implementer checks live schema via Supabase MCP first and reports before executing any SQL.

**Check and add if missing:**

```sql
-- 1. Security deposit on bookings (may already exist — confirm via MCP first)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS security_deposit NUMERIC DEFAULT 0;

-- 2. Extra days fields (new — almost certainly missing)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_days NUMERIC DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_days_charge NUMERIC DEFAULT 0;
```

Existing rows: all new columns default to 0 — no data loss, existing booking display unaffected.

**RLS:** No change. `bookings_delete_super_admin_only` already exists from Phase 3. No new policies needed.

---

## 7. Exit Criteria (reviewer checklist)

**Feature 1 — Editable fields:**
- [ ] Rent Amount (initial booking): auto-fills on vehicle + booking type selection; staff can override; Full Amount recalculates on override.
- [ ] Security Deposit (initial booking): auto-fills on vehicle selection; staff can override; Full Amount recalculates on override.
- [ ] Extra Hours Charge (close booking): auto-fills on Extra Hours entry; staff can override; Total Extra Charge, Actual Rent, and Refund Amount recalculate on override.
- [ ] Extra Days field (close booking): manual entry; auto-fills Extra Days Charge (days × rate_1day); staff can override Extra Days Charge; Total Extra Charge, Actual Rent, Refund Amount cascade.
- [ ] Extra Days Charge (close booking): auto-fills on Extra Days entry; staff can override; Total Extra Charge, Actual Rent, Refund Amount recalculate on override.
- [ ] Total Extra Charge = Extra Hours Charge + Extra Days Charge; editable; Actual Rent and Refund Amount recalculate on override.
- [ ] Both Extra Hours AND Extra Days can be filled simultaneously; charges add correctly.
- [ ] Either field left empty (0) contributes 0 to Total Extra Charge — no errors.
- [ ] Actual Rent (close booking): auto-fills from base rent + Total Extra Charge; staff can override; Refund Amount recalculates on override.
- [ ] Refund Amount (close booking): auto-fills from formula; staff can override; no further cascade (terminal field).
- [ ] Auto-fill still works correctly when staff have NOT manually overridden — changing vehicle/booking type still auto-sets Rent and Deposit; changing Extra Hours still auto-sets Extra Charge and Actual Rent.
- [ ] Blue/orange background retained on all 5 fields.
- [ ] Editing an existing `status='start'` booking: Rent Amount and Security Deposit pre-fill from stored values, not from vehicle re-selection.
- [ ] Editing an existing `status='end'` booking: Extra Hours Charge, Extra Days, Extra Days Charge, Actual Rent, Refund Amount all pre-fill from stored values.
- [ ] `security_deposit`, `extra_days`, `extra_days_charge` are all saved to `bookings` on every close booking save (new + edit).
- [ ] Extra Days and Extra Days Charge columns visible in desktop table and mobile card view.
- [ ] Old bookings (no extra_days data): show 0 or '—' in Extra Days columns — no errors.

**Feature 2 — Delete:**
- [ ] Delete button visible on every row in Today's Bookings (desktop + mobile) when logged in as super_admin.
- [ ] Delete button visible on every row in Active Bookings when logged in as super_admin.
- [ ] Delete button NOT visible when logged in as staff (sonagiri@, ranikamlapati@, iiser@).
- [ ] Clicking Delete shows `window.confirm` dialog; cancelling does nothing.
- [ ] Confirming Delete removes the row from the booking list immediately (no page reload).
- [ ] Deleted booking row is gone on next page load / date change (confirmed deleted from DB).
- [ ] Customer record is NOT deleted after booking is deleted — verify in Supabase.
- [ ] Delete works on `status='start'` and `status='end'` bookings.
- [ ] Delete error (network/permission failure) shows an `alert` with the error message; row remains in list.
- [ ] `npm run build` passes with zero ESLint errors before pushing.

---

## 8. Human Gate

- Implementer checks live schema via Supabase MCP for all 3 columns (`security_deposit`, `extra_days`, `extra_days_charge`) and reports current state before writing any code.
- Owner approves each `ALTER TABLE` statement individually before it runs.
- Code changes for Features 1 and 3 (editable fields + delete) may proceed in parallel with the DB check. Feature 2 (Extra Days) code requires the DB columns to exist first.
- Do not push until DB migration confirmed and all features passing exit criteria.
- Write spec to `.claude/specs/phase-9-editable-fields-and-delete.md` in the repo before implementing.

---

## 9. Rollback

- **Feature 1:** Pure UI/code change — `git revert` the commit. No DB state changed (other than `security_deposit` being populated going forward).
- **Feature 2:** Pure UI/code change — `git revert` the commit. Deleted bookings cannot be recovered from the app (no soft-delete), but the pre-Phase-1 CSV backup and any subsequent manual Supabase exports would have them. No DB schema change to roll back.
- New DB columns if added: `ALTER TABLE bookings DROP COLUMN security_deposit; DROP COLUMN extra_days; DROP COLUMN extra_days_charge;` — all safe, additive, no FK dependencies.
