# Phase 12 — Dashboard

**Status:** IMPLEMENTED — code complete, `recharts` installed, build clean. Awaiting owner manual QA in browser (no login credentials available to Claude to test interactively).

---

## Implementation Notes (2026-07-30)

**Field-name corrections from spec's draft query (§6):** the spec's example `Promise.all` snippet referenced `cash_paid_to` and `upi_payment` — neither exists on `bookings`. The real columns (confirmed against live schema and `CLAUDE.md`) are `paid_to` (cash paid-to) and `upi_amount` (UPI amount). Implemented using the correct column names throughout — collections-per-staff, revenue-by-payment-mode, and all other payment-derived charts use `paid_to`/`upi_amount`/`app_payment_amount`.

**Pending Refunds / Outstanding Deposits also filter `status = 'end'`.** The spec said "bookings where `refund_status = 'Unprocessed'`" with no status condition, but an active (`status='start'`) booking's `refund_amount` is still 0/unset — it hasn't been closed yet, so it isn't a real "pending refund." Added `.eq('status', 'end')` alongside `.eq('refund_status', 'Unprocessed')` to avoid counting active bookings that simply haven't reached the refund step yet.

**New vs Repeat classification uses an unfiltered global `customers` fetch**, not centre-filtered, even though the "New Customers" summary card *does* apply the centre filter (per spec). Reasoning: `customers.centre_id` is documented as "kept for reference only" and gets overwritten to whichever centre most recently booked that customer (see Phase 5a/BUG-007 history) — filtering it by the currently-selected centre would incorrectly report an existing customer as "not found" (and therefore misclassify them) purely because their reference `centre_id` happens to point elsewhere. The classification itself (is this mobile new or returning) is inherently a global-identity question, since customers are global by mobile number across all centres.

**All date-range comparisons against `TIMESTAMPTZ` columns (`customers.created_at`) convert to local date first** via a `toLocalDateStr()` helper (`new Date(iso).getFullYear()/getMonth()/getDate()`), never comparing raw ISO strings directly — consistent with the project-wide rule (never `toISOString()`, always local date components).

**Table sections (Pending Refunds, Top 10 Customers, Insurance Due, No Recent Maintenance) use the plain inline-styled `<table>` pattern** already established in `VehicleMaster.js`/`Maintenance.js`, not the booking list's heavier `desktop-table`/`mobile-cards` sortable-table CSS — that CSS was built for a much more complex, many-column, sortable table and would be overkill for these simple 3-5 column read-only lists.

**Bar charts also cycle the 8-colour palette per bar** (via `<Cell>` children), not just pies — spec §7 says the palette should be "cycled across slices/bars," so single-series bar charts (Vehicle Utilisation, Revenue by Centre, Spend by Vehicle Type, Collections per Staff, Bookings per Staff, Bookings by Day of Week) all colour each bar individually rather than using one flat colour.

**`ChartCard` and `SummaryCard` are small local helper components**, not full abstraction layers — every chart/card still composes its own Recharts JSX at the call site; the helpers only handle the repeated title/card/empty-state/`ResponsiveContainer` wrapper (~15 call sites would otherwise duplicate this exact boilerplate).

---
**Date:** July 2026
**Source of truth:** `CLAUDE.md`, `CLAUDE_HANDOFF.md`, `src/App.js`, `src/pages/BookingSheet.js`, `src/index.css`

---

## 1. Goal

A new **Dashboard** page for super_admin only. Gives a full operational and financial picture of the business across all centres, with a date range filter and centre filter. Built with **Recharts** for all charts.

---

## 2. Scope

**In scope:**
- New page `src/pages/Dashboard.js`
- `activePage === 'dashboard'` routing in `App.js`
- Dashboard nav link in `BookingSheet.js` header (super_admin only — same pattern as Vehicle Master link)
- Date range filter: From / To date pickers. Default = today (both from and to = today)
- Centre filter: All Centres / Sonagiri / Rani Kamlapati Station / IISER Bhouri
- All data fetched fresh on filter change — no stale state
- Recharts for all charts (install via `npm install recharts`)
- All sections listed in §4

**Explicitly out of scope:**
- Staff access — super_admin only
- Scheduled reports or email exports
- Real-time live updates (manual refresh or filter change triggers reload)
- Any new DB tables or schema changes — all data comes from existing tables

---

## 3. Navigation

### 3.1 App.js
```js
import Dashboard from './pages/Dashboard';
// Add before BookingSheet return:
if (activePage === 'dashboard') {
  return <Dashboard profile={profile} setActivePage={setActivePage} />;
}
```

