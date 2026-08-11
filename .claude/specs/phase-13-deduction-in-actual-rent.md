# Phase 13 — Deduction Folded into Actual Rent

**Status:** IMPLEMENTED — formula/UI changes complete, backfill run, build clean. Awaiting owner manual QA in browser (no login credentials available to Claude to test interactively).

---

## Implementation Notes (2026-08-12)

- **Backfill:** 6 rows matched the criteria (`status='end'`, `deduction > 0`, `final_rent IS NOT NULL`). Owner reviewed the full row list before approving — 2 of the 6 were test bookings (customer names literally "test2" and "Test"). Owner explicitly chose to backfill all 6 as spec'd rather than excluding or deleting the test rows; deletion of those test rows was deferred to a separate future decision, not part of this migration. Spot-checked 3 of the 6 post-migration (Kishan Kumar 1580→1860, Vansh Chouhan 340→1480, Ujjval Daharwal 1000→1800) — all matched `old final_rent + deduction` exactly.
- **Formula change:** exactly as spec'd — no deviation. The existing `triggerField !== 'rentAmount'` guard in `recalculateFinal()` already fires for a `deduction` trigger (since `'deduction' !== 'rentAmount'`), so no new special-case branch was needed for deduction specifically — confirms §4.4's note that "no guard is needed on `deduction` itself."
- **UI:** `Field` component (shared by ~30 other fields in this form) wasn't modified — bolding needed both label and value, which `Field` doesn't support per-instance. Instead, the Actual Rent field bypasses `Field` and inlines the same markup structure directly, with the label's `fontWeight` bumped from `500` to `700` and the input given `fontWeight: 'bold'`. Every other field is untouched.
- Grid layout: the old 4-item/3-item row split became two 3-item rows (Total Extra Charge/Deduction/Reason For Deduction, then Damage-Description/Actual Rent/Refund Amount) — reuses `br-grid-3` for both, no new CSS.
**Date:** July 2026
**Source of truth:** `CLAUDE.md`, `CLAUDE_HANDOFF.md`, `src/pages/BookingSheet.js`, `src/utils/calculations.js`, `src/pages/Dashboard.js`

---

## 1. Goal

Banjara Ride keeps the deduction amount (damage/fine withheld from deposit) in addition to the base rent and extra charges. The current formula treats deduction as a separate subtraction from the refund, which is financially correct but doesn't reflect the true "amount Banjara Ride receives" in one number.

This phase folds Deduction into Actual Rent so that:

```
Actual Rent   = Base Rent + Total Extra Charge + Deduction
Refund Amount = Full Amount Received − Actual Rent
```

The Refund Amount ends up the same number as before. The change is:
- Deduction now triggers a recalculation of Actual Rent (same as extra charges do)
- Actual Rent now represents the total amount Banjara Ride keeps from this booking
- Dashboard "Rent Revenue" uses `final_rent` which now includes deduction — no formula change needed there since it already reads `final_rent`

---

## 2. Scope

**In scope:**
- `recalculateFinal()` in `BookingSheet.js`: fold deduction into Actual Rent formula; update Refund Amount formula
- `handleFinalChange()`: deduction change now triggers Actual Rent recalc (currently it only triggers Refund Amount recalc)
- `triggerField` guard: protect Actual Rent from being overwritten when deduction changes, if staff has manually edited Actual Rent
- UI: move Deduction field above Actual Rent in the close booking form
- UI: Actual Rent label and value displayed in **bold**
- **One-time backfill migration:** update all historical `status='end'` bookings where `deduction > 0` to add deduction into `final_rent`
- Dashboard: no formula change needed — "Rent Revenue" already sums `final_rent` from DB; backfilled + new values will both be correct

**Explicitly out of scope:**
- Any DB schema change — `final_rent`, `deduction`, `refund_amount` columns stay as-is
- Historical bookings — existing `final_rent` values in DB are not backfilled (old bookings recorded deduction separately; new bookings will include it in `final_rent`)
- Any change to `calculations.js` — all changes are in `BookingSheet.js` only
- Any change to `Dashboard.js` — Rent Revenue already reads `final_rent` correctly

