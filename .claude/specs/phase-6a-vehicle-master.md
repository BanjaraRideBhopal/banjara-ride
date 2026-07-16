Status: COMPLETE — implemented and live as of 2026-07-16.

---

# Phase 6a — Vehicle Master (Admin Page)

## 1. Goal

Give super_admin a page to manage the vehicle fleet — assign existing registrations to different centres, add new registration numbers, and retire vehicles. This unblocks Rani Kamlapati Station and IISER Bhouri from having an empty vehicle dropdown in the booking form.

Staff do not see this page.

---

## 2. What it does

### 2a. View — Vehicle list table

A table of all vehicles sorted by type name then registration number, showing:

| Registration No. | Vehicle Type | Group | Status |
|---|---|---|---|
| MP04HZ1234 | Activa 6G | Company Owned | Active |
| MP04YY0001 | Hunter 350 | IISER Bhouri | Active |
| MP04AB5678 | Jupiter BS6 | *Unassigned* | Inactive |

- **Group column** shows `Company Owned` (for vehicles at any non-franchise centre) or the franchise centre name (e.g. `IISER Bhouri`). Individual centre names (Sonagiri / Rani Kamlapati) are NOT shown — showing them would be misleading since both company centres share the same fleet.
- Super_admin only — staff have no "Vehicles" nav button.

### 2b. Edit a vehicle

Click Edit on any row → inline dropdowns appear in that row:
- **Group** — `Company Owned` (saves `centre_id = 1`, Sonagiri as canonical) or franchise centre by name. `startEdit` normalises any company-centre vehicle (whether centre_id=1 or 2) to the canonical company ID so "Company Owned" pre-selects correctly.
- **Status** — Active / Inactive. Inactive hides the vehicle from the booking form dropdown (`loadVehiclesAndCentres` filters `.eq('active', true)`).
- Save / Cancel

Registration number and vehicle type are not editable.

### 2c. Add a new registration

"+ Add Vehicle" button opens a form above the table:
- **Registration Number** — text input, saved as uppercase
- **Vehicle Type** — dropdown of all 18 types
- **Group** — `Company Owned` or franchise centre name (same two-option list as Edit)
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

**Queries (as implemented):**
- Vehicles: `supabase.from('vehicles').select('*, vehicle_types(name), centres(name, is_franchise)')` — sorted client-side by type name then reg number
- Centres: `supabase.from('centres').select('id, name, is_franchise').order('name')` — `is_franchise` needed to build group dropdown
- Update: `supabase.from('vehicles').update({ centre_id, active }).eq('id', id)`
- Insert: `supabase.from('vehicles').insert({ registration_number, vehicle_type_id, centre_id, active: true })`

**Group dropdown logic:**
- "Company Owned" → `value = centres.find(c => !c.is_franchise).id` (Sonagiri, id=1)
- Franchise entries → one option per `centres.filter(c => c.is_franchise)` row
- `startEdit` normalises: if vehicle's current centre is non-franchise, pre-select company canonical ID regardless of whether it's Sonagiri or Rani Kamlapati

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

- [x] Super_admin sees a "Vehicles" link in the header; staff do not
- [x] Vehicle list loads and shows all vehicles with their type, centre, and active status
- [x] Edit saves centre and active changes to Supabase; list refreshes
- [x] Adding a new registration inserts into `vehicles`; list refreshes
- [x] After assigning a vehicle to Rani Kamlapati or IISER and returning to the booking sheet, those centres' vehicle dropdown shows the newly assigned type
- [x] `npm run build` passes with no warnings
