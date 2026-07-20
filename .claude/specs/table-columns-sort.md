Status: COMPLETE — implemented and live as of 2026-07-21

---

# Table Columns, Sort & Scroll Revamp

## 1. Goal

Revamp the bookings list table to:
- Show more operationally useful columns (payment detail, refund detail, remarks)
- Remove columns that aren't needed in the daily view
- Make headers sticky so they remain visible while scrolling through many rows
- Contain the table in a fixed-height box so the horizontal scrollbar is always accessible (not stranded at the bottom of a long page)
- Add sort on every column

---

## 2. Column changes

### Removed
| Column | Reason |
|---|---|
| Start KM | Rarely checked in the list; available in edit form |
| End KM | Same |
| KM Driven | Same |

### Added (Initial Booking group)
| Column | DB field | Notes |
|---|---|---|
| Delivery ₹ | `delivery_charges` | |
| Full Amt ₹ | `full_amount_received` | |
| Cash ₹ | `cash` | |
| UPI ₹ | `upi_amount` | |
| Paid To | `paid_to` + `upi_paid_to` | Combined in one cell: "Lokendra / Rizwan" |
| Mode | `mode_of_payment` | Historic field — new bookings show '—' |
| Remarks | `remarks` | |

### Added (Return Details group)
| Column | DB field | Notes |
|---|---|---|
| Deduction ₹ | `deduction` | |
| Refund Status | `refund_status` | |
| Refund By | `refund_cash_by` + `refund_upi_by` | Combined; falls back to legacy `refund_by` for historic rows |

### Final column order

**Initial Booking (blue):** Date · Time · [Centre] · Customer · Mobile · Vehicle · Booking · Exp. Return · Est. Rent ₹ · Delivery ₹ · Full Amt ₹ · Cash ₹ · UPI ₹ · Paid To · Mode · Remarks

**Return Details (yellow):** Status · Actual Return · Extra Hrs · Actual Rent ₹ · Deduction ₹ · Refund ₹ · Refund Status · Refund By · Helmet

**Actions:** Edit · Close

Total: 27 columns (super_admin) / 26 (staff, no Centre column)

---

## 3. Scroll & header behaviour

- `.desktop-table` now has `overflow: auto; max-height: 65vh` — the table scrolls within a fixed container so the horizontal scrollbar is always visible at the bottom of that container (not at the bottom of the page)
- `thead tr:first-child th { position: sticky; top: 0; z-index: 3; height: 40px }` — group header row sticks to top
- `thead tr:last-child th { position: sticky; top: 40px; z-index: 2 }` — column header row sticks below group header
- Table changed from `border-collapse: collapse` to `border-collapse: separate; border-spacing: 0` — required for sticky headers to work cross-browser (Chrome bug with collapse + sticky)
- Row borders moved from `<tr>` to `<td>` (via `tdStyle.borderBottom`) to be compatible with `border-collapse: separate`

---

## 4. Sort behaviour

- `sortColumn` and `sortDir` state added to BookingSheet component
- `handleSort(col)`: click same column toggles asc/desc; click new column resets to asc
- `displayedBookings`: derived from `bookings` state — spreads and sorts using `String.localeCompare` with `numeric: true`; unsorted (no column active) preserves original DB order
- `SortTh` component: renders `<th>` with click handler; shows ⇅ (inactive), ▲ (asc), ▼ (desc) indicator
- Sort is client-side only (applied after data loads); does not re-query the DB

---

## 5. Files changed

| File | Change |
|---|---|
| `src/index.css` | `.desktop-table`: `overflow: auto; max-height: 65vh`. Added sticky `thead` rules. Changed `tbody tr:hover` rule to target `td` for `border-separate` compatibility. |
| `src/pages/BookingSheet.js` | `sortColumn`, `sortDir` state. `handleSort()`. `displayedBookings`. Full table JSX rewritten with new columns. `SortTh` component added at file bottom. Table `borderCollapse` changed. `tdStyle` extended with `borderBottom`. |

---

## 6. Exit criteria

- [x] Start KM, End KM, KM Driven columns removed
- [x] 10 new columns added across Initial Booking and Return Details groups
- [x] Paid To shows Cash Paid To + UPI Paid To combined
- [x] Refund By shows new split fields, falls back to legacy `refund_by`
- [x] Table contained in 65vh box; horizontal scrollbar visible without scrolling to page bottom
- [x] Both header rows (group + column names) are sticky
- [x] All column headers clickable to sort; active column shows ▲/▼ indicator
- [x] `npm run build` passes with no warnings