---

## 3. Files to Read Before Implementing

- `c:\Projects\banjara-ride\CLAUDE.md`
- `c:\Projects\banjara-ride\src\pages\BookingSheet.js` — full file; key sections:
  - `emptyFinal`: confirm current fields (`deduction`, `rentAmount`, `refundAmount`)
  - `recalculateFinal()`: current cascade chain
  - `handleFinalChange()`: current deduction handler — currently recalcs refundAmount only
  - Close booking form UI: current order of Deduction, Actual Rent, Refund Amount fields
- `c:\Projects\banjara-ride\src\utils\calculations.js` — read for understanding; do not modify

---

## 4. Formula Changes

### 4.1 Current formulas (in `recalculateFinal`)

```
totalExtraCharge = extraHoursCharge + extraDaysCharge
actualRent       = baseRent + totalExtraCharge
refundAmount     = fullAmount - actualRent - deduction
```

### 4.2 New formulas

```
totalExtraCharge = extraHoursCharge + extraDaysCharge          ← unchanged
actualRent       = baseRent + totalExtraCharge + deduction     ← deduction added
refundAmount     = fullAmount - actualRent                     ← deduction removed (already in actualRent)
```

### 4.3 Updated cascade chain

```
extraHours change        → auto-fill extraHoursCharge → recalc totalExtraCharge → recalc actualRent → recalc refundAmount
extraDays change         → auto-fill extraDaysCharge  → recalc totalExtraCharge → recalc actualRent → recalc refundAmount
extraHoursCharge manual  → recalc totalExtraCharge    → recalc actualRent → recalc refundAmount
extraDaysCharge manual   → recalc totalExtraCharge    → recalc actualRent → recalc refundAmount
totalExtraCharge manual  → recalc actualRent → recalc refundAmount
deduction change         → recalc actualRent → recalc refundAmount     ← THIS IS THE KEY CHANGE
actualRent manual        → recalc refundAmount
refundAmount manual      → no further cascade (terminal)
```

### 4.4 triggerField guard additions

In `recalculateFinal()`, the existing guard pattern (`triggerField !== 'fieldName'`) must protect:
- `updated.rentAmount` (Actual Rent): skip auto-set when `triggerField === 'rentAmount'`
- `updated.refundAmount`: skip auto-set when `triggerField === 'refundAmount'`

These guards already exist from Phase 9. Confirm they are still in place and that the new deduction→actualRent path respects them. No new guards needed — deduction is a manual-only field (staff always types it; it is never auto-filled), so no guard is needed on `deduction` itself.

---

## 5. UI Changes (Close Booking Form)

### 5.1 Field order — move Deduction above Actual Rent

**Current order:**
```
Extra Hours       Extra Hours Charge ₹
Extra Days        Extra Days Charge ₹
Total Extra Charge ₹
Actual Rent ₹
Deduction ₹       Reason for Deduction
Damage/Fine Description
Refund Amount ₹
```

**New order:**
```
Extra Hours       Extra Hours Charge ₹
Extra Days        Extra Days Charge ₹
Total Extra Charge ₹
Deduction ₹       Reason for Deduction     ← moved up
Damage/Fine Description                    ← moved up (follows Deduction)
Actual Rent ₹                              ← now below Deduction
Refund Amount ₹
```

Reason: staff should enter the deduction amount before seeing Actual Rent update — mirrors the mental model of "base + extras + damage = total kept."

### 5.2 Actual Rent — bold display

- Wrap the Actual Rent label and value in `<strong>` or apply `fontWeight: 'bold'` via existing CSS
- Retain the existing blue background (`#f0f4ff`) and editable behaviour
- No other styling change

---

## 6. handleFinalSubmit — no change needed

