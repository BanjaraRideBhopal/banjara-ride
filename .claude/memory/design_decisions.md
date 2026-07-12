---
name: booking-sheet-design-decisions
description: Key design and UX decisions made during development — updated 2026-07-09 (responsive UI added)
metadata: 
  node_type: memory
  type: project
  originSessionId: 19d5c8a1-c885-4a13-a043-829744e75788
---

## Decisions made on 2026-04-01

### Two-phase booking (Initial + Final)
Split into Initial (vehicle out) and Final (vehicle returned).
**Why:** Captures deviations — extra hours, actual KM, damages, refund.
**How to apply:** Never collapse back into one form. Final opened via "Close" button.

### Extra Hours field — manual, not auto-calculated
Staff manually enters extra hours rather than auto-calculating from actual vs expected return time.
**Why:** Staff may negotiate; system time diff may not match what's charged.
**How to apply:** Extra Charge = Extra Hours × vehicle.lateChargePerHour. Keep manual.

### Status labels: Start / End
Simple language for staff. 'start' (amber) when vehicle goes out, 'end' (green) when returned.

### Refund Status: Processed / Unprocessed only
Previous multi-option status was too complex for daily use.

### Table grouped headers: Initial Booking (blue) / Return Details (yellow)
Visual separation of two phases makes scanning easier.

### Rate key naming must match exactly
vehicles.js rate keys must exactly match bookingTypes in options.js.
**Why:** Mismatch (e.g. "Daily" vs "Day") causes rent to calculate as 0.

### Edit on closed booking shows both forms
When Edit clicked on status='end' booking, both initial and return forms open pre-filled.
**Why:** Staff need to correct return details after closing.
**How to apply:** `startEdit` checks `booking.status === 'end'` — sets both `editingId` and `returningId`.

---

## Decisions made on 2026-07-08 / 2026-07-09

### All dates use local date components, never toISOString()
`getToday()`, `calculateReturnDateTime()` use `getFullYear/getMonth/getDate` instead of `toISOString().split('T')[0]`.
**Why:** `toISOString()` returns UTC — in IST (UTC+5:30) this shows yesterday's date, especially in the morning.
**How to apply:** Any new date function must use local date methods, not ISO string.

### Vehicle-first selection flow
Booking Duration dropdown is disabled until a vehicle is selected. Shows "Select vehicle first" placeholder.
**Why:** Duration resets when vehicle changes (needed to filter invalid durations like Lectrix/3Hr). Disabling prevents user frustration of selecting duration first then having it reset.

### Full Amount = Rent + Security Deposit + Delivery Charges
**Why:** Previously excluded delivery charges, causing incorrect amount collected from customer.
**How to apply:** Delivery charge field change triggers full amount recalculation.

### Refund formula: Full Amount − Base Rent − Extra Charges − Deduction
**Why:** Customer gets back everything except: the base rent, any extra time charges, and deductions. Security deposit is returned as part of the refund.
**How to apply:** `recalculateFinal` uses `booking.full_amount_received - baseRent - extraCharge - deduction`.

### Damage/Fine Description textarea — conditional
Only shows when Reason for Deduction is "Damage" or "Penalty".
**Why:** Not relevant for Helmet Lost or Challan which are straightforward.

### Booking durations: 13 fixed options, no number pickers
Replaced "Day + number of days" / "Week + number of weeks" with fixed options: 1 Day through 7 Days, 15 Days, 1 Month, 3 Months.
**Why:** Rate card has individual rates for each duration. Fixed options are simpler and match the rate card exactly.

### Centres: Sonagiri, Rani Kamlapati Station, IISER Bhouri
Three operating locations. Centre is selected at booking time and stored in bookings table.

### Staff list (Paid To / Refund By)
Lokendra, Rizwan, Manish, Guard, Nazim, Banjara Ride.

---

## Decisions made on 2026-07-09 — Mobile-responsive UI

### CSS classes over inline styles for layout
All layout-related styles (grid, padding, flex direction) moved to `src/index.css` using `.br-grid-N`, `.br-page`, `.br-header`, `.br-form-card`, `.br-filter` classes.
**Why:** Inline styles can't be overridden by media queries. CSS classes allow clean responsive breakpoints.
**How to apply:** Any new layout sections should use className from index.css, not inline style. Breakpoints: 768px (tablet) and 480px (phone).

### Mobile card view for bookings (≤768px)
On mobile the wide table is hidden (`.desktop-table { display:none }`) and replaced with per-booking cards (`.mobile-cards { display:block }`).
**Why:** Wide tables scroll awkwardly on phones. Cards show key info (customer, vehicle, status, return time, amounts) with Edit/Close buttons.
**How to apply:** When adding new columns to the desktop table, also add the field to the mobile card view.

### Responsive form grids
4-col grids → 2-col on tablet, 1-col on phone. 3-col → 2-col on tablet. 2-col → 1-col on phone.

### PWA: installable on phone home screen (2026-07-09)
- `public/manifest.json` — app name "Banjara Ride", theme #1a56a0, portrait, standalone display
- `public/service-worker.js` — network-first cache; skips supabase.co API calls (so offline doesn't show stale booking data)
- `public/index.html` — iOS apple-mobile-web-app meta tags, correct title/theme-color
- `src/index.js` — registers service worker on load
**How to apply:** Icons (logo192.png, logo512.png) are still the default React logo — replace with Banjara Ride branded icons when available.
