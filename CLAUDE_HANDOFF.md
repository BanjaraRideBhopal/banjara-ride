# Banjara Ride — Claude Handoff

> Snapshot of full project context, for any Claude chat/session that doesn't have access to prior conversation history. Cross-reference with `CLAUDE.md` (source of truth, actively maintained) and `MULTI_CENTRE_SPEC.md` (historical — the original multi-centre migration spec, v1.3 FINAL, fully executed by Phase 5) — this file is a condensed summary, not a replacement.
>
> Last updated: 2026-11-09 · Status: Phases 1–16 complete and **live in production**

---

## Business Overview

- **Company:** Banjara Ride, Bhopal, Madhya Pradesh, India. Est. 2017.
- **Business:** Rental — vehicles (bikes/scooters), electronics, furniture, appliances.
- This app replaces an existing Google Sheets workflow.
- **Users:** Office staff + manager, multiple simultaneous users across 3 centres.
- **Access:** Web browser (desktop + mobile), installable as PWA.

## Tech Stack

- Frontend: React (create-react-app), **no backend**
- Database: Supabase (PostgreSQL + Auth) — `https://bmjminovnhhbrthuqgkt.supabase.co`
- GitHub: `github.com/BanjaraRideBhopal/banjara-ride` (public)
- Deployed: `https://banjara-ride.vercel.app` (Vercel, auto-deploys on push to `main`)
- CI: GitHub Actions (`.github/workflows/build.yml`) runs `npm ci && npm run build` on every push/PR to `main` — a general safety net, not tied to any contributor workflow
- **Critical:** always run `npm run build` before pushing — Vercel treats ESLint warnings as build errors

---

## 3 Operating Centres