### 3.2 BookingSheet.js header
- Add "Dashboard" nav link/button calling `setActivePage('dashboard')`
- Visible only when `isOwner` (super_admin) — same condition as Vehicle Master link
- No badge needed

---

## 4. Filters (top of page, always visible)

```
[ From date ] [ To date ]   [ All Centres ▾ ]   [ Refresh ]
```

- **From / To**: date pickers. Both default to today's local date on mount.
- **Centre**: dropdown — "All Centres" | "Sonagiri" | "Rani Kamlapati Station" | "IISER Bhouri". Default = "All Centres".
- **Refresh button**: re-fetches all data with current filter values.
- Filter change (any field) auto-triggers a re-fetch — no need to click Refresh manually. Refresh button is a manual fallback.
- All Supabase queries filter by `booking_date >= from AND booking_date <= to` for bookings, `expense_date >= from AND expense_date <= to` for maintenance expenses, `created_at >= from AND created_at <= to` for insurance/battery records.
- Centre filter: when a specific centre is selected, add `.eq('centre_id', centreId)` to queries. "All Centres" = no centre filter.

---

## 5. Dashboard Sections

### 5.1 Summary Cards (top row)

Six cards in a responsive grid (3 per row desktop, 2 per row tablet, 1 per row mobile):

| Card | Value | Source |
|---|---|---|
| Total Bookings | Count of bookings in range | `bookings` |
| Total Revenue | Sum of `full_amount_received` | `bookings` |
| Active Right Now | Count of `status='start'` bookings (ignore date filter) | `bookings` |
| Maintenance Spend | Sum of `amount` from `maintenance_expenses` | `maintenance_expenses` |
| Outstanding Deposits | Count of bookings where `refund_status = 'Unprocessed'` (ignore date filter) | `bookings` |
| New Customers | Count of `customers` with `created_at` in range | `customers` |

Style: same `br-form-card` pattern. Each card: label (small, muted) + value (large, bold) + optional subtitle (e.g. "₹" prefix for monetary values).

---

### 5.2 Vehicle Performance

**5.2a — Bookings per Vehicle Type (Pie Chart)**
- Data: count of bookings grouped by `vehicle` (vehicle type name) in date range
- Recharts `PieChart` + `Pie` + `Tooltip` + `Legend`
- Show top 8 vehicle types; group remainder as "Others"
- Label: vehicle type name + count

**5.2b — Revenue per Vehicle Type (Pie Chart)**
- Data: sum of `full_amount_received` grouped by `vehicle` in date range
- Same pie chart pattern
- Label: vehicle type name + ₹ amount

**5.2c — Vehicle Utilisation (Bar Chart)**
- Data: bookings count per vehicle type, sorted descending
- Recharts `BarChart` + `Bar` + `XAxis` + `YAxis` + `Tooltip`
- X axis: vehicle type name (abbreviated if long)
- Y axis: number of bookings
- Helps identify most and least used vehicles

**5.2d — Revenue Trend (Line Chart)**
- Data: sum of `full_amount_received` grouped by `booking_date` in range
- Recharts `LineChart` + `Line` + `XAxis` + `YAxis` + `Tooltip`
- X axis: date, Y axis: revenue ₹
- Shows daily revenue pattern over the selected range
- Only meaningful for ranges > 1 day — for single-day (today default), show a note: "Select a date range to see trend"

---

### 5.3 Financial Breakdown

**5.3a — Revenue by Payment Mode (Pie Chart)**
- Data: sum of `cash`, `upi_payment`, `app_payment` columns across all bookings in range
- Three slices: Cash | UPI | App Payment
- Shows how customers prefer to pay

**5.3b — Revenue by Centre (Bar Chart, super_admin "All Centres" mode only)**
- Data: sum of `full_amount_received` grouped by `centre` in range
- Hidden when a specific centre is selected in the filter (redundant then)
- Three bars: Sonagiri | Rani Kamlapati Station | IISER Bhouri

**5.3c — Pending Refunds (Summary list, not a chart)**
- Bookings where `refund_status = 'Unprocessed'` — ignore date filter, show ALL pending
- Columns: Date | Customer | Vehicle | Refund Amount | Centre
- Sorted by booking date ascending (oldest first — most urgent)
- Max 10 rows shown; "View all in Booking Sheet" link if more

---

### 5.4 Booking Patterns

