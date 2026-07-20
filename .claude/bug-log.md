# Banjara Ride — Bug Log

All known bugs, root causes, fixes, and flow impact. Updated as bugs are found and fixed.

---

## BUG-001 — Date showing previous day in morning (IST timezone)

**Status:** Fixed  
**Found:** 2026-07-08  
**File:** `src/utils/calculations.js`

### What happened
Booking date and expected return datetime showed the previous day's date when used before ~5:30 AM IST.

### Root cause
`toISOString()` converts the local time to UTC before formatting. India is UTC+5:30, so before 5:30 AM IST, `new Date().toISOString()` returns yesterday's date in UTC.

### Fix
Replaced all date formatting with local date components:
```js
// Before (wrong)
new Date().toISOString().split('T')[0]

// After (correct)
`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`
```

### Why it occurred
`toISOString()` is the most common JavaScript date-to-string method and looks correct until tested across midnight in a non-UTC timezone.

### Flow impact
None — purely a display/storage fix. All date values now correctly reflect IST. No data migration needed (historic bookings stored dates at the time they were entered, which was already the correct date from the user's perspective).

---

## BUG-002 — Full Amount Received excluded Delivery Charges

**Status:** Fixed  
**Found:** 2026-07-08  
**File:** `src/pages/BookingSheet.js`

### What happened
Full Amount Received was calculated as `Rent + Security Deposit`, leaving out Delivery Charges. Staff were collecting the correct amount from customers but the system showed a lower figure.

### Root cause
Delivery Charges was added as a field after the Full Amount formula was written. The formula was not updated.

### Fix
```js
// Before
fullAmount = rent + securityDeposit

// After
fullAmount = rent + securityDeposit + deliveryCharges
```
Delivery charge field change now triggers a recalculation of Full Amount.

### Why it occurred
Field added incrementally without auditing all dependent calculations.

### Flow impact
Full Amount Received now matches what is actually collected. Refund Amount (derived from Full Amount) is also now correct.

---

## BUG-003 — Booking Duration reset silently when vehicle changed

**Status:** Fixed (UX prevention)  
**Found:** 2026-07-08  
**File:** `src/pages/BookingSheet.js`

### What happened
If a user selected a Booking Duration first, then changed the Vehicle, the duration would reset silently (because some durations like "3 Hr" are not available for Lectrix EV). User had no feedback that their selection was lost.

### Root cause
Vehicle change resets `bookingType` in `handleChange`. If the user had already picked a duration, it was wiped with no warning.

### Fix
Disabled Booking Duration dropdown until a vehicle is selected. Placeholder text reads "Select vehicle first". Vehicle Details section moved above Trip Details so the user reaches Vehicle first naturally.

### Why it occurred
Form fields were added in logical grouping order, not in user interaction order.

### Flow impact
Users must now select vehicle before duration. This is the correct flow — duration options depend on the vehicle type (Lectrix EV has no 3 Hr rate).

---

## BUG-004 — IISER staff could see all 18 vehicle types in dropdown

**Status:** Fixed  
**Found:** 2026-07-16  
**File:** `src/pages/BookingSheet.js`

### What happened
IISER Bhouri staff could see all 18 vehicle types in the Vehicle dropdown, even though IISER had 0 vehicles assigned to it.

### Root cause
`vehicle_types` is shared reference data with no RLS centre filter. The code loaded all types separately from registrations, then merged them. The dropdown rendered all types without checking if any registrations existed.

### Fix
```js
// Before
vehicles.map(v => <option key={v.id}>{v.type}</option>)

// After
vehicles.filter(v => v.registrations.length > 0).map(v => <option key={v.id}>{v.type}</option>)
```

### Why it occurred
RLS correctly blocked IISER from seeing company-owned vehicle *registrations*, but `vehicle_types` was intentionally open (shared metadata). The filter between "types with registrations" and "types without" was missing in the UI layer.

### Flow impact
IISER staff now see an empty vehicle dropdown (correct — no vehicles assigned yet). Vehicle types appear automatically the moment a registration is assigned via Vehicle Master — no code change needed. Company centre staff unaffected.

---

## BUG-005 — Centre filter tab applied with 1-click delay

**Status:** Fixed  
**Found:** 2026-07-16  
**File:** `src/pages/BookingSheet.js`

### What happened
When super_admin clicked a centre tab, the booking list did not update to that centre immediately. It updated only on the *next* action (e.g. next tab click or date change).

### Root cause
Classic React async state closure issue:
```js
// Wrong — loadBookings reads the OLD centreFilter from its closure
setCentreFilter(val);
loadBookings(filterDate); // still sees old centreFilter
```
`setCentreFilter` schedules a re-render; `loadBookings` runs immediately and reads the pre-update value.

### Fix
Pass the new value explicitly as a parameter instead of relying on state:
```js
// Correct
setCentreFilter(val);
loadBookings(filterDate, val); // val passed directly, no closure dependency
```
Both `loadBookings(date, cf = centreFilter)` and `handleSearch(cf = centreFilter)` accept an explicit `cf` parameter with the current state as default — so all existing call sites work unchanged.

### Why it occurred
React state updates are batched and asynchronous. Reading state immediately after setting it in the same synchronous block always gives the old value.

### Flow impact
None. Tab click now immediately loads the correct centre's bookings. Default parameter means all other `loadBookings()` calls (date nav, search clear, page load) continue to use `centreFilter` state as normal.

---

## BUG-006 — super_admin header showed centre name incorrectly

**Status:** Fixed  
**Found:** 2026-07-16  
**File:** `src/pages/BookingSheet.js`

### What happened
The header identity line was supposed to show `display_name · centre` for staff and `display_name` only for super_admin. Instead, super_admin also saw a centre name (or "undefined").

### Root cause
```js
// Wrong — 'owner' is never a role value in the DB
{profile.role !== 'owner' && <span> · {profile.centres?.name}</span>}

// The actual role value is 'super_admin', so this condition was always true
```

### Fix
```js
// Correct — isOwner is already defined as profile.role === 'super_admin'
{!isOwner && <span> · {profile.centres?.name}</span>}
```

### Why it occurred
The role was originally named `owner` during design but was set to `super_admin` when the DB was created. The header condition was written with the old name and never caught because `profile.centres` is null for super_admin, so it showed "undefined" rather than crashing.

### Flow impact
Visual only. Staff header unchanged. Super_admin header now correctly shows display_name with no centre suffix.

---

## BUG-007 — New customer save fails with NOT NULL constraint on centre_id

**Status:** Fixed  
**Found:** 2026-07-18  
**File:** `src/pages/BookingSheet.js`

### What happened
Saving a booking for a **new customer** (mobile number not seen before) failed with:
> `Failed to save customer: null value in column "centre_id" of relation "customers" violates not-null constraint`

Bookings for returning customers (mobile already in DB) worked fine.

### Root cause
The customer upsert payload did not include `centre_id`:
```js
supabase.from('customers').upsert(
  { mobile: form.mobileNumber, name: form.customerName },
  { onConflict: 'mobile' }
)
```
When this is a new mobile number, Supabase runs an INSERT. The `customers` table has `centre_id NOT NULL`, so the insert is rejected. On conflict (existing customer), Supabase runs an UPDATE — which doesn't touch unspecified columns, so it succeeded.

### Fix
```js
supabase.from('customers').upsert(
  { mobile: form.mobileNumber, name: form.customerName, centre_id: centreId },
  { onConflict: 'mobile' }
)
```
`centreId` was already computed on the line directly above the upsert.

### Why it occurred
During Phase 5a (customer globalisation), the upsert was redesigned to remove per-centre filtering. The intent was correct (customers are global by mobile), but the `centre_id NOT NULL` DB constraint was not relaxed, and `centre_id` was silently dropped from the payload.

### Flow impact
New customers can now be saved. For returning customers (conflict on mobile), `centre_id` is now overwritten to the current booking's centre — this is acceptable since `centre_id` on the customers table is kept for reference only and is not used in any RLS policy or business logic calculation.

---

---

## BUG-008 — Blank page when closing a booking from Active Bookings section

**Status:** Fixed  
**Found:** 2026-07-21  
**File:** `src/pages/BookingSheet.js`

### What happened
Clicking the Close button on any row in the Active Bookings card navigated to a completely blank page — only the header was visible. No form appeared.

### Root cause
`returningBooking` was derived as:
```js
const returningBooking = bookings.find(b => b.id === returningId);
```
`bookings` state holds only today's date-filtered bookings. Active Bookings (previous-day `status='start'`) are stored in a separate `activeOutBookings` state. So `returningBooking` resolved to `undefined` for any booking from the Active Bookings section.

Two things happened simultaneously:
1. `startReturn(booking)` set `returningId` → making `formOpen = true` → hiding the filter bar and all booking sections
2. The Close Booking form gate `{returningBooking && ...}` evaluated to `false` → form did not render

Result: everything hidden, nothing rendered → blank page.

### Fix
```js
// Before
const returningBooking = bookings.find(b => b.id === returningId);

// After
const returningBooking = bookings.find(b => b.id === returningId)
  || activeOutBookings.find(b => b.id === returningId);
```

### Why it occurred
Phase 8b introduced `activeOutBookings` as a separate state alongside `bookings`. The `returningBooking` lookup was not updated to search both. The bug only manifests when closing from the Active Bookings section; closing from Today's Bookings was unaffected.

### Flow impact
Close Booking form now opens correctly for bookings from both Today's Bookings and Active Bookings. After closing, the booking is removed from `activeOutBookings` via filter and the form is dismissed.

---

*Last updated: 2026-07-21*
