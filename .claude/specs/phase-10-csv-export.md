# Phase 10 — Date-Range Booking Export to CSV

**Status:** IMPLEMENTED — code complete, build clean, awaiting owner manual QA in browser (no login credentials available to Claude to test interactively).
**Date:** July 2026
**Source of truth:** `CLAUDE.md`, `src/pages/BookingSheet.js`

---

## 1. Goal

Give super_admin a way to export all bookings within a selected date range to a CSV file, for reporting/accounting outside the app (Excel, Google Sheets).

---

## 2. Scope

**In scope:**
- Two date inputs (From / To) + an "Export CSV" button, visible only when `isOwner`.
- Respects the existing centre switcher (`centreFilter`) — exports "All Centres" or just the selected centre, same as the booking list already does.
- Query is independent of the currently-loaded `bookings`/`activeOutBookings` state — a fresh Supabase query scoped to the date range, so the export isn't limited to whatever's currently on screen.
- CSV built client-side with plain JS (no new dependency) and downloaded via a `Blob` + temporary `<a download>` — no server/edge function involved.
- Every actively-used column from the `bookings` table, initial booking + close booking fields, one row per booking, one column per field (not merged/formatted the way the on-screen table displays them — raw values are more useful for filtering/pivoting in Excel).
- Legacy columns `mode_of_payment`, `credit_to`, `refund_by` are included (they hold real historic data for bookings from before Phase 7a/7b split payment/refund, even though the current UI no longer collects them).

**Explicitly out of scope:**
- `num_days`, `num_weeks` — confirmed empty on all 197 existing rows via live query (2026-07-29); excluded entirely, no historic data loss.
- `centre_id` — redundant with the `centre` text column already present.
- Staff access — super_admin only, per owner decision.
- Real `.xlsx` format — CSV only, per owner decision (avoids adding a new dependency; CSV opens correctly in Excel/Sheets/Numbers).
- Any change to `calculations.js` or existing table/card rendering.

---

## 3. Files to change