**5.4a — Most Popular Booking Duration (Pie Chart)**
- Data: count of bookings grouped by `booking_type` in range
- Shows which durations (3 Hr, 1 Day, Weekly etc.) are most popular

**5.4b — Bookings by Day of Week (Bar Chart)**
- Data: count of bookings grouped by day of week (Mon–Sun) in range
- Helps identify busy days
- Only meaningful for ranges ≥7 days — otherwise note "Select a wider date range"

**5.4c — Helmet Usage (Pie Chart)**
- Data: count of bookings grouped by `helmet` (Yes/No) in range
- Simple two-slice chart — useful for compliance tracking

---

### 5.5 Customer Insights

**5.5a — New vs Repeat Customers (Pie Chart)**
- New = customer `created_at` falls within the date range
- Repeat = customer exists before the date range start (mobile already in customers table)
- Two slices: New | Repeat

**5.5b — Top 10 Customers by Booking Count (Table)**
- Data: count of bookings grouped by `mobile` / `customer_name` in range, top 10
- Columns: Rank | Customer Name | Mobile | Bookings | Total Spent
- No chart — a ranked table is cleaner here

---

### 5.6 Maintenance Overview

**5.6a — Maintenance Spend by Expense Type (Pie Chart)**
- Data: sum of `amount` grouped by `expense_type` in range
- Slices: Fuel | Parts | Labour | Insurance | Battery | Other

**5.6b — Maintenance Spend by Vehicle Type (Bar Chart)**
- Data: sum of `amount` from `maintenance_expenses` joined with `vehicles` + `vehicle_types`, grouped by vehicle type name
- Shows which vehicles cost the most to maintain