`final_rent` is already saved from `finalForm.rentAmount` in the submit payload. Since Actual Rent now includes deduction in its calculated value, `final_rent` in the DB will automatically store the correct (higher) value going forward. No payload change needed.

---

## 7. One-Time Backfill Migration

Updates all historical closed bookings so `final_rent` includes deduction — making old bookings consistent with the new formula.

```sql
UPDATE bookings
SET final_rent = final_rent + COALESCE(deduction, 0)
WHERE status = 'end'
AND COALESCE(deduction, 0) > 0
AND final_rent IS NOT NULL;
```

**Safety notes:**
- Affects only `status='end'` rows with a non-zero deduction — open bookings (`status='start'`) untouched
- `COALESCE(deduction, 0)` handles any NULL deduction values safely
- `final_rent IS NOT NULL` guard prevents adding to NULL (would stay NULL anyway, but explicit is safer)
- **Irreversible** — run only after CSV backup of `bookings` table is confirmed
- Implementer must show this SQL and wait for owner explicit go-ahead before running
- Run via Supabase MCP; report row count affected before and after (`SELECT COUNT(*) FROM bookings WHERE status='end' AND COALESCE(deduction,0) > 0`)

**After backfill:** Dashboard "Rent Revenue" will automatically show the corrected higher values for historical bookings — no code change needed.

---

## 8. Dashboard Impact

No code change needed in `Dashboard.js`. The "Rent Revenue" card already sums `final_rent` from the DB — as new bookings are closed with the updated formula, their `final_rent` will include deduction. Historical bookings retain their old `final_rent` (deduction not included) — this is acceptable and expected.

---

## 9. Exit Criteria (reviewer checklist)

**Formula:**
- [ ] Actual Rent = Base Rent + Total Extra Charge + Deduction (verified by entering values and checking the calculated result)
- [ ] Refund Amount = Full Amount − Actual Rent (no separate deduction subtraction)
- [ ] Entering a deduction amount triggers Actual Rent to update, then Refund Amount to update
- [ ] Entering extra hours/days still cascades correctly through to Actual Rent and Refund Amount
- [ ] Manually editing Actual Rent still recalculates Refund Amount; does NOT get overwritten by subsequent deduction changes (triggerField guard works)
- [ ] Manually editing Refund Amount: no further cascade (terminal — unchanged)

**UI:**
- [ ] Deduction field appears ABOVE Actual Rent in the close booking form
- [ ] Reason for Deduction and Damage/Fine Description follow Deduction (same relative order as before)
- [ ] Actual Rent label and value are bold
- [ ] Blue background retained on Actual Rent field
- [ ] All other fields unchanged in appearance and behaviour

**Editing existing closed bookings:**
- [ ] Editing a `status='end'` booking: Deduction pre-fills from `b.deduction`; Actual Rent pre-fills from `b.final_rent` (stored value, not recalculated on load)
- [ ] Changing Deduction on an edit triggers the new cascade correctly

**Dashboard:**
- [ ] No change to Dashboard behaviour confirmed — Rent Revenue card still reads `final_rent` correctly

**Build:**
- [ ] `npm run build` passes zero ESLint errors before pushing

---

## 10. Human Gate

- **Backfill migration:** Implementer checks row count first, shows the SQL, and waits for owner explicit go-ahead before running. Take CSV backup of `bookings` before running — free tier has no automatic backups.
- **Code changes:** Pure `BookingSheet.js` edit — no DB approval needed; can be drafted in parallel but not pushed until backfill is confirmed complete.
- Write spec to `.claude/specs/phase-13-deduction-in-actual-rent.md` in repo before implementing.

---

## 11. Rollback

- **Code:** `git revert` the commit — pure UI/logic change.
- **Backfill:** Cannot be automatically reversed (irreversible UPDATE). However: `deduction` column still stores the original amount, so original `final_rent` can be reconstructed: `UPDATE bookings SET final_rent = final_rent - COALESCE(deduction, 0) WHERE status='end' AND COALESCE(deduction,0) > 0;`
