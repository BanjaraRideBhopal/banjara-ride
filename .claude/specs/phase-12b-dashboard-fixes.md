# Phase 12b — Dashboard Fixes

**Status:** IMPLEMENTED — all 4 changes (2.1–2.4) complete, all 3 DELETE RLS policies confirmed live, build clean. Awaiting owner manual QA in browser (no login credentials available to Claude to test interactively).

---

## Implementation Notes (2026-08-12)

- **2.1:** `bookings` query extended to select `final_rent` and `security_deposit` (neither was previously fetched by Dashboard.js). Rent Revenue card filters to `status='end'` explicitly (per spec formula); the three revenue charts (vehicle type pie, centre bar, trend line) use `final_rent` directly with no explicit status filter — an active (`status='start'`) booking's `final_rent` is unset/0, so it naturally contributes nothing to these charts without extra filtering logic. `full_amount_received` remains selected and is still used by Top 10 Customers' "Total Spent" column — that field was not in the spec's explicit list of charts to change, so it was left untouched per the "surgical edits only" directive.
- **2.1 grid:** 7 cards laid out as `br-grid-4` (Total Bookings, Rent Revenue, Deposits Held, Active Right Now) + `br-grid-3` (Maintenance Spend, Outstanding Deposits, New Customers) — both classes already exist in `index.css`, no new CSS needed.
- **2.2:** `helmet` was also removed from the `bookings` SELECT list (Dashboard.js) since the Helmet Usage pie was its only consumer there — left it out to avoid fetching an unused column. (`helmet` is untouched everywhere else in the app — BookingSheet.js still selects/uses it normally.)
- **2.3:** The old `customers`-fetch-based classification is fully removed from the New vs Repeat pie. New state `mobileBookingCounts` (map of mobile → all-time booking count, centre-filtered) is populated via a second query inside `loadAll()`, run *after* the main `Promise.all` resolves (it depends on knowing which mobiles appeared in the just-fetched date-range bookings, so it can't run in parallel with the rest). Confirmed the global `customers` fetch is still required elsewhere (the "New Customers" summary card, which this fix does not touch) and left it in place.
- **2.4:** Added `handleDeleteExpense`/`handleDeleteInsurance`/`handleDeleteBattery` to `Maintenance.js`, matching the spec's suggested pattern. One addition beyond the spec's example: `handleDeleteInsurance` also calls `loadInsuranceStatus()` after a successful delete — the vehicle-picker dropdown's insurance status badge is driven by a separate `insuranceByVehicle` map (not derived from `insuranceHistory`), so without this refresh it would go stale after deleting the latest insurance record for a vehicle, in the same spirit as the edge case the spec called out (never hold a stale derived "latest" cache after a delete).
- **DB (Step 1):** Confirmed via live schema query that none of the 3 tables had a DELETE policy yet (only SELECT + INSERT each). All 3 `super_admin_delete` policies (`USING (is_super_admin())`) applied one at a time with explicit owner approval between each, then verified live via a second query. Session was interrupted mid-task by an expired Supabase access token in `.mcp.json` — owner generated a new one and restarted the client to reconnect before Step 1 could run.

---
**Date:** July 2026
**Parent spec:** `.claude/specs/phase-12-dashboard.md`
**Source of truth:** `CLAUDE.md`, `src/pages/Dashboard.js`

---

## 1. Goal

Three targeted fixes to the live Dashboard (Phase 12). No new tables, no new dependencies, no structural changes to the page — surgical edits only.

---

## 2. Changes

### 2.1 Revenue cards — split into Rent Revenue + Deposits Held

**Current:** One "Total Revenue" summary card summing `full_amount_received`.

**Problem:** `full_amount_received` includes security deposits which are refundable — it overstates actual earned revenue.

**Fix:** Replace the single "Total Revenue" card with **two separate cards**:

| Card | Value | Formula |
|---|---|---|
| Rent Revenue | Sum of `final_rent` for closed bookings (`status='end'`) in range | `SUM(final_rent)` |
| Deposits Held | Sum of `security_deposit` for all bookings in range | `SUM(security_deposit)` |

Notes:
- `final_rent` = the Actual Rent field (base rent + extra charges after return). Only meaningful on `status='end'` bookings. For `status='start'` bookings in the range (still out), use `rent_amount` as a fallback — or exclude them from Rent Revenue and add a small note "excludes active bookings".
- `security_deposit` exists on all bookings (added Phase 9, default 0).
- Total summary cards go from 6 → 7 (one card replaced by two). Adjust the grid accordingly.
- Remove `full_amount_received` from the revenue charts (§2 of parent spec) — replace with `final_rent` wherever revenue is charted (revenue per vehicle type pie, revenue by centre bar, daily revenue trend line, revenue by payment mode pie stays as-is since it uses `cash`/`upi_payment`/`app_payment` split which is already correct).

---

### 2.2 Remove Helmet Usage pie chart

**Current:** A "Helmet Usage (Yes/No)" pie chart in the Booking Patterns section.

**Fix:** Delete the chart entirely. Remove the associated data grouping logic. No replacement.

If Booking Patterns section becomes visually sparse after removal (only 2 charts left: Duration pie + Day of Week bar), that is acceptable — do not add filler.

---

### 2.3 Fix New vs Repeat Customers classification

**Current:** Classifies "new" based on `customers.created_at` falling within the date range. Almost all customers appear "new" because the customers table was only recently created — `created_at` reflects when the record was first inserted into the DB, not their first ever booking.

**Problem:** This makes the New vs Repeat pie useless — it shows nearly 100% new regardless of the date range.

**Fix:** Classify based on **booking history**, not `customers.created_at`:

```js
// From the bookings data already fetched for the date range:
const mobilesInRange = bookings.map(b => b.mobile);

// Fetch ALL bookings ever for those mobiles (no date filter):
const { data: allBookings } = await supabase
  .from('bookings')
  .select('mobile')
  .in('mobile', [...new Set(mobilesInRange)]);

// Count bookings per mobile across all time:
const bookingCountByMobile = {};
allBookings.forEach(b => {
  bookingCountByMobile[b.mobile] = (bookingCountByMobile[b.mobile] || 0) + 1;
});

// Classify customers who booked in the selected range:
let newCount = 0, repeatCount = 0;
[...new Set(mobilesInRange)].forEach(mobile => {
  if (bookingCountByMobile[mobile] > 1) repeatCount++;
  else newCount++;
});
```

- **Repeat** = mobile has more than 1 booking across all time (they've booked before, even if their first booking was outside the date range)
- **New** = mobile appears only once ever in bookings history (this range contains their first and only booking so far)
- This is consistent with how Top 10 Customers counts repeat bookings — both now use `bookings` as the source of truth, not `customers.created_at`
- The existing global `customers` fetch (used for New Customers summary card) can be removed if it's no longer used elsewhere — check before deleting
- Centre filter still applies: the `allBookings` fetch should respect the centre filter (`.eq('centre_id', centreId)` when a specific centre is selected) so "repeat" means repeat at that centre, not globally across all centres

---

### 2.4 Delete maintenance entries (super_admin only)

**Current:** Maintenance records are append-only — no delete option exists anywhere.

**Fix:** Add a Delete button on every maintenance record row (all 3 types: expenses, insurance, battery) visible only when `isOwner` (super_admin).

**UI placement:**
- Each record in the history list (expenses list, insurance history, battery history) gets a small red-tinted Delete button on the right side of the row
- Same style as booking delete: `background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5`
- Visible only when `profile.role === 'super_admin'`

**Delete logic (one handler per table, same pattern for all 3):**

```js
async function handleDeleteExpense(id) {
  if (!window.confirm('Delete this maintenance entry? This cannot be undone.')) return;
  const { error } = await supabase.from('maintenance_expenses').delete().eq('id', id);
  if (error) { alert('Delete failed: ' + error.message); return; }
  // Remove from local state immediately — no reload
  setExpenses(prev => prev.filter(e => e.id !== id));
}

// Same pattern for handleDeleteInsurance and handleDeleteBattery
```

**RLS — new DELETE policies needed (one per table):**

```sql
-- Run for each of the 3 tables:
CREATE POLICY "super_admin_delete" ON maintenance_expenses
  FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "super_admin_delete" ON insurance_records
  FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "super_admin_delete" ON battery_records
  FOR DELETE TO authenticated
  USING (is_super_admin());
```

Implementer must show these SQL statements and wait for owner approval before running. Check via Supabase MCP that no delete policy already exists on these tables first.

**Important edge case:** If the deleted record is the **latest** insurance or battery record (the one shown prominently at the top), the display must update to show the next most recent record as the new "latest" — or show an empty state if no records remain. This is handled automatically if the component re-derives "latest" from the filtered state array after deletion.

---

## 3. Files to modify

| File | Change |
|---|---|
| `src/pages/Dashboard.js` | Changes 2.1, 2.2, 2.3 |
| `src/pages/Maintenance.js` | Change 2.4 — delete buttons + handlers |

---

## 4. Exit Criteria

- [ ] "Total Revenue" card is gone; two new cards "Rent Revenue" and "Deposits Held" show correct values
- [ ] Rent Revenue uses `final_rent` (status='end' bookings); Deposits Held uses `security_deposit` (all bookings)
- [ ] Revenue charts (vehicle type pie, centre bar, trend line) use `final_rent` not `full_amount_received`
- [ ] Payment mode pie (Cash/UPI/App Payment) unchanged — it already uses correct fields
- [ ] Helmet Usage pie chart is gone — no trace in the rendered page or the code
- [ ] New vs Repeat pie: "repeat" = mobile with >1 booking all-time; "new" = mobile with exactly 1 booking all-time
- [ ] New vs Repeat result is consistent with Top 10 Customers (a customer showing multiple bookings in Top 10 must appear as "repeat" in the pie)
- [ ] Centre filter respected in the all-time bookings fetch for repeat classification
**Maintenance delete (2.4):**
- [ ] Delete button visible on every expense, insurance, and battery record row when logged in as super_admin
- [ ] Delete button NOT visible for staff logins
- [ ] `window.confirm` shown before delete; cancelling does nothing
- [ ] Confirmed delete removes row from local state immediately — no page reload
- [ ] If deleted record was the latest insurance/battery record, the next most recent record becomes the displayed "latest" automatically
- [ ] If no records remain after delete, empty state shown correctly
- [ ] Delete error shows `alert` with error message; row remains in list
- [ ] No console errors or ESLint warnings
- [ ] `npm run build` passes zero ESLint errors before pushing

---

## 5. Human Gate

- **Dashboard fixes (2.1–2.3):** No DB changes — pure `Dashboard.js` edits, can proceed immediately.
- **Maintenance delete (2.4):** Requires 3 new RLS DELETE policies. Implementer checks via Supabase MCP that no delete policy exists on the 3 tables, then shows all 3 `CREATE POLICY` statements and waits for owner approval before running each one.
- Code for 2.4 may be drafted in parallel with DB check but not pushed until policies are confirmed live.
- Write spec to `.claude/specs/phase-12b-dashboard-fixes.md` in repo before implementing.

---

## 6. Rollback

- **Dashboard fixes (2.1–2.3):** `git revert` the commit — pure UI change, no DB state affected.
- **Maintenance delete (2.4):** `git revert` the UI commit. RLS policies: `DROP POLICY "super_admin_delete" ON maintenance_expenses; DROP POLICY "super_admin_delete" ON insurance_records; DROP POLICY "super_admin_delete" ON battery_records;` — safe, no data loss.