- `src/pages/BookingSheet.js` only. No DB/RLS changes — this is a read-only `SELECT` using the same RLS the app already relies on (super_admin sees all centres; the `isOwner` UI gate is a convenience, RLS is the real enforcement for staff who could theoretically call the same query and would only ever get their own centre's rows back).

---

## 4. Implementation

### 4.1 New state

```js
const [exportFrom, setExportFrom] = useState(getToday());
const [exportTo, setExportTo] = useState(getToday());
const [exporting, setExporting] = useState(false);
```

### 4.2 Column list (DB field → CSV header)

```js
const EXPORT_COLUMNS = [
  ['id', 'Booking ID'],
  ['booking_date', 'Booking Date'],
  ['booking_time', 'Booking Time'],
  ['centre', 'Centre'],
  ['customer_name', 'Customer Name'],
  ['mobile', 'Mobile'],
  ['vehicle', 'Vehicle'],
  ['vehicle_number', 'Vehicle Number'],
  ['booking_type', 'Booking Duration'],
  ['expected_return', 'Expected Return'],
  ['helmet', 'Helmet Given'],
  ['start_km', 'Start KM'],
  ['rent_amount', 'Estimated Rent'],
  ['security_deposit', 'Security Deposit'],
  ['delivery_charges', 'Delivery Charges'],
  ['full_amount_received', 'Full Amount Received'],
  ['cash', 'Cash'],
  ['paid_to', 'Cash Paid To'],
  ['upi_amount', 'UPI Amount'],
  ['upi_paid_to', 'UPI Paid To'],
  ['app_payment_amount', 'App Payment Amount'],
  ['mode_of_payment', 'Mode of Payment (legacy)'],
  ['credit_to', 'Credit To (legacy)'],
  ['remarks', 'Remarks'],
  ['status', 'Status'],
  ['actual_return', 'Actual Return'],
  ['end_km', 'End KM'],
  ['km_driven', 'KM Driven'],
  ['helmet_returned', 'Helmet Returned'],
  ['extra_hours', 'Extra Hours'],
  ['extra_charge', 'Extra Hours Charge'],
  ['extra_days', 'Extra Days'],
  ['extra_days_charge', 'Extra Days Charge'],
  ['final_rent', 'Actual Rent'],
  ['deduction', 'Deduction'],
  ['reason_for_deduction', 'Reason For Deduction'],
  ['damaged_fine', 'Damage / Fine Description'],
  ['refund_amount', 'Refund Amount'],
  ['refund_status', 'Refund Status'],
  ['refund_cash', 'Refund Cash'],
  ['refund_cash_by', 'Cash Refund By'],
  ['refund_upi', 'Refund UPI'],
  ['refund_upi_by', 'UPI Refund By'],
  ['refund_app_payment', 'Refund App Payment'],
  ['refund_by', 'Refund By (legacy)'],
  ['created_at', 'Created At'],
];
```

### 4.3 CSV building + download (no dependency)

```js
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCSV(rows) {
  const header = EXPORT_COLUMNS.map(([, label]) => csvEscape(label)).join(',');
  const lines = rows.map(row =>
    EXPORT_COLUMNS.map(([field]) => csvEscape(row[field])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

function downloadCSV(csvText, filename) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### 4.4 Export handler

```js
async function handleExportCSV() {
  setExporting(true);
  setError('');
  let query = supabase.from('bookings').select('*')
    .gte('booking_date', exportFrom)
    .lte('booking_date', exportTo)
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true });
  if (centreFilter !== 'all') query = query.eq('centre_id', centreIdByName[centreFilter]);
  const { data, error } = await query;
  if (error) {
    setError('Export failed: ' + error.message);
    setExporting(false);
    return;
  }
  if (!data || data.length === 0) {
    alert('No bookings found in that date range.');
    setExporting(false);
    return;
  }
  const csvText = buildCSV(data);
  const filename = `bookings_${exportFrom}_to_${exportTo}.csv`;
  downloadCSV(csvText, filename);
  setExporting(false);
}
```

### 4.5 UI placement

Add to the filter bar (`br-filter`), gated on `isOwner`, alongside the existing centre switcher:

```jsx
{isOwner && (
  <>
    <div className="br-filter-divider" style={{ width: '1px', background: '#e5e7eb', alignSelf: 'stretch', margin: '0 4px' }} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Export Bookings (CSV)</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} style={{ ...input, width: '140px' }} />
        <span style={{ color: '#888', fontSize: '12px' }}>to</span>
        <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} style={{ ...input, width: '140px' }} />
        <button onClick={handleExportCSV} disabled={exporting} style={{ ...btnPrimary, padding: '8px 16px', fontSize: '13px', opacity: exporting ? 0.7 : 1 }}>
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
    </div>
  </>
)}
```

Reuses `input`, `btnPrimary`, and the existing `.br-filter`/`.br-filter-divider` classes — no new CSS.

---

## 5. Exit Criteria

- [ ] Export controls (From date, To date, Export button) visible only when logged in as super_admin.
- [ ] Not visible for any staff account.
- [ ] Selecting a date range and clicking Export downloads a `.csv` file named `bookings_<from>_to_<to>.csv`.
- [ ] CSV opens correctly in Excel/Google Sheets with one header row and one row per booking.
- [ ] All columns listed in §4.2 are present, correctly ordered, correctly labeled.
- [ ] Values with commas, quotes, or newlines (e.g. Remarks, Damage/Fine Description) are escaped correctly and don't break column alignment.
- [ ] Export respects the centre switcher — "All Centres" exports every centre's bookings in range; selecting a specific centre tab exports only that centre.
- [ ] Date range is inclusive on both ends (From date and To date bookings are both included).
- [ ] Exporting a range with zero bookings shows an alert, does not download an empty/broken file.
- [ ] Export button shows "Exporting..." and is disabled while the query is in flight.
- [ ] A network/permission error shows in the existing error banner, doesn't crash the page.
- [ ] Exporting a large range (e.g. all 197 existing bookings) works without freezing the UI noticeably.
- [ ] `npm run build` passes with zero ESLint errors.

---

## 6. Human Gate

- No DB/RLS changes — this phase requires no migration, so no schema approval gate is needed.
- Owner approves this spec (`go`) before implementation begins.
- Do not push until build is clean and exit criteria are self-verified against the code (browser QA to be done by owner, same limitation as Phase 9 — no login credentials available to Claude).

---

## 7. Rollback

Pure UI/code addition — `git revert` the commit. No DB schema, no RLS change, no data touched. Zero risk to existing functionality since this is a new, additive, read-only feature.
