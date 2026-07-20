Status: COMPLETE — implemented and live as of 2026-07-21

---

# Phase 7b — Split Refund Payment

## 1. Goal

Mirror the Phase 7a payment split for the refund section. When a customer's deposit is refunded, staff can split it across Cash, UPI, and App Payment with individual "Refund By" dropdowns — the same way incoming payment is recorded. The calculated Refund Amount stays the auto-calculated TARGET; staff allocate up to that amount across refund modes.

---

## 2. What changes

### Removed from UI
- Single `Refund By` dropdown — gone (DB column kept for historic data)

### Refund section — new layout

| Field | Type | Rule |
|---|---|---|
| Refund Amount ₹ | Read-only (blue) | Auto = Full Amount Received − Base Rent − Extra Charges − Deduction. This is the TARGET. |
| Refund Status | Dropdown | Processed / Unprocessed |
| Refund Cash ₹ | Number input | Manual entry, default empty |
| Cash Refund By | Dropdown | Shows when Refund Cash > 0. Centre-scoped: IISER → Banjara Ride only; others → full staff list |
| Refund UPI ₹ | Number input | Manual entry, default empty |
| UPI Refund By | Dropdown | Shows when Refund UPI > 0. Same centre-scoped options |
| Refund App Payment ₹ | Number input | Manual entry, default empty |
| Refund match indicator | Inline | Shows when Refund Amount > 0 AND any refund field > 0. Green = match, Amber = under-allocated (shows ₹X unallocated), Red = over-allocated |

### Refund calculation (unchanged)
Refund Amount = Full Amount Received − Base Rent − Extra Charges − Deduction

---

## 3. DB changes

Five new columns on the `bookings` table:

```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS refund_cash NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_upi NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_app_payment NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_cash_by TEXT,
  ADD COLUMN IF NOT EXISTS refund_upi_by TEXT;
```

- Old bookings: new columns default to 0 / NULL — no data loss, display unaffected
- `refund_by` column stays in DB (historic data preserved) but is no longer written to by the UI

---

## 4. Existing booking impact

| Scenario | Impact |
|---|---|
| Viewing old closed bookings in table | `refund_amount` still shows. New split fields show '—' (null → 0) — acceptable |
| Editing old closed bookings | Refund split fields default to empty. Staff can add split detail if needed. |
| Refund By column in table | Falls back to old `refund_by` value if new `refund_cash_by` and `refund_upi_by` are both null |

---

## 5. Files changed

| File | Change |
|---|---|
| `bookings` table (Supabase) | Added `refund_cash`, `refund_upi`, `refund_app_payment`, `refund_cash_by`, `refund_upi_by` |
| `src/pages/BookingSheet.js` | `emptyFinal`: removed `refundBy`, added 5 new fields. `finalFormFromBooking`: maps new fields. `handleFinalChange`: clears by-fields when amount cleared. `handleFinalSubmit`: writes new fields. UI: replaced single Refund By with split fields + match indicator. `SortTh` in table: Refund By column shows combined new fields, falls back to `refund_by` for historic rows. |

---

## 6. Exit criteria

- [x] Refund Cash ₹, Refund UPI ₹, Refund App Payment ₹ fields all accept numeric input
- [x] Cash Refund By shows when Refund Cash > 0; hidden otherwise
- [x] UPI Refund By shows when Refund UPI > 0; hidden otherwise
- [x] Refund By dropdowns are centre-scoped (IISER → Banjara Ride only; others → full list)
- [x] Refund match indicator: green = match, amber = under-allocated, red = over-allocated
- [x] Clearing a refund amount field also clears the corresponding By dropdown
- [x] Old bookings: Refund By column in table falls back to legacy `refund_by` field
- [x] `npm run build` passes with no warnings