| # | Centre | Type | Vehicles (as of 2026-11-09) |
|---|---|---|---|
| 1 | Sonagiri | company | 54 |
| 2 | Rani Kamlapati Station | company | 3 (plus shares Sonagiri's fleet via group RLS) |
| 3 | IISER Bhouri | franchise | 5 (fully isolated — VEHICLE BHAURI ×3, Maestro ×1, Access 125 ×1) |

Sonagiri + Rani Kamlapati share vehicle fleet and customer pool via group-based RLS. IISER is fully isolated from both.

---

## Build Status — Phases Complete

| Phase | Description |
|---|---|
| 1 | DB migration — centres, vehicle_types, vehicles tables; bookings/customers with centre_id |
| 2 | Auth foundation — 4 Supabase Auth accounts + profiles table + RLS helper functions |
| 3 | RLS live on all 6 tables (per-centre isolation, anon fully blocked) |
| 4 | Login page live; session routing in App.js; centre-lock for staff |
| 5a | Company/franchise grouping — IISER isolated; Sonagiri + RK share fleet/customers |
| 5b | Booking sheet UI — centre switcher tabs (super_admin); Paid To scoped by centre |
| 6a | Vehicle Master — super_admin assigns vehicles to centres, marks inactive, adds registrations |
| 7a | Split payment — Cash/UPI/App Payment with individual Paid To; payment match indicator |
| 7b | Split refund — Refund Cash/UPI/App Payment with individual Refund By; refund match indicator |
| 8a | Vehicle Master — "+ Add new type..." inline; 13 required rates; two-step save |
| 8b | Booking list UX — hide list when form open; Active Bookings card below Today's; independent sort |
| 9 | Editable auto-filled fields (Rent/Deposit/Extra Charges/Actual Rent/Refund); Extra Days field; super_admin booking delete |
| 10 | Date-range CSV export (super_admin only), respects centre switcher |
| 11 | Vehicle Maintenance page — expenses/insurance/battery tracking, insurance-due badge + bell section |
| 12 | Dashboard page (super_admin, Recharts) — 6 summary cards, 6 chart/table sections |
| 12b | Dashboard fixes (Rent Revenue vs Deposits Held split, New vs Repeat rework); Maintenance record delete |
| 13 | Deduction folded into Actual Rent (was a separate subtraction at refund stage before) |
| 14 | Rate Groups — rates now per `(vehicle_type, rate_group)` via `vehicle_type_rates`, not global on `vehicle_types`; Vehicle Master reachable by staff too |
| 15 | Vendor Attachment & Revenue Sharing — `vendors`/`vendor_vehicles`, monthly statement page (super_admin) |
| 16 | Accounts — business-wide expenses/income, Profit Summary, trend charts (super_admin, stricter RLS than any other admin table) |

**Next:** Phase 6b — Employees admin page (DB-driven paidTo/refundBy per centre). **Not yet spec'd — needs a spec + owner approval before implementation.**

---

## Auth Accounts

4 accounts, all `@banjararide.com`. **Passwords are never stored in any file, commit, or chat** — owner manages them.

| Account | Role | Centre |
|---|---|---|
| `admin@banjararide.com` | super_admin | none (sees all data, accesses Vehicle Master, Dashboard, Vendor Payouts, Accounts) |
| `sonagiri@banjararide.com` | staff | Sonagiri |
| `ranikamlapati@banjararide.com` | staff | Rani Kamlapati Station |
| `iiser@banjararide.com` | staff | IISER Bhouri |

**Session flow:** `App.js` fetches `profiles` row via `select('*, centres(name)')` (embedded join → `profile.centres.name`). Staff get centre-locked BookingSheet; super_admin gets centre-switcher tabs + Vehicle Master/Dashboard/Vendor Payouts/Accounts access. Logout via `supabase.auth.signOut()` → `onAuthStateChange` redirects to Login automatically.

---

## Key Files

| File | Purpose |
|---|---|
| `src/pages/Login.js` | Email/password sign-in (`signInWithPassword`, inline error, no redirect). `autoComplete` ON (allows browser to save passwords) |
| `src/App.js` | Session routing: loading → Login → BookingSheet / VehicleMaster / Maintenance / Dashboard / VendorPayouts / Accounts (`activePage` state) |
| `src/pages/BookingSheet.js` | Main booking form + list. Accepts `{ session, profile }`. Header has nav links to every other page |
| `src/pages/VehicleMaster.js` | Vehicle admin: assign centres/rate groups, mark inactive, add registrations, add new vehicle types inline, manage rate cards. Reachable by all logged-in users (staff get a reduced edit form) |
| `src/pages/Maintenance.js` | Vehicle maintenance/insurance/battery tracking (all users, group-shared RLS) |
| `src/pages/Dashboard.js` | Analytics dashboard with Recharts (super_admin only) |
| `src/pages/VendorPayouts.js` | Vendor revenue-sharing statement + vendor/vendor-vehicle management (super_admin only) |
| `src/pages/Accounts.js` | Business-wide expenses/income, Profit Summary, trend charts (super_admin only; stricter RLS than any other admin page — see below) |
| `src/utils/vendorRevenue.js` | Shared BJ Earn / Owner Amt calculation — used by both VendorPayouts.js and Accounts.js |
| `src/data/options.js` | Dropdown options — booking types, centres, staff list. Hardcoded today; Phase 6b will make the staff list DB-driven |
| `src/utils/calculations.js` | Auto-calc logic (return datetime, rent, KM) — never modify without explicit instruction |
| `src/supabaseClient.js` | Shared Supabase singleton — import everywhere, **never** create a second instance |
| `src/index.css` | Responsive CSS classes (`br-grid-N`, `br-form-card`, `br-filter`, `desktop-table`, `mobile-cards`). **`.desktop-table`'s sticky-header CSS is coupled to BookingSheet.js's specific two-row header — do not reuse it for a single-header-row table elsewhere; use plain `overflowX:auto` instead (caused a real bug on VendorPayouts.js, Phase 15).** |
| `MULTI_CENTRE_SPEC.md` | Historical — the original multi-centre/RLS migration spec (v1.3 FINAL), fully executed by Phase 5. Not a living doc. |
| `.claude/specs/` | Phase-by-phase implementation specs, one file per phase |

---

## Database Schema (row counts as of 2026-11-09)

**centres** — `id`, `name UNIQUE`, `is_franchise`. 3 rows.

**profiles** — `id UUID` (= `auth.users.id`), `display_name`, `role` ('super_admin'/'staff'), `centre_id`. No writes via API — service role only.

**vehicle_types** — `name`, `security_deposit`, `late_charge_per_hour`, 13 rate columns (`rate_3hr` … `rate_3months`, null = duration unavailable). **Rate columns deprecated as of Phase 14** — kept as reference, `vehicle_type_rates` is now the source of truth. 24 rows.

**rate_groups** (Phase 14) — `id`, `name UNIQUE`. 2 rows: Company Owned, IISER.

**vehicle_type_rates** (Phase 14) — `vehicle_type_id` FK, `rate_group_id` FK, deposit/late-charge/13 rate columns. `UNIQUE(vehicle_type_id, rate_group_id)`. 25 rows. **This is the real source of truth for rent/deposit calculations**, not `vehicle_types`.

**vehicles** — `registration_number`, `vehicle_type_id`, `centre_id`, `active`, `rate_group_id` FK (Phase 14, NOT NULL). 62 rows (54 Sonagiri, 3 Rani Kamlapati, 5 IISER).

**customers** — `mobile TEXT UNIQUE`, `name`, `centre_id`. Global — one customer per mobile across all centres. Upsert on conflict `mobile`. Lookup has no centre filter. 1927 rows.

**bookings** — `id BIGINT` (`Date.now()`), `centre_id NOT NULL`, `status` ('start'/'end'), split payment columns, split refund columns, `extra_days`/`extra_days_charge` (Phase 9), `final_rent` (= Actual Rent, includes deduction as of Phase 13). Legacy columns kept for historic data: `paid_to`, `mode_of_payment`, `credit_to`, `refund_by` — **do not remove**. 2784 rows.

**maintenance_expenses / insurance_records / battery_records** (Phase 11) — `vehicle_id` FK, `centre_id` FK (= the vehicle's own centre, not the logged-in user's). Append-only for staff, super_admin can delete (Phase 12b). 312 / 7 / 0 rows.

**vendors** (Phase 15) — `id`, `name`, `phone`, `notes`. 15 rows (external vehicle owners).

**vendor_vehicles** (Phase 15) — `vehicle_id` FK `UNIQUE`, `vendor_id` FK, `owner_share_pct`, `parking_charge` (default ₹1000), `attached_date` (nullable, unpopulated), `active`. 57 rows. Detach a vehicle = `active=false`, not delete.

**expense_categories** (Phase 16) — `name UNIQUE`. 8 seed rows (Sonagiri Operations, RKMP Operations, Tech/Application, Marketing, Loans and EMI, Damage & Lost, HR/Employee Salary, CA/GST/ITR Expenses), admin-extensible.

**expenses / income_records** (Phase 16) — `expenses`: `category_id` FK, `amount`, `expense_date`, `description`. `income_records`: `income_type` CHECK IN ('subsidy','other'), `amount`, `income_date`, `description`. Both support super_admin delete. **No `centre_id` or vehicle linkage on either — intentional, see spec.**

---

## RLS Rules

Helper functions (security definer, stable, authenticated only): `get_my_centre_id()`, `is_super_admin()`, `is_franchise_user()`.

| Table(s) | Rule |
|---|---|
| bookings | Staff: select/insert/update own centre only. super_admin: all. Anon: blocked. |
| customers | All authenticated: read/write (global pool). Anon: blocked. |
| vehicles | SELECT: company staff see all company-centre vehicles, IISER own only, super_admin all. INSERT/DELETE: super_admin only. UPDATE: two OR'd policies — super_admin any row, staff their own centre only (Phase 14). |
| vehicle_types, centres, rate_groups, vehicle_type_rates | All authenticated: select. super_admin: write. |
| profiles | Each user sees own row. super_admin sees all. No writes via API. |
| maintenance_expenses, insurance_records, battery_records | SELECT+INSERT mirror `vehicles`' group-sharing (company staff share across company centres, IISER isolated). No UPDATE. DELETE: super_admin only. |
| vendors, vendor_vehicles | All authenticated: select. super_admin: write (`FOR ALL`). Centre-agnostic. |
| expense_categories | All authenticated: select. super_admin: write. Holds category names only, no amounts. |
| **expenses, income_records** | **Deliberately stricter than every other table above** — a single `FOR ALL USING (is_super_admin())` policy, **no `read_all` policy at all**. Staff cannot read this data even via a direct Supabase API call, not just hidden by the admin-only page. Owner's explicit decision (Phase 16), given HR/salary sensitivity. |

---

## Booking Flow (Two-Phase)

**Phase 1 — vehicle goes out:** select vehicle (types with registrations only; Lectrix EV has no 3 Hr option) → vehicle number → duration (disabled until a rate card resolves for the vehicle+rate-group combo; missing card shows an inline warning and blocks save) → mobile (auto-fills customer name via global lookup) → payment split → save → `status = 'start'`.

**Phase 2 — vehicle returned:** Close button on `status='start'` row → actual return datetime, End KM, helmet, extra hours/days + charges, deduction/reason, Actual Rent (bold, includes deduction) → refund split → save → `status = 'end'`.

### Critical code behaviours

- `formOpen = showForm || !!returningId` — when true, filter bar + ALL booking lists (Today's + Active) are hidden; only the open form shows.
- `returningBooking` **must** search both `bookings` and `activeOutBookings` state arrays. Searching only one causes a blank page (see BUG-008 in `.claude/bug-log.md`).
- **Active Bookings card:** `status='start'` + `booking_date < today`. Shown below Today's Bookings, amber left border, hidden when empty or in search mode. Has its own independent sort state.
- Rate lookups resolve via `(selected vehicle's own vehicle_type_id, its registration's rate_group_id)` — NOT the vehicle type alone (Phase 14). `lookupRateCard()`/`rateCardToVehicle()` are the core helpers.
- **Dates:** always use local date components (`getFullYear`/`getMonth`/`getDate`) — **never** `toISOString()` (breaks at midnight IST, see BUG-001).
- Centre filter changes: pass the new value explicitly as a function param, not via state — avoids async closure bug (see BUG-005).
- Module-scope `const`s referenced by a function called from an earlier-declared derived `const` are a real TDZ crash risk — a static object declared mid-component instead of at module scope broke the whole booking form for months until caught (Phase 14 post-ship). Static/non-reactive data belongs at module scope.

---

## Payment & Refund Rules

**Initial booking — split payment:** Cash ₹ + UPI ₹ + App Payment ₹ (any combination). Full Amount Received = Rent + Deposit + Delivery (auto, editable, target). Cash/UPI Paid To shown conditionally when the respective field > 0. IISER: Paid To = "Banjara Ride" only; others: full staff list (Lokendra, Rizwan, Risabh Tiwari, Manish, Guard, Nazim, Amaan, Rajkumar, Banjara Ride). Payment match indicator: green = match, amber = under, red = over. Mode of Payment / Credit To removed from UI (DB columns kept for history).

**Close booking — split refund:** Refund Cash ₹ + Refund UPI ₹ + Refund App Payment ₹. Refund Amount = Full Amount − Actual Rent (Phase 13 — deduction is already folded into Actual Rent, not subtracted again here). Cash/UPI Refund By shown conditionally, same staff list as above. Same match indicator logic. Single Refund By removed from UI (DB column kept for history).

---

## Auto-Calculations

```
Expected Return   = Booking Date + Time + Duration hours   (local TZ — getFullYear/getMonth/getDate)
Full Amount       = Rent + Security Deposit + Delivery Charges
Extra Hours Charge= Extra Hours × late_charge_per_hour      (from vehicle_type_rates)
Extra Days Charge = Extra Days × rate_1day                  (from vehicle_type_rates)
Actual Rent       = Base Rent + Total Extra Charge + Deduction   (Phase 13 — deduction folded in)
Refund Amount     = Full Amount − Actual Rent
KM Driven         = End KM − Start KM
```
All of the above (Rent, Deposit, Extra Hours/Days Charge, Actual Rent, Refund Amount) are editable, not read-only — a manual edit is never silently overwritten by the auto-fill (Phase 9's `triggerField` guard pattern).

---

## Development Rules (non-negotiable)

1. `npm run build` before every push — Vercel treats ESLint warnings as build errors. CI (`.github/workflows/build.yml`) also checks this on every push/PR to `main`.
2. Never commit `.mcp.json` or `.claude/settings.json` (contain Supabase access token)
3. Never store auth passwords in any file, commit, or chat
4. Always use local date components — never `toISOString`
5. Always write a spec in `.claude/specs/` before implementing any non-trivial feature
6. Update `CLAUDE.md` + memory files after every code change
7. One Supabase client — import from `supabaseClient.js`, never create a second instance
8. New layout sections use className from `src/index.css`, not inline styles
9. Stop for owner approval before running any DB migration — show the exact SQL first, every step individually
10. RLS + login code must ship atomically — never enable RLS without a deployed login page
11. Booking form has `autoComplete="off"`; Login form does not
12. Before writing new DDL, re-verify live column types via Supabase MCP (`information_schema.columns`) — every PK/FK in this DB is `BIGINT`, never assume `SERIAL`/`INT` from a spec draft (this exact mismatch has been caught 4+ times)
13. A new page's table should use plain `overflowX:auto`, not the `.desktop-table` class, unless it genuinely has BookingSheet.js's specific two-row header shape

### Code minimisation ("Ponytail")

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse it.
3. Does the standard library do it? Use it.
4. Does a native React/Supabase feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

No abstractions not explicitly requested. No new dependencies. Deletion > addition. Boring > clever. (One real exception so far: `src/utils/vendorRevenue.js`, extracted once a second page needed the exact same formula — reuse threshold, not speculative abstraction.)

---

## What's Next — Phase 6b

Replace hardcoded `paidToOptions` / `refundByOptions` in `src/data/options.js` with a DB-driven employees table per centre. Requires: spec written → owner approval → implementation. **Not yet started — do not implement without a written spec and explicit owner approval.**