**5.6c — Insurance Due Soon (List, not a chart)**
- Vehicles where latest `insurance_records.next_due` ≤ today + 30 days (broader window than bell's 7 days — this is a planning view)
- Columns: Vehicle Type | Registration | Next Due | Days Remaining
- Colour-coded rows: red = overdue, amber = ≤7 days, yellow = ≤30 days
- Ignore date filter — always shows current insurance status

**5.6d — Vehicles with No Recent Maintenance (List)**
- Vehicles with no `maintenance_expenses` record in the last 30 days (fixed window, ignore date filter)
- Columns: Vehicle Type | Registration | Last Maintenance Date (or "Never")
- Sorted by last maintenance date ascending (longest-neglected first)

---

### 5.7 Staff Performance (super_admin only, shown when "All Centres" or any centre selected)

**5.7a — Collections per Staff Member (Bar Chart)**
- Data: sum of `cash` where `cash_paid_to = staff name` + sum of `upi_payment` where `upi_paid_to = staff name`, in range
- Groups by staff name across Cash and UPI columns
- Shows who collected how much

**5.7b — Bookings Credited per Staff Member (Bar Chart)**
- Data: count of bookings grouped by `cash_paid_to` + `upi_paid_to` combined, in range
- Note: a booking can have two paid-to entries (cash + UPI split) — count the booking once per staff member who received any payment

---

## 6. Data Fetching Strategy

All data fetched in parallel (`Promise.all`) on mount and on filter change. Separate queries per section to keep each manageable:

```js
const [from, to, centreId] = [filterFrom, filterTo, filterCentre];

const [bookings, expenses, insuranceRecords, customers] = await Promise.all([
  supabase.from('bookings')
    .select('booking_date, vehicle, full_amount_received, cash, upi_payment, app_payment, cash_paid_to, upi_paid_to, booking_type, helmet, mobile, customer_name, centre, centre_id, status, refund_status, refund_amount')
    .gte('booking_date', from).lte('booking_date', to)
    .applyIf(centreId, q => q.eq('centre_id', centreId)),

  supabase.from('maintenance_expenses')
    .select('expense_type, amount, vehicle_id, vehicles(registration_number, vehicle_types(name))')
    .gte('expense_date', from).lte('expense_date', to)
    .applyIf(centreId, q => q.eq('centre_id', centreId)),

  supabase.from('insurance_records')
    .select('vehicle_id, next_due, created_at, vehicles(registration_number, vehicle_types(name), centre_id)')
    // No date filter — always fetch for insurance due list
    .order('created_at', { ascending: false }),

  supabase.from('customers')
    .select('id, created_at')
    .gte('created_at', from + 'T00:00:00').lte('created_at', to + 'T23:59:59'),
]);
```

Note: `.applyIf` is a conceptual shorthand — implement as a conditional `.eq()` added to the query chain when `centreId` is not null.

Active bookings (§5.1 "Active Right Now") and pending refunds (§5.3c) ignore the date filter — fetch separately with only a status/refund_status filter.

All data processing (grouping, summing, sorting) done in JS after fetch — no DB aggregation functions needed. Keeps queries simple and avoids Supabase function complexity.

---

## 7. Chart Implementation Notes

- Install: `npm install recharts` — add to package.json, commit
- All charts: `width="100%"` via `ResponsiveContainer` wrapper — do not hardcode pixel widths
- Tooltip on all charts showing exact values
- Legend on pie charts
- Colour palette: use a consistent set of ~8 colours cycled across slices/bars. Suggested: `['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']`
- Empty state: if a chart has no data for the selected range, show a small "No data for this period" message inside the chart area — do not render an empty Recharts component (it throws warnings)
- `ResponsiveContainer` requires a fixed height on its parent — use `style={{ height: 300 }}` on the wrapper div

---

## 8. Layout

- Page header: "Dashboard" title + filter bar (§4)
- Sections in order: Summary Cards → Vehicle Performance → Financial Breakdown → Booking Patterns → Customer Insights → Maintenance Overview → Staff Performance
- Each section: a heading (`<h2>`) + cards/charts in a responsive grid
- Charts: 2 per row on desktop, 1 per row on mobile (use `br-grid-2` or equivalent)
- Lists/tables (Top 10 customers, pending refunds, insurance due, no-maintenance vehicles): full width, same table style as booking list
- Reuse `br-form-card` for chart wrapper cards — consistent with rest of app
- No inline styles for layout — use existing `index.css` classes; add new utility classes to `index.css` only if genuinely needed

---

## 9. Files to Create / Modify

| File | Action | Notes |
|---|---|---|
| `src/pages/Dashboard.js` | Create | New page — all dashboard logic here |
| `src/App.js` | Modify | Add `'dashboard'` routing + import |
| `src/pages/BookingSheet.js` | Modify | Add Dashboard nav link (super_admin only) |
| `package.json` | Modify | Add `recharts` dependency |
| `src/index.css` | Modify if needed | Add chart wrapper height class if not already covered |

---

## 10. Exit Criteria (reviewer checklist)

**Filters:**
- [ ] From/To default to today on mount
- [ ] Changing any filter re-fetches all data
- [ ] Centre filter "All Centres" shows combined data; specific centre filters correctly
- [ ] All date comparisons use local date components (not toISOString)

**Summary cards:**
- [ ] All 6 cards show correct values for selected range
- [ ] "Active Right Now" and "Outstanding Deposits" ignore date filter

**Charts:**
- [ ] All charts render without console errors
- [ ] All charts show "No data for this period" when empty — no broken renders
- [ ] All charts are responsive (resize with window)
- [ ] Tooltips work on all charts

**Vehicle performance:**
- [ ] Pie: bookings per vehicle type correct
- [ ] Pie: revenue per vehicle type correct
- [ ] Bar: utilisation sorted descending
- [ ] Line: revenue trend only shown for multi-day ranges

**Financial:**
- [ ] Payment mode pie splits Cash/UPI/App Payment correctly
- [ ] Revenue by centre bar hidden when specific centre selected
- [ ] Pending refunds list shows ALL unprocessed (ignores date filter), oldest first

**Booking patterns:**
- [ ] Duration pie correct
- [ ] Day of week bar only shown for ≥7 day ranges
- [ ] Helmet pie correct

**Customer insights:**
- [ ] New vs repeat correctly classified
- [ ] Top 10 table sorted by booking count descending

**Maintenance:**
- [ ] Spend by expense type pie correct
- [ ] Spend by vehicle type bar correct
- [ ] Insurance due list ignores date filter; colour coding correct
- [ ] No-recent-maintenance list correct (30-day fixed window)

**Staff performance:**
- [ ] Collections bar sums cash + UPI per staff member correctly

**Navigation:**
- [ ] Dashboard nav link visible only to super_admin
- [ ] `npm run build` passes zero ESLint errors

---

## 11. Human Gate

- No DB changes needed — no migration approval required
- `npm install recharts` must be confirmed by owner before running (adds a new dependency — exception to the no-new-dependency rule, explicitly approved for this phase)
- Write spec to `.claude/specs/phase-12-dashboard.md` in repo before implementing

---

## 12. Rollback

- Pure UI/code change — `git revert` the commit
- `recharts` can be removed from `package.json` if needed: `npm uninstall recharts`
- No DB changes to roll back
