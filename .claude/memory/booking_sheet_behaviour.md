---
name: booking-sheet-field-behaviours
description: "Auto-calculation rules, two-phase booking flow, and all field logic — updated 2026-07-09"
metadata: 
  node_type: memory
  type: project
  originSessionId: 19d5c8a1-c885-4a13-a043-829744e75788
---

## Two-Phase Booking Flow

**Phase 1 — Initial Booking** (when vehicle goes OUT):
Staff fills this form when customer takes the vehicle.

**Phase 2 — Final / Return** (when vehicle comes BACK):
Opened by clicking "Close" button on an active row. Captures deviations from initial booking.

---

## Initial Booking Fields & Rules

- **Booking Date:** Auto-fills today (local date, NOT toISOString — that caused UTC offset bug), editable date picker
- **Booking Time:** 3 dropdowns — Hour (01-12) / Minute (00-59) / AM-PM. Auto-fills current time.
- **Centre:** Dropdown — Sonagiri / Rani Kamlapati Station / IISER Bhouri
- **Vehicle:** Dropdown of 18 vehicle types. Select this FIRST — Booking Duration is disabled until vehicle is chosen.
- **Vehicle Number:** Dropdown filtered by selected vehicle type. Auto-selects if only 1 registration for that type.
- **Booking Duration:** 13 fixed options: 3 Hr / 6 Hr / 12 Hr / 1 Day / 2 Days / 3 Days / 4 Days / 5 Days / 6 Days / 7 Days / 15 Days / 1 Month / 3 Months. Disabled until vehicle selected. Lectrix EV hides 3 Hr (not available). No number picker — each duration is a fixed rate.
- **Expected Return DateTime:** Auto = Booking Date + Time + Duration hours (uses local date components)
- **Helmet Given:** Yes / No dropdown
- **Start KM:** Odometer reading at departure
- **Mobile Number:** 10-digit; auto-fills Customer Name if returning customer (lookup in customers table)
- **Customer Name:** Auto-filled or manual
- **Estimated Rent:** Auto = vehicle.rates[bookingType] (read-only, blue bg)
- **Security Deposit:** Auto = vehicle.securityDeposit (read-only)
- **Delivery Charges:** Manual entry; triggers Full Amount recalculation
- **Full Amount Received:** Auto = Rent + Security Deposit + Delivery Charges (editable override)
- **Mode of Payment:** Cash / UPI / App Payment
- **Cash ₹:** Always visible
- **Paid To:** Shows only when Cash > 0. Options: Lokendra / Rizwan / Manish / Guard / Nazim / Banjara Ride
- **Credit To:** Shows only when Mode = UPI or App Payment. Options: BanjaraRide / Both
- **Remarks:** Free text
- **Status at booking:** 'start' (amber badge "Start")

---

## Final / Return Booking Fields & Rules

- **Actual Return Date & Time:** Date picker + 3 time dropdowns (hour/minute/AM-PM). Auto-fills current date/time when Close is clicked.
- **Helmet Returned:** Yes / No dropdown
- **End KM:** Odometer at return
- **KM Driven:** Auto = End KM − Start KM (read-only)
- **Extra Hours:** Manual — staff enters hours exceeded. Kept manual (not auto from time diff) so staff can negotiate.
- **Extra Charge ₹:** Auto = Extra Hours × vehicle.lateChargePerHour (varies by vehicle — NOT hardcoded ₹50). Orange bg.
- **Actual Rent ₹:** Auto = Base Rent + Extra Charge (read-only, blue bg)
- **Deduction ₹:** Manual
- **Reason for Deduction:** Damage / Helmet Lost / Challan / Penalty
- **Damage/Fine Description:** Textarea — only shows when Reason = Damage or Penalty
- **Refund Amount ₹:** Auto = Full Amount Received − Base Rent − Extra Charges − Deduction (read-only, blue bg)
- **Refund Status:** Processed / Unprocessed
- **Refund By:** Lokendra / Rizwan / Manish / Guard / Nazim / Banjara Ride
- **Status on close:** 'end' (green badge "End")

---

## Read-only fields: blue background (#f0f4ff)
## Extra Charge: orange background (#fff7ed)

## Return Reminders (updated 2026-07-09)

- Checks every 60 seconds for active (status='start') bookings with expected return ≤ 15 minutes away
- Fires a **browser push notification** on the device (permission requested once on first app load)
- Shows a **yellow alert banner** with customer name, vehicle, due time — banner has an ✕ dismiss button (no "Close Now" anymore)
  - Dismissed per-booking via `dismissedBannerIds` ref; banner won't reappear for those trips this session
  - New approaching bookings trigger a fresh banner
  - `forceUpdate` state used to trigger re-render after ref mutation on dismiss
- `notifiedIds` ref prevents duplicate push notifications per booking
- Works only when app tab is open — no background service worker
- `checkApproachingReturns()` also runs immediately after bookings are loaded

## Bell Icon (header, added 2026-07-09)

- 🔔 bell button in the top-right header (next to New Booking)
- Red badge shows count of urgent approaching returns (≤15 min); bell turns amber background
- Click opens a dropdown listing **all active bookings today** sorted by expected return time
  - Overdue entries shown in red with "OVERDUE" label
  - ≤15 min entries shown in amber with "Due soon" label
  - Upcoming entries shown in grey
- Click-outside-to-close via transparent fixed overlay div (zIndex 99) behind dropdown (zIndex 100)
- State: `showBell` (boolean), `activeBookings` (computed from `bookings.filter(status='start').sort(expectedReturn)`)

## Date Filter & Search (added 2026-07-09)

- **Date Filter:** Date picker with ‹ › day navigation and Today button. Fetches bookings for selected date. Default = today.
- **Search:** Text input searches ALL bookings (all dates) by mobile number OR vehicle number using partial match (`ilike`). Press Enter or click Search.
- Search and date filter are mutually exclusive — clearing search returns to date view.
- Table header updates contextually: "Today's Bookings (N)" / "Bookings on YYYY-MM-DD (N)" / "Search Results for '...' (N)"

**How to apply:** Always maintain two-phase flow. Respect vehicle-first selection order. Use local date components (never toISOString) for all date calculations. Always run `npm run build` before pushing to catch ESLint errors that Vercel treats as failures.
