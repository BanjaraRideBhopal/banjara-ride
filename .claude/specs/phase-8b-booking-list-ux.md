Status: COMPLETE — implemented and live as of 2026-07-21

---

# Phase 8b — Booking List UX: Hide list when form open + Active Bookings section

## 1. Goal

Two improvements to the booking sheet front page:

1. **Hide the booking list while any form is open.** New Booking, Edit, and Close Booking forms take up vertical space — the list below them is invisible anyway, and its presence causes visual noise. When a form is active, hide the filter bar + booking tables entirely.

2. **Active Bookings section.** Vehicles that went out on a previous day and haven't been returned yet (status = 'start', booking_date < today) are invisible in the current date-filtered view. Show them in a dedicated "Active Bookings" card on the front page, above Today's Bookings.

---

## 2. Change 1 — Hide list when form is open

### Trigger
Hide filter bar + all booking sections (Active Bookings, Today's Bookings) when any of the following are true:
- `showForm === true` (new booking form open)
- `editingId !== null` (edit form open)
- `returningId !== null` (close booking form open)

When all three are false: show filter bar + booking sections as normal.

### Implementation
One derived boolean: `const formOpen = showForm || !!editingId || !!returningId;`

Wrap the filter bar and booking table section in `{!formOpen && (...)}`.

---

## 3. Change 2 — Active Bookings section

### Definition
A booking is "active" (vehicle still out from a previous day) when:
- `status = 'start'`
- `booking_date < today` (went out before today, not yet returned)

Bookings from today with `status = 'start'` are already shown in Today's Bookings — they are NOT duplicated in Active Bookings.

### Data loading
New state: `activeOutBookings` (separate from `bookings`).

Load on mount and whenever centreFilter changes:
```js
async function loadActiveBookings(cf = centreFilter) {
  let query = supabase.from('bookings').select('*')
    .eq('status', 'start')
    .lt('booking_date', getToday())
    .order('booking_date', { ascending: true });
  if (isOwner && cf !== 'all') query = query.eq('centre_id', centreIdByName[cf]);
  const { data } = await query;
  setActiveOutBookings(data || []);
}
```

Call `loadActiveBookings()` wherever `loadBookings()` is called (initial load, date change, centre tab change, after save/close). After save or close that resolves an active booking (its status changes to 'end'), it must disappear from Active Bookings on reload.

### UI — Active Bookings card

Displayed **below** Today's Bookings. Only shown when `activeOutBookings.length > 0`.

```
┌─────────────────────────────────────────────┐
│ Active Bookings (N)          amber/orange    │  ← card with amber left border
│ Vehicles still out from previous days        │
│                                              │
│  [same desktop table / mobile cards format]  │
│  [Edit] [Close] buttons work same as today's]│
└─────────────────────────────────────────────┘
```

- Card: `borderLeft: '4px solid #d97706'` (amber), same `br-form-card` class
- Header: "Active Bookings (N)" in amber/orange `#92400e`
- Sub-line: "Vehicles still out from previous days" in grey
- Table: same columns as Today's Bookings table — all columns, sticky headers, sort, Edit/Close buttons
- Mobile cards: same format as Today's Bookings cards
- NOT shown when `activeOutBookings.length === 0`
- NOT shown when `isSearchMode` (search overrides both sections)

### Sort state
Active Bookings has its own independent `activeSortColumn`/`activeSortDir` state — sorting one table does not affect the other.

---

## 4. Files changed

| File | Change |
|---|---|
| `src/pages/BookingSheet.js` | Add `activeOutBookings` state. Add `loadActiveBookings()`. Call it alongside `loadBookings()`. Add `formOpen` derived boolean. Wrap filter+tables in `{!formOpen && ...}`. Add Active Bookings card above Today's Bookings. |

---

## 5. Exit criteria

- [x] When New Booking / Edit / Close form is open, filter bar and booking tables are hidden
- [x] When form is closed/cancelled/saved, filter bar and booking tables reappear
- [x] Active Bookings card appears above Today's Bookings when any vehicle is still out from a previous day
- [x] Active Bookings card is hidden when no such bookings exist
- [x] Active Bookings reloads after a Close Booking is saved (vehicle returned — disappears from Active)
- [x] Active Bookings respects centre filter tabs (super_admin) and RLS (staff)
- [x] Active Bookings not shown in search mode
- [x] Edit and Close buttons in Active Bookings work correctly
- [x] `npm run build` passes with no warnings

## Post-ship bug fix (2026-07-21)

**BUG-008:** Clicking Close on Active Bookings showed a blank page.  
`returningBooking` was looked up in `bookings` state only. Active Bookings rows live in `activeOutBookings` — so lookup returned `undefined`, `formOpen` hid everything, and the Close form never rendered.  
**Fix:** `returningBooking = bookings.find(...) || activeOutBookings.find(...)` — searches both states. See `.claude/bug-log.md` BUG-008.
