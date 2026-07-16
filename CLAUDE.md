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

## Current Build Status (as of 2026-07-12)
- Phases 1–4 of multi-centre build are complete and live
- Phase 1: DB migration — centres, vehicle_types, vehicles tables seeded; bookings/customers restructured with centre_id
- Phase 2: Auth foundation — 4 Supabase Auth accounts + profiles table + RLS helper functions
- Phase 3: RLS live on all 6 tables (per-centre data isolation, anon access fully blocked)
- Phase 4: Login page live; session routing in App.js; centre-lock for staff
- Phase 5a: Company/franchise grouping — IISER fully isolated; Sonagiri + Rani Kamlapati share vehicle fleet and customer pool via group-based RLS
- Phase 5b: Booking sheet UI — centre switcher tabs for super_admin; centre field removed from staff form; centre column/card/bell scoped to super_admin only; Paid To / Refund By dropdowns scoped by centre (IISER → Banjara Ride only)
- Phase 6a: Vehicle Master — super_admin can assign vehicles to centres, mark inactive, add new registrations
- Next: Phase 6b — Employees admin page (hardcoded paidToOptions → DB-driven per centre)

## Key Files
- src/pages/Login.js — Email/password sign-in (signInWithPassword, inline error, no redirect — App.js handles routing)
- src/App.js — Session routing: loading → Login → BookingSheet or VehicleMaster (activePage state; super_admin only for VehicleMaster)
- src/pages/VehicleMaster.js — Admin page: assign vehicles to centres, mark inactive, add registrations (super_admin only)
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
- rate_3hr through rate_3months (13 rate columns, null = duration not available for this type)
- 18 rows seeded

### vehicles (registrations)
- id, registration_number, vehicle_type_id FK → vehicle_types, centre_id FK → centres, active BOOL
- 52 rows seeded — all currently assigned to Sonagiri; Rani Kamlapati + IISER have 0

### customers
- id (BIGSERIAL PK — surrogate), mobile TEXT, name TEXT, centre_id INT FK → centres (kept for reference only), created_at
- UNIQUE (mobile) — one customer globally per mobile number
- Upsert target: onConflict 'mobile', no centre_id in payload
- Lookup: .eq('mobile').maybeSingle() — no centre filter; RLS fully open to all authenticated

### bookings
- id (BIGINT PK, uses Date.now()), mobile, customer_name, booking_date, booking_time, booking_type
- centre (TEXT name), centre_id (INT FK → centres) NOT NULL
- expected_return, vehicle, vehicle_number, helmet, start_km
- rent_amount, delivery_charges, full_amount_received, cash, paid_to, mode_of_payment, credit_to, remarks
- status ('start'/'end'), actual_return, end_km, km_driven, helmet_returned
- extra_hours, extra_charge, final_rent, deduction, reason_for_deduction, damaged_fine
- refund_amount, refund_status, refund_by, created_at

## RLS (live as of 2026-07-16)
- Helper functions: `public.get_my_centre_id()`, `public.is_super_admin()`, `public.is_franchise_user()` — security definer, stable, granted to authenticated only
- bookings: staff select/insert/update own centre only; super_admin all; anon blocked
- customers: all authenticated can read/write — global pool, one mobile = one customer across all centres; anon blocked
- vehicles: company staff see all company-centre vehicles; franchise (IISER) see only own; super_admin can write
- vehicle_types + centres: all authenticated can select; super_admin can write
- profiles: each user sees own row; super_admin sees all; no writes via API (service role only)

## Vehicles (18 types, 9 rate groups)
Vehicle data is now loaded from the `vehicle_types` + `vehicles` Supabase tables at runtime, not from src/data/vehicles.js (that file still exists but is unused).
Rate groups (deposit / late charge per hour):
- Lectrix EV: ₹800, ₹65/hr — no 3Hr option
- Jupiter BS6 / Activa 6G: ₹800, ₹65/hr
- Activa 5G: ₹800, ₹55/hr
- StarCityPlus / HF Delux: ₹800, ₹55/hr
- Dream Yuga / Splendor+ / TVS Sport / Shine (BS4): ₹800, ₹55/hr
- Shine BS6: ₹800, ₹65/hr
- Honda SP / Pulsar 125 / Gixxer: ₹800, ₹75/hr
- Thunderbird: ₹1000, ₹110/hr
- CB 350 / Hunter 350 / Classic 350: ₹1500, ₹120/hr

## Booking Durations
3 Hr / 6 Hr / 12 Hr / 1 Day / 2 Days / 3 Days / 4 Days / 5 Days / 6 Days / 7 Days / 15 Days / 1 Month / 3 Months
Each is a fixed option with a fixed rate — no number picker needed.

## Booking Flow (Two-Phase)
### Phase 1 — Initial Booking (vehicle goes out)
- Vehicle must be selected FIRST — Booking Duration is disabled until vehicle chosen
- Lectrix EV: 3 Hr option hidden (null rate in DB)
- Centre field: read-only pre-filled for staff; free dropdown for super_admin
- Centre field: removed for staff (form.centre still set via useEffect; header shows centre); super_admin has dropdown
- Vehicle dropdown: filtered to only types with `registrations.length > 0` — franchise staff (IISER, 0 vehicles) see empty dropdown; types appear automatically once vehicles are assigned in DB
- Vehicle Number: shows amber message "No registrations at this centre" if 0 registrations for selected type (safety-net)
- Mobile Number auto-fills Customer Name for returning customers (global lookup by mobile — no centre filter)
- Status set to 'start' on save

### Phase 2 — Close Booking (vehicle returned)
- Triggered by Close button (only on status='start' rows)
- Fields: Actual Return Date/Time, Helmet Returned, End KM, KM Driven (auto),
  Extra Hours (manual), Extra Charge (auto), Actual Rent (auto),
  Deduction, Reason for Deduction, Damage/Fine Description (conditional),
  Refund Amount (auto), Refund Status, Refund By
- Status set to 'end' on save

## Edit Behaviour
- Edit button always visible on every row
- For status='start': opens initial booking form pre-filled
- For status='end': opens BOTH initial form AND return details form pre-filled

## Auto-Calculations
- Expected Return DateTime: Booking Date + Time + Duration hours (local timezone — use getFullYear/getMonth/getDate, NEVER toISOString)
- Full Amount Received: Rent + Security Deposit + Delivery Charges
- Extra Charge: Extra Hours × vehicle.lateChargePerHour (from DB)
- Actual Rent: Base Rent + Extra Charge
- Refund Amount: Full Amount Received − Base Rent − Extra Charges − Deduction
- KM Driven: End KM − Start KM

## Payment Rules
- Paid To field: only shows when Cash > 0
- Credit To field: only shows when Mode of Payment is UPI or App Payment
- Booking form has autoComplete="off"; Login form does NOT (allows browser to save centre passwords)

## Date Filter & Search
- Date filter at top: ‹ › navigation + date picker + Today button. Default = today.
- Search box: searches ALL bookings (all dates) by mobile number or vehicle number (partial match)
- Search and date filter are mutually exclusive
- RLS transparently scopes search results to staff's own centre — no app-level centre filter needed

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

## Development Approach
- Requirements first, then build — step by step, one feature at a time
- Owner reviews specs before building; approves each migration step individually
- Always use local date components (never toISOString) for IST timezone correctness
- When adding new table columns, also update the mobile card view
- New layout sections use className from index.css, not inline style
- RLS + login code must always ship atomically — never enable RLS without a login page deployed
- Never commit .mcp.json or .claude/settings.json (contain Supabase access token)
- Passwords for auth accounts must never appear in chat, spec files, commit messages, or any repo file
