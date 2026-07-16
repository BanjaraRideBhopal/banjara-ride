Status: DRAFT — awaiting owner approval.

---

# Phase 6a — Vehicle Master (Admin Page)

## 1. Goal

Give super_admin a page to manage the vehicle fleet — assign existing registrations to different centres, add new registration numbers, and retire vehicles. This unblocks Rani Kamlapati Station and IISER Bhouri from having an empty vehicle dropdown in the booking form.

Staff do not see this page.

---

## 2. What it does

### 2a. View — Vehicle list table

A table of all vehicles grouped by vehicle type, showing:

| Registration No. | Vehicle Type | Centre | Active |
|---|---|---|---|
| MP04HZ1234 | Activa 6G | Sonagiri | Yes |
| MP04AB5678 | Jupiter BS6 | — (unassigned) | Yes |

- Columns: Registration Number, Vehicle Type, Centre, Active (Yes/No), Edit button
- Sorted by vehicle type name, then registration number
- Super_admin only — staff routed away (same guard as other admin pages in the future)

### 2b. Edit a vehicle

Click Edit on any row → inline edit row (or modal) opens:
- **Centre** — dropdown: Sonagiri / Rani Kamlapati Station / IISER Bhouri
- **Active** — toggle: Yes / No (retiring a vehicle hides it from the booking form dropdown)
- Save / Cancel

Only `centre_id` and `active` are editable. Registration number and vehicle type are fixed.

### 2c. Add a new registration

"+ Add Vehicle" button opens a small form:
- **Registration Number** — text input (e.g. MP04XX9999)
- **Vehicle Type** — dropdown of all 18 types
- **Centre** — dropdown: Sonagiri / Rani Kamlapati Station / IISER Bhouri
- Save → inserts into `vehicles` table with `active = true`

---

## 3. Navigation

- New nav link in the header: "Vehicles" — visible only to super_admin (isOwner)
- App.js (or a new Router) renders `<VehicleMaster>` when that link is active
- Simple tab-style nav: `Bookings | Vehicles` in the header for super_admin
- Staff still only see the Booking Sheet (no nav tabs)

Implementation: no React Router needed — add a `[activePage, setActivePage]` state to App.js; render `<BookingSheet>` or `<VehicleMaster>` based on it. Keep it simple.

---

## 4. Data

All reads and writes go through the existing `vehicles` table and `vehicle_types` table.

**Queries:**
- Load: `supabase.from('vehicles').select('*, vehicle_types(name)').order('vehicle_types(name)').order('registration_number')`
- Update: `supabase.from('vehicles').update({ centre_id, active }).eq('id', vehicleId)`
- Insert: `supabase.from('vehicles').insert({ registration_number, vehicle_type_id, centre_id, active: true })`

**RLS already correct:** `vehicles` write policies allow super_admin only — no DB changes needed.

---

## 5. Files to create / change

| File | Change |
|---|---|
| `src/pages/VehicleMaster.js` | New page — vehicle list table + edit row + add form |
| `src/App.js` | Add `activePage` state; render VehicleMaster when active; pass `setActivePage` down (or lift nav into App) |
| `src/pages/BookingSheet.js` | Add "Vehicles" nav link in header for super_admin that calls `setActivePage('vehicles')` |

No new tables. No RLS changes. No CSS file changes beyond minor reuse of existing classes.

---

## 6. Exit criteria

- [ ] Super_admin sees a "Vehicles" link in the header; staff do not
- [ ] Vehicle list loads and shows all vehicles with their type, centre, and active status
- [ ] Edit saves centre and active changes to Supabase; list refreshes
- [ ] Adding a new registration inserts into `vehicles`; list refreshes
- [ ] After assigning a vehicle to Rani Kamlapati or IISER and returning to the booking sheet, those centres' vehicle dropdown shows the newly assigned type
- [ ] `npm run build` passes with no warnings
