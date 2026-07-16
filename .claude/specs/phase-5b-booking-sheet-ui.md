Status: COMPLETE — implemented and live as of 2026-07-16.

---

# Phase 5b — Booking Sheet UI

## 1. Goal

Three UI improvements that make the booking sheet cleaner for staff and more useful for super_admin when managing across multiple centres.

---

## 2. Features

### Feature 1 — Remove centre field from staff form

**Current:** Staff see a locked read-only input showing their centre name inside the booking form.
**Change:** Remove that input entirely for staff. The centre label is already visible in the header (identity line). The `form.centre` state is still pre-filled by the existing useEffect — the DB write is unaffected.
**Super_admin:** Centre dropdown in the form stays exactly as-is (they need to pick a centre per booking).

### Feature 2 — Centre switcher for super_admin

A tab-style filter added to the filter bar, visible only to super_admin. Options:

| Label | Behaviour |
|---|---|
| All Centres | Default — loads all bookings (current behaviour) |
| Sonagiri | Adds `.eq('centre_id', 1)` to booking queries |
| Rani Kamlapati | Adds `.eq('centre_id', 2)` to booking queries |
| IISER Bhouri | Adds `.eq('centre_id', 3)` to booking queries |

Scope of the filter:
- `loadBookings` (date filter view)
- `handleSearch` (mobile / vehicle number search)
- `checkApproachingReturns` (bell + yellow alert banner)
- Does NOT auto-fill the booking form's centre dropdown

New state: `const [centreFilter, setCentreFilter] = useState('all');` — reset to 'all' on logout.

Implementation: pass `centreFilter` to all three query functions; add `.eq('centre_id', centreIdByName[centreFilter])` when `centreFilter !== 'all'`.

### Feature 3 — Centre labels for super_admin

Three places where the centre name is shown, only when `isOwner` is true:

**3a. Booking table (desktop) — add Centre column**
- New `<th>Centre</th>` column after Status
- New `<td>{b.centre}</td>` in each row
- Staff never see this column (only super_admin)

**3b. Mobile card view — add centre line**
- Add `Centre: {b.centre}` to each booking card
- Only when `isOwner`

**3c. Bell dropdown — add centre per row**
- Current row shows: customer name · vehicle number · time · status
- Add centre name as a small grey sub-line below each entry
- Only when `isOwner`

---

## 3. Files to change

| File | Change |
|---|---|
| `src/pages/BookingSheet.js` | All three features — remove staff centre field, add centreFilter state + switcher UI, add centre column/card/bell label |
| `src/index.css` | Switcher tab styles (`.br-centre-tabs`, `.br-centre-tab`, `.br-centre-tab.active`) |

No DB changes. No new Supabase queries. No RLS changes.

---

## 4. CSS for centre switcher tabs

```css
.br-centre-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.br-centre-tab {
  padding: 5px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  cursor: pointer;
  font-size: 0.82rem;
  color: #475569;
}
.br-centre-tab.active {
  background: #1a56a0;
  color: #fff;
  border-color: #1a56a0;
}
```

---

## 5. Exit criteria

- [x] Staff see NO centre field in the booking form; booking save still writes correct `centre` and `centre_id` to DB
- [x] Super_admin still sees the centre dropdown in the booking form
- [x] Super_admin sees centre switcher tabs in the filter bar; staff do not
- [x] Selecting a centre tab filters the booking list, search results, and bell correctly
- [x] "All Centres" tab is the default and restores full list
- [x] Desktop table has a Centre column for super_admin; staff never see it
- [x] Mobile cards show centre for super_admin; staff never see it
- [x] Bell dropdown rows show centre sub-line for super_admin
- [x] `npm run build` passes with no warnings

## 6. Bonus fix applied during implementation

- Header identity line was checking `profile.role === 'owner'` (always false — actual role is 'super_admin'). Fixed to use `!isOwner`. This caused the centre name to always show in the header even for super_admin.
