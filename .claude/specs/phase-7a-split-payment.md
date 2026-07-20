Status: COMPLETE — implemented and live as of 2026-07-20

> **Note:** The spec was initially drafted with Full Amount as an auto-sum. During implementation the owner corrected this — see section 2 for the final actual behaviour.

---

# Phase 7a — Split Payment

## 1. Goal

Allow a booking's payment to be split across Cash, UPI, and App Payment in any combination. Replace the single Mode of Payment dropdown with three individual amount fields, and add Risabh Tiwari to the Paid To staff list.

---

## 2. What changes

### Removed from UI
- `Mode of Payment` dropdown — gone (DB column kept for historic data)
- `Credit To` field — gone (DB column kept for historic data)

### Payment section — final layout

| Field | Type | Rule |
|---|---|---|
| Estimated Rent ₹ | Read-only (blue) | Auto from vehicle rate + booking type |
| Security Deposit ₹ | Read-only (blue) | Auto from vehicle type |
| Delivery Charges ₹ | Editable | Manual entry; triggers Full Amount recalc |
| Full Amount Received ₹ | Editable | Auto = Rent + Deposit + Delivery when vehicle/duration/delivery changes; editable by staff. This is the TARGET — staff must match it. |
| Cash ₹ | Editable | Manual entry, default empty |
| Cash Paid To | Dropdown | Shows when Cash > 0. Centre-scoped: IISER → Banjara Ride only; others → Lokendra / Rizwan / Risabh Tiwari / Manish / Guard / Nazim / Banjara Ride |
| UPI ₹ | Editable | Manual entry, default empty |
| UPI Paid To | Dropdown | Shows when UPI > 0. Same centre-scoped options |
| App Payment ₹ | Editable | Manual entry, default empty |
| Payment match indicator | Inline | Shows when Full Amount > 0 AND any payment field > 0. Green = Cash+UPI+App matches Full Amount. Amber = under-allocated (shows ₹X still unallocated). Red = over-allocated. Staff is NOT blocked from saving — indicator is advisory only. |

**Full Amount Received is NOT auto-summed from payment fields.** It is set automatically when vehicle/duration/delivery change, and is then editable. The match indicator guides staff to allocate payment fields to equal Full Amount.

### Refund calculation (unchanged)
Refund Amount = Full Amount Received − Base Rent − Extra Charges − Deduction

---

## 3. DB changes

Three new columns on the `bookings` table:

```sql
ALTER TABLE bookings
  ADD COLUMN upi_amount NUMERIC DEFAULT 0,
  ADD COLUMN upi_paid_to TEXT,
  ADD COLUMN app_payment_amount NUMERIC DEFAULT 0;
```

- Old bookings: new columns default to 0 / NULL — no data loss, display unaffected
- `cash` and `paid_to` columns stay (existing cash amount and paid-to)
- `mode_of_payment` and `credit_to` columns stay in DB (historic data preserved) but no longer shown or written to by UI

---

## 4. Existing booking impact

| Scenario | Impact |
|---|---|
| Viewing old bookings in table | `cash` shows; `upi_amount` and `app_payment_amount` show as '—' (0) — acceptable |
| Editing old bookings | Cash pre-fills from stored `cash`. UPI and App default to empty. Full Amount pre-fills from stored `full_amount_received`. |
| Refund on old closed bookings | Uses stored `full_amount_received` — unaffected |

---

## 5. Files changed

| File | Change |
|---|---|
| `bookings` table (Supabase) | Added `upi_amount`, `upi_paid_to`, `app_payment_amount` |
| `src/pages/BookingSheet.js` | `emptyForm`: added `upiAmount`, `upiPaidTo`, `appPaymentAmount`; removed `modeOfPayment`, `creditTo`. `handleChange`: clears `paidTo` if cash cleared; clears `upiPaidTo` if upiAmount cleared. `formFromBooking`: maps new fields. `handleSubmit`: writes new fields. UI: Full Amount editable; Cash, UPI, App Payment fields; conditional Paid To dropdowns; payment match indicator. `recalculate`: Full Amount only auto-fills on vehicle/bookingType/delivery change (`autoFillAmount` flag). |
| `src/data/options.js` | Removed `modeOfPaymentOptions`, `creditToOptions` exports. Added `Risabh Tiwari` after `Rizwan` in both `paidToOptions` and `refundByOptions`. |

---

## 6. Exit criteria

- [x] Cash, UPI, App Payment fields all accept numeric input
- [x] Full Amount Received is editable target (auto-set on vehicle/duration/delivery change, then editable)
- [x] Full Amount is NOT recalculated when Cash/UPI/App fields change
- [x] Cash Paid To shows when Cash > 0; hidden + cleared otherwise
- [x] UPI Paid To shows when UPI > 0; hidden + cleared otherwise
- [x] Payment match indicator shows green/amber/red; does not block saving
- [x] Mode of Payment and Credit To fields removed from form
- [x] Risabh Tiwari in Paid To and Refund By options
- [x] Old bookings edit correctly; Full Amount pre-fills from stored value
- [x] `npm run build` passes with no warnings
