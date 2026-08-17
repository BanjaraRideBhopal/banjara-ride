# Banjara Ride — Project Context for Claude

> **Multi-centre build in progress.** See `MULTI_CENTRE_SPEC.md` (repo root) for the full architecture, data model, RLS rules, and phase plan. That file is the source of truth for all multi-centre work — this CLAUDE.md covers the base app and current live state.

## About the Business
- Company: Banjara Ride, Bhopal, Madhya Pradesh, India
- Est. 2017
- Rental business: Vehicles (bikes/scooters), Electronics, Furniture, Appliances
- Replacing Google Sheets with this custom app
- Users: Office staff and manager (multiple simultaneous users)
- Access: Web browser (desktop + mobile), installable as PWA

## Tech Stack
- Frontend: React (create-react-app)
- Database: Supabase (PostgreSQL + Auth) — URL: https://bmjminovnhhbrthuqgkt.supabase.co
- GitHub: github.com/BanjaraRideBhopal/banjara-ride (public)
- Deployed: https://banjara-ride.vercel.app (Vercel, auto-deploys on push to main)
- No backend — frontend only
- Always run `npm run build` before pushing — Vercel treats ESLint warnings as build errors

## Current Build Status (as of 2026-08-17)
- Phases 1–14 of multi-centre build are complete and live
- Phase 1: DB migration — centres, vehicle_types, vehicles tables seeded; bookings/customers restructured with centre_id
- Phase 2: Auth foundation — 4 Supabase Auth accounts + profiles table + RLS helper functions
- Phase 3: RLS live on all 6 tables (per-centre data isolation, anon access fully blocked)
- Phase 4: Login page live; session routing in App.js; centre-lock for staff
- Phase 5a: Company/franchise grouping — IISER fully isolated; Sonagiri + Rani Kamlapati share vehicle fleet and customer pool via group-based RLS
- Phase 5b: Booking sheet UI — centre switcher tabs for super_admin; centre field removed from staff form; centre column/card/bell scoped to super_admin only; Paid To / Refund By dropdowns scoped by centre (IISER → Banjara Ride only)
- Phase 6a: Vehicle Master — super_admin can assign vehicles to centres, mark inactive, add new registrations
- Phase 7a: Split payment — Cash / UPI / App Payment fields with individual Paid To dropdowns; payment match indicator; Mode of Payment and Credit To removed
- Phase 7b: Split refund — Refund Cash / UPI / App Payment fields with individual Refund By dropdowns; refund match indicator; single Refund By removed
- Phase 8a: Vehicle Master — "+ Add new type..." option in Vehicle Type dropdown; expands inline sub-section with name, deposit, late charge, all 13 rates (all required); two-step save (vehicle_type insert → vehicle insert)
- Phase 8b: Booking list UX — filter bar + tables hidden while any form is open (formOpen = showForm || !!returningId); Active Bookings card (amber border) shows status='start' bookings from previous days above Today's Bookings; independent sort per section; hidden when empty or in search mode
- Phase 9: Editable auto-filled fields (Rent Amount, Security Deposit, Extra Hours/Days Charge, Actual Rent, Refund Amount — all editable with guarded recalculation cascade); Extra Days field parallel to Extra Hours in close booking (extra_days, extra_days_charge DB columns; Total Extra Charge = Extra Hours Charge + Extra Days Charge); super_admin Delete button on every booking row (Today's + Active Bookings, desktop + mobile)
- Phase 10: Date-range CSV export (super_admin only) — From/To date pickers + Export button in the filter bar; fresh date-range query independent of on-screen state; respects centre switcher; every active booking field (initial + close) as one column each, no new dependency (plain JS CSV building + Blob download)
- Phase 11: Vehicle Maintenance page (`src/pages/Maintenance.js`) — accessible to all logged-in users; vehicle list with insurance status badge (green/amber/red), 3 sections per vehicle (Maintenance Expenses, Insurance Status, Battery Status), each append-only (latest record + full history + inline add form); `App.js` routes `activePage === 'maintenance'`; `BookingSheet.js` header has a Maintenance nav link with a red badge (insurance due ≤7 days), and the bell dropdown shows an Insurance Due section below return reminders. 3 new tables (`maintenance_expenses`, `insurance_records`, `battery_records`) — RLS mirrors `vehicles`' group-sharing pattern (company centres share, franchise isolated), not simple per-centre isolation, so Sonagiri/Rani Kamlapati share maintenance history for shared vehicles. `centre_id` on every insert = the vehicle's own `centre_id`, not the logged-in user's.
  - Post-ship fix (2026-07-29): centre switcher rebuilt to match `vehicles`' actual grouping — "All Centres" / "Company Owned" / one tab per franchise centre (loaded live from `centres` table), replacing the original literal Sonagiri/Rani Kamlapati/IISER tabs which incorrectly showed 0 vehicles for Rani Kamlapati (all 52 are literally registered to Sonagiri; Rani Kamlapati only sees them via group sharing).
  - Post-ship fix: vehicle list changed from a flat list of all vehicle tiles to a Vehicle Type dropdown → Vehicle Number dropdown cascade (same pattern as the booking form), to avoid listing 50+ vehicles at once.
  - Post-ship addition: `battery_records` gained an optional `next_due DATE` column + form field — plain data capture only, no badge or bell alert (unlike insurance's next_due).
- Phase 12: Dashboard page (`src/pages/Dashboard.js`, super_admin only) — first and only page using a charting library (`recharts`, explicitly approved new dependency). From/To date filter (default today) + centre dropdown, all data re-fetched on any filter change via one `Promise.all`. 6 summary cards, then Vehicle Performance / Financial Breakdown / Booking Patterns / Customer Insights / Maintenance Overview / Staff Performance sections — pies, bars, a line chart, and 4 plain read-only tables (Pending Refunds, Top 10 Customers, Insurance Due ≤30 days, Vehicles with No Recent Maintenance). "Active Right Now," "Outstanding Deposits," insurance-due, and no-recent-maintenance all ignore the date filter by design (always current), but still respect the centre filter. `BookingSheet.js` gained a "Dashboard" nav link (super_admin only, no badge), same condition as the Vehicles link.
- Phase 12b: Dashboard fixes — "Total Revenue" card split into "Rent Revenue" (`final_rent`, `status='end'` only) + "Deposits Held" (`security_deposit`, all bookings); revenue charts (vehicle type pie, centre bar, trend line) switched from `full_amount_received` to `final_rent`; summary cards now 7 (`br-grid-4` + `br-grid-3`). Helmet Usage pie removed entirely. New vs Repeat Customers classification rebuilt: no longer uses `customers.created_at` (was nearly-always-100%-new and useless) — now counts each mobile's all-time bookings (centre-filtered), Repeat = >1 ever, New = exactly 1. `Maintenance.js` gained super_admin-only Delete buttons on all 3 record types (expenses/insurance/battery), backed by 3 new `super_admin_delete` DELETE RLS policies (one per maintenance table).
- Phase 13: Deduction folded into Actual Rent. `final_rent` (Actual Rent) now = Base Rent + Total Extra Charge + Deduction (previously deduction was subtracted separately at the Refund Amount stage, not part of Actual Rent). Refund Amount = Full Amount − Actual Rent (deduction no longer subtracted a second time). Deduction change now cascades to Actual Rent then Refund Amount (previously skipped straight to Refund Amount). UI: Deduction / Reason for Deduction / Damage-Fine Description moved above Actual Rent in the close booking form; Actual Rent label + value now bold. One-time backfill: 6 historical `status='end'` bookings with `deduction > 0` had `final_rent` increased by their `deduction` amount, so historical and new bookings are consistent under the new formula. `Dashboard.js` needed no change — "Rent Revenue" already reads `final_rent`.
- Phase 14: Rate Groups. Rates now live per `(vehicle_type, rate_group)` combination in a new `vehicle_type_rates` table, not globally on `vehicle_types` — lets the same vehicle type (e.g. Activa) have different prices at different rate groups (Company Owned vs IISER). `vehicle_types` rate columns are **deprecated** (kept, unused by app logic, reference only). Every vehicle now has a `rate_group_id`; rate lookups in `BookingSheet.js` (initial booking auto-fill, duration dropdown filtering, and close-booking extra-charge calculations) all resolve via `(selected vehicle's own vehicle_type_id, its registration's rate_group_id)`, not the vehicle type alone. Missing rate card → inline warning, blank rent/deposit, blocked save. `VehicleMaster.js` gained: a Rate Group column, a full edit form (registration + active for staff, + vehicle type + rate group + centre for super_admin, with duplicate-registration validation), a Rate Group field on Add Vehicle (auto-defaulted from centre), and a super_admin-only Rate Cards management section (add/edit rate cards, no delete). **Vehicle Master is now reachable by staff too** (was super_admin-only) — `App.js` routing and the `BookingSheet.js` nav link both opened up; a new `vehicles_update_staff_own_centre` RLS policy lets staff UPDATE vehicles in their own centre (DB-level scoping is by row/centre only, not by column — the UI is what limits staff to Registration+Active).
  - Post-ship cleanup (2026-08-17): Step 3c's migration copied *every* vehicle type into a Company Owned rate card, including two that are actually IISER-only in practice — `VEHICLE BHAURI` (a pure IISER placeholder type) and `Access 125` (only ever registered at IISER, MP04SQ7201). VEHICLE BHAURI's Company Owned card was unused dead data — deleted (0 company vehicles used that type). Access 125's Company Owned card was **reassigned to IISER** instead of deleted, since Access 125 had no IISER card yet (the exact gap flagged at ship time) — this single UPDATE both removed the wrong Company Owned entry and created the IISER card MP04SQ7201 needed, reusing its real existing rates rather than inventing new ones. MP04SQ7201 no longer shows the "no rate card" warning.
  - Post-ship addition (2026-08-17): the vehicle Edit form's Vehicle Type dropdown only ever listed existing `vehicle_types` — no way to correct a vehicle to a genuinely new type (e.g. relabeling a `VEHICLE BHAURI` placeholder to a real type like "Maestro") without first creating that type elsewhere. Rather than crowd a "+ Add new type..." sub-form into the compact per-row edit table, the capability was added to the roomier **Rate Cards → Add Rate Card** form instead: its Vehicle Type dropdown gained the same `__new__` sentinel + inline Type Name field pattern as the Add Vehicle form, so `saveAddRateCard()` can insert a fresh `vehicle_types` row before the `vehicle_type_rates` insert. Two-step flow for a correction like this: (1) Rate Cards → Add Rate Card → "+ Add new type..." → create the type + its rate card for the right rate group; (2) then edit the vehicle normally — the new type now appears in its dropdown.
- Next: Phase 6b — Employees admin page (hardcoded paidToOptions → DB-driven per centre)

## Key Files
- src/pages/Login.js — Email/password sign-in (signInWithPassword, inline error, no redirect — App.js handles routing)
- src/App.js — Session routing: loading → Login → BookingSheet or VehicleMaster (activePage state; super_admin only for VehicleMaster)
- src/pages/VehicleMaster.js — Vehicle admin: assign centres/rate groups, mark inactive, add registrations, add new vehicle types inline, manage rate cards. Reachable by all logged-in users as of Phase 14 (was super_admin-only) — staff get a reduced edit form (registration + active only) and no Add Vehicle / Rate Cards access
- src/pages/Maintenance.js — Vehicle maintenance/insurance/battery tracking (all users, group-shared RLS)
- src/pages/Dashboard.js — Analytics dashboard with Recharts (super_admin only)
- src/data/options.js — All dropdown options including booking types, centreOptions, payment options
- src/utils/calculations.js — Auto-calculation logic (return datetime, rent, KM)
- src/pages/BookingSheet.js — Main booking form; accepts { session, profile } props
- src/supabaseClient.js — Supabase client setup (shared singleton — import everywhere, never create a second client)
- src/index.css — Responsive CSS classes (br-grid-N, br-page, br-header, br-form-card, br-filter, br-login-page, br-login-card, desktop-table, mobile-cards)
- public/manifest.json — PWA manifest
- public/service-worker.js — Network-first service worker (skips supabase.co calls)

## Auth Accounts
4 accounts, all @banjararide.com. Passwords are NOT stored in the repo or chat — owner manages them.
- admin@ — super_admin role, no centre (sees all data)
- sonagiri@ — staff, Sonagiri centre
- ranikamlapati@ — staff, Rani Kamlapati Station centre
- iiser@ — staff, IISER Bhouri centre

## Session / Profile Flow
- App.js fetches the logged-in user's profiles row: `select('*, centres(name)')` — embedded join gives `profile.centres.name`
- BookingSheet receives `profile.role` ('super_admin' or 'staff') and `profile.display_name`
- Header shows display_name + centre (staff) or display_name only (super_admin) + logout button
- Logout: `supabase.auth.signOut()` — onAuthStateChange in App.js redirects to Login automatically

## Supabase Tables

### centres
- id (SERIAL PK), name TEXT UNIQUE, is_franchise BOOLEAN NOT NULL DEFAULT false
- Rows: Sonagiri (1, company), Rani Kamlapati Station (2, company), IISER Bhouri (3, franchise=true)

### profiles
- id UUID PK (matches auth.users.id), display_name, role ('super_admin'/'staff'), centre_id FK → centres

### vehicle_types
- id, name, security_deposit, late_charge_per_hour
- rate_3hr through rate_3months (13 rate columns) — **DEPRECATED as of Phase 14**: still present, still selected by `loadVehiclesAndCentres()` as reference data, but no longer used for any actual rent/deposit calculation. Not dropped — a future phase may remove them once `vehicle_type_rates` is fully trusted.
- 22 rows (21 original + VEHICLE BHAURI)

### rate_groups (Phase 14)
- `id BIGINT PK`, `name TEXT UNIQUE NOT NULL`, `created_at`
- 2 rows: `Company Owned` (id 1), `IISER` (id 2)
- RLS: all authenticated can SELECT; super_admin can write (`super_admin_write` policy, `FOR ALL`)

### vehicle_type_rates (Phase 14)
- `id BIGINT PK`, `vehicle_type_id BIGINT FK → vehicle_types`, `rate_group_id BIGINT FK → rate_groups`, `security_deposit`, `late_charge_per_hour`, `rate_3hr` … `rate_3months` (13 columns, nullable — null = duration unavailable for this type/group)
- `UNIQUE (vehicle_type_id, rate_group_id)` — one rate card per combination
- **This is now the source of truth for all rent/deposit calculations** — `vehicle_types`' own rate columns are deprecated (see above)
- RLS: all authenticated can SELECT; super_admin can write

### vehicles (registrations)
- id, registration_number, vehicle_type_id FK → vehicle_types, centre_id FK → centres, active BOOL, **rate_group_id BIGINT FK → rate_groups NOT NULL (added Phase 14)**
- 58 rows (as of 2026-08-17): 53 at company centres (Sonagiri/Rani Kamlapati), 5 at IISER Bhouri (4 × VEHICLE BHAURI, 1 × Access 125 — MP04SQ7201, which has no IISER rate card yet)

### customers
- id (BIGSERIAL PK — surrogate), mobile TEXT, name TEXT, centre_id INT FK → centres (kept for reference only), created_at
- UNIQUE (mobile) — one customer globally per mobile number
- Upsert target: onConflict 'mobile', no centre_id in payload
- Lookup: .eq('mobile').maybeSingle() — no centre filter; RLS fully open to all authenticated

### maintenance_expenses / insurance_records / battery_records (Phase 11)
- All 3: `id BIGSERIAL PK`, `vehicle_id BIGINT NOT NULL FK → vehicles`, `centre_id BIGINT NOT NULL FK → centres`, `created_at TIMESTAMPTZ DEFAULT now()`. Append-only for staff (no UPDATE policy, no edit feature) — super_admin can delete (Phase 12b), staff cannot.
- `maintenance_expenses`: `expense_date DATE`, `expense_type TEXT` ('Fuel'/'Parts'/'Labour'/'Insurance'/'Battery'/'Other'), `amount NUMERIC`, `description TEXT` (optional)
- `insurance_records`: `last_renewed DATE`, `next_due DATE`, `notes TEXT` (optional). Latest-per-vehicle = row with max `created_at`.
- `battery_records`: `replaced_date DATE`, `next_due DATE` (optional, plain data field only — no badge/bell alert, unlike insurance), `notes TEXT` (optional)
- `centre_id` on insert = the vehicle's own `centre_id` (`selectedVehicle.centre_id`), same value for staff and super_admin — not the logged-in user's own centre

### bookings
- id (BIGINT PK, uses Date.now()), mobile, customer_name, booking_date, booking_time, booking_type
- centre (TEXT name), centre_id (INT FK → centres) NOT NULL
- expected_return, vehicle, vehicle_number, helmet, start_km
- rent_amount, security_deposit (added Phase 9, NUMERIC DEFAULT 0), delivery_charges, full_amount_received, cash, paid_to, mode_of_payment, credit_to, remarks
- status ('start'/'end'), actual_return, end_km, km_driven, helmet_returned
- extra_hours, extra_charge (= Extra Hours Charge in UI), extra_days, extra_days_charge (both added Phase 9, NUMERIC DEFAULT 0), final_rent, deduction, reason_for_deduction, damaged_fine
- refund_amount, refund_status, refund_by, created_at
- Legacy/unused: num_days, num_weeks (TEXT — predate centre restructure, not read or written by current code)

## RLS (live as of 2026-08-17)
- Helper functions: `public.get_my_centre_id()`, `public.is_super_admin()`, `public.is_franchise_user()` — security definer, stable, granted to authenticated only
- bookings: staff select/insert/update own centre only; super_admin all; anon blocked
- customers: all authenticated can read/write — global pool, one mobile = one customer across all centres; anon blocked
- vehicles: SELECT — company staff see all company-centre vehicles, franchise (IISER) see only own, super_admin all. INSERT/DELETE — super_admin only. UPDATE (Phase 14) — **two policies, OR'd together**: `vehicles_update_super_admin_only` (`is_super_admin()`, any row) and `vehicles_update_staff_own_centre` (`centre_id = get_my_centre_id()`, both USING and WITH CHECK — staff can update rows in their own centre, and the WITH CHECK stops them changing `centre_id` to a different centre; RLS cannot restrict *which columns* they touch, only which rows — the app UI is what limits staff to Registration Number + Active).
- vehicle_types + centres: all authenticated can select; super_admin can write
- rate_groups / vehicle_type_rates (Phase 14): all authenticated can select; super_admin can write (`FOR ALL`, covers insert/update/delete)
- profiles: each user sees own row; super_admin sees all; no writes via API (service role only)
- maintenance_expenses / insurance_records / battery_records (Phase 11): SELECT + INSERT mirror `vehicles`' group-sharing logic — company staff see/write all company-centre records regardless of which company centre logged them; franchise (IISER) staff see/write only their own centre; super_admin all. No UPDATE policy (no edit feature). DELETE (Phase 12b): `super_admin_delete` policy on all 3 tables, `USING (is_super_admin())` — staff cannot delete. No explicit anon-deny policy needed — RLS enabled + zero anon policies already default-denies, same as bookings/vehicles.

## Vehicles (22 types, rate groups now per (type, group) — see Phase 14)
Vehicle data is now loaded from the `vehicle_types` + `vehicles` + `vehicle_type_rates` + `rate_groups` Supabase tables at runtime, not from src/data/vehicles.js (that file still exists but is unused).
The rate table below reflects the original (pre-Phase-14) "Company Owned" rates, now living in `vehicle_type_rates`. IISER has its own separate rate cards for the 2 vehicle types it actually uses — VEHICLE BHAURI and Access 125 — both copied verbatim from their old `vehicle_types` rows; real IISER-specific pricing can be adjusted via Vehicle Master's Rate Cards section whenever needed.
Rate groups (deposit / late charge per hour):
- Lectrix EV: ₹800, ₹65/hr — no 3Hr option
- Jupiter BS6 / Activa 6G: ₹800, ₹65/hr
- Activa 5G: ₹800, ₹55/hr
- StarCityPlus / HF Delux: ₹800, ₹55/hr
- Dream Yuga / Splendor+ / TVS Sport / Shine BS4: ₹800, ₹55/hr
- Shine BS6 / Honda SP Old: ₹800, ₹65/hr
- Honda SP New / Pulsar 125 / Gixxer / Shine Digital: ₹800, ₹75/hr
- Access 125: ₹0, ₹70/hr — no security deposit
- Thunderbird: ₹1000, ₹110/hr
- CB 350 / Hunter 350 / Classic 350: ₹1500, ₹120/hr

## Booking Durations
3 Hr / 6 Hr / 12 Hr / 1 Day / 2 Days / 3 Days / 4 Days / 5 Days / 6 Days / 7 Days / 15 Days / 1 Month / 3 Months
Each is a fixed option with a fixed rate — no number picker needed.

## Booking Flow (Two-Phase)
### Phase 1 — Initial Booking (vehicle goes out)
- Vehicle Details section appears FIRST in the form (above Trip Details) — user selects vehicle before seeing Booking Duration
- Lectrix EV: 3 Hr option hidden (null rate in DB)
- Centre field: read-only pre-filled for staff; free dropdown for super_admin
- Centre field: removed for staff (form.centre still set via useEffect; header shows centre); super_admin has dropdown
- Vehicle dropdown: filtered to only types with `registrations.length > 0` — franchise staff (IISER, 0 vehicles) see empty dropdown; types appear automatically once vehicles are assigned in DB
- Vehicle Number: shows amber message "No registrations at this centre" if 0 registrations for selected type (safety-net)
- Mobile Number auto-fills Customer Name for returning customers (global lookup by mobile — no centre filter)
- Status set to 'start' on save

### Phase 2 — Close Booking (vehicle returned)
- Triggered by Close button (only on status='start' rows)
- Fields, in order: Actual Return Date/Time, Helmet Returned, End KM, KM Driven (auto),
  Extra Hours/Days (manual) + charges (auto), Total Extra Charge,
  Deduction, Reason for Deduction, Damage/Fine Description (conditional),
  Actual Rent (auto, **bold**, includes deduction — Phase 13), Refund Amount (auto, TARGET), Refund Status, Refund Cash / UPI / App Payment ₹ with individual Refund By dropdowns; refund match indicator
- Status set to 'end' on save

## Edit Behaviour
- Edit button always visible on every row
- For status='start': opens initial booking form pre-filled
- For status='end': opens BOTH initial form AND return details form pre-filled

## Delete Behaviour (Phase 9, super_admin only)
- Delete button visible only when `isOwner` (super_admin), on every row in both Today's Bookings and Active Bookings, desktop table and mobile cards
- `window.confirm()` before delete — no modal component
- `supabase.from('bookings').delete().eq('id', bookingId)` — customer record untouched
- On success: row removed from local `bookings`/`activeOutBookings` state immediately, no reload
- RLS policy `bookings_delete_super_admin_only` (`using (is_super_admin())`) already enforces this at the DB layer — the `isOwner` UI check is a convenience guard only

## Auto-Calculations
- Expected Return DateTime: Booking Date + Time + Duration hours (local timezone — use getFullYear/getMonth/getDate, NEVER toISOString)
- Full Amount Received: Rent + Security Deposit + Delivery Charges
- Extra Hours Charge: Extra Hours × vehicle.lateChargePerHour (from DB)
- Extra Days Charge: Extra Days × vehicle rate_1day (from DB)
- Total Extra Charge: Extra Hours Charge + Extra Days Charge
- Actual Rent: Base Rent + Total Extra Charge + Deduction (Phase 13 — deduction folded in; was a separate subtraction at the refund stage before)
- Refund Amount: Full Amount Received − Actual Rent
- KM Driven: End KM − Start KM
- **Phase 9:** Rent Amount, Security Deposit, Extra Hours Charge, Extra Days Charge, Total Extra Charge, Actual Rent, and Refund Amount are all editable (not readOnly). Each still auto-fills on its trigger event, but a manual edit is never silently overwritten — `recalculate()`/`recalculateFinal()` take a `triggerField` param and skip auto-setting whichever field the user just typed into. Downstream fields still recalculate from the edited value (e.g. editing Actual Rent recalculates Refund Amount).
- **Phase 13:** Deduction is manual-only (never auto-filled), so it needs no `triggerField` guard of its own — any trigger other than `'rentAmount'` already re-derives Actual Rent (now including deduction), which naturally fires on a deduction change too.

## Payment Rules
- Three payment fields: Cash ₹, UPI ₹, App Payment ₹ (any combination allowed)
- Full Amount Received = auto-calculated (Rent + Deposit + Delivery), editable — this is the TARGET
- Payment match indicator shows when any payment field is filled: green=match, amber=under, red=over
- Cash Paid To: shows when Cash > 0. Centre-scoped: IISER → Banjara Ride only; others → full staff list
- UPI Paid To: shows when UPI > 0. Same centre-scoped options
- Mode of Payment and Credit To: removed from UI (DB columns kept for historic data)
- Refund By (single): removed from UI (Phase 7b). DB column kept for historic data.
- Refund split: Refund Cash ₹ → Cash Refund By (when > 0) → Refund UPI ₹ → UPI Refund By (when > 0) → Refund App Payment ₹
- Refund match indicator: same green/amber/red logic as payment indicator, compares Refund Amount vs sum of split refund fields
- Staff list (Paid To / Refund By): Lokendra, Rizwan, Risabh Tiwari, Manish, Guard, Nazim, Banjara Ride
- Booking form has autoComplete="off"; Login form does NOT (allows browser to save centre passwords)

## Date Filter & Search
- Date filter at top: ‹ › navigation + date picker + Today button. Default = today.
- Search box: searches ALL bookings (all dates) by mobile number or vehicle number (partial match)
- Search and date filter are mutually exclusive
- RLS transparently scopes search results to staff's own centre — no app-level centre filter needed

## CSV Export (Phase 10, super_admin only)
- From/To date pickers + Export button in the filter bar, visible only for super_admin
- Independent Supabase query (`.gte('booking_date', from).lte('booking_date', to)`) — not limited to whatever's currently on screen
- Respects the centre switcher: "All Centres" exports every centre in range; a specific centre tab exports only that centre
- Every actively-used booking field (initial + close), one column each, raw values (not the merged/formatted strings the table displays) — includes legacy `mode_of_payment`/`credit_to`/`refund_by` since they hold real data on pre-Phase-7 bookings. Excludes `num_days`/`num_weeks` (confirmed empty, unused) and `centre_id` (redundant with `centre` name).
- CSV built with plain JS (`csvEscape`/`buildCSV`) and downloaded via `Blob` + temporary `<a download>` — no new dependency, no `.xlsx` library
- Empty date range shows an alert, does not download a broken file

## Return Reminders & Bell Icon
- Checks every 60 seconds for active bookings with expected return ≤ 15 min
- Yellow alert banner appears — has ✕ dismiss button. Dismissed per-booking via ref.
- 🔔 Bell icon in header: red badge count for urgent returns. Click opens dropdown of all active bookings today sorted by expected return time. Overdue = red, due soon = amber.

## Responsive UI & PWA
- CSS classes in src/index.css handle responsive layout (not inline styles)
- Tablet (≤768px): 4/3-col grids → 2-col, header stacks, filter bar stacks
- Phone (≤480px): all grids → 1-col, bookings shown as cards instead of wide table
- Mobile card view: .mobile-cards shown, .desktop-table hidden at ≤768px
- PWA: installable via browser "Add to Home Screen" on Android (Chrome) and iPhone (Safari)

## Code Minimisation — Ponytail (lazy senior dev mode)

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern that's already here.
3. Does the standard library already do this? Use it.
4. Does a native platform/React/Supabase feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs **after** understanding the problem — read the task and trace the real flow end to end, then climb.

Rules:
- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins, but only once you understand the problem.
- Question complex requests: "Do you actually need X, or does Y cover it?"

Not lazy about: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested.

---

## Development Approach
- Requirements first, then build — step by step, one feature at a time
- Owner reviews specs before building; approves each migration step individually
- Always use local date components (never toISOString) for IST timezone correctness
- When adding new table columns, also update the mobile card view
- New layout sections use className from index.css, not inline style
- RLS + login code must always ship atomically — never enable RLS without a login page deployed
- Never commit .mcp.json or .claude/settings.json (contain Supabase access token)
- Passwords for auth accounts must never appear in chat, spec files, commit messages, or any repo file
