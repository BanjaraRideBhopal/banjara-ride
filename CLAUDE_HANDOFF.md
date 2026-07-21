# Banjara Ride — Claude Handoff

> Snapshot of full project context, for any Claude chat/session that doesn't have access to prior conversation history. Cross-reference with `CLAUDE.md` and `MULTI_CENTRE_SPEC.md` (source of truth) — this file is a summary, not a replacement.
>
> Last updated: 2026-07-21 · Status: Phases 1–8b complete and **live in production**

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
- **Critical:** always run `npm run build` before pushing — Vercel treats ESLint warnings as build errors

---

## 3 Operating Centres

| # | Centre | Type | Notes |
|---|---|---|---|
| 1 | Sonagiri | company | 52 vehicles seeded |
| 2 | Rani Kamlapati Station | company | 0 vehicles — assign in Vehicle Master |
| 3 | IISER Bhouri | franchise | fully isolated, 0 vehicles |

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

**Next:** Phase 6b — Employees admin page (DB-driven paidTo/refundBy per centre). **Not yet spec'd — needs a spec + owner approval before implementation.**

---

## Auth Accounts

4 accounts, all `@banjararide.com`. **Passwords are never stored in any file, commit, or chat** — owner manages them.

| Account | Role | Centre |
|---|---|---|
| `admin@banjararide.com` | super_admin | none (sees all data, accesses Vehicle Master) |
| `sonagiri@banjararide.com` | staff | Sonagiri |
| `ranikamlapati@banjararide.com` | staff | Rani Kamlapati Station |
| `iiser@banjararide.com` | staff | IISER Bhouri |

**Session flow:** `App.js` fetches `profiles` row via `select('*, centres(name)')` (embedded join → `profile.centres.name`). Staff get centre-locked BookingSheet; super_admin gets centre-switcher tabs + Vehicle Master access. Logout via `supabase.auth.signOut()` → `onAuthStateChange` redirects to Login automatically.

---

## Key Files

| File | Purpose |
|---|---|
| `src/pages/Login.js` | Email/password sign-in (`signInWithPassword`, inline error, no redirect). `autoComplete` ON (allows browser to save passwords) |
| `src/App.js` | Session routing: loading → Login → BookingSheet or VehicleMaster |
| `src/pages/BookingSheet.js` | Main booking form + list. Accepts `{ session, profile }`. Contains `renderTable` helper closure |
| `src/pages/VehicleMaster.js` | Vehicle admin: assign centres, mark inactive, add registrations, add new vehicle types inline (super_admin only) |
| `src/data/options.js` | Dropdown options — booking types, centres, staff list. Hardcoded today; Phase 6b will make it DB-driven |
| `src/utils/calculations.js` | Auto-calc logic (return datetime, rent, KM) |
| `src/supabaseClient.js` | Shared Supabase singleton — import everywhere, **never** create a second instance |
| `src/index.css` | Responsive CSS classes (`br-grid-N`, `br-form-card`, `br-filter`, `desktop-table`, `mobile-cards`) |
| `MULTI_CENTRE_SPEC.md` | Source of truth for multi-centre architecture, RLS rules, phase plan |
| `.claude/specs/` | Phase-by-phase implementation specs |
| `.claude/bug-log.md` | All known bugs, root causes, fixes |

---

## Database Schema

**centres** — `id`, `name UNIQUE`, `is_franchise`. 3 rows seeded.

**profiles** — `id UUID` (= `auth.users.id`), `display_name`, `role` ('super_admin'/'staff'), `centre_id`. No writes via API — service role only.

**vehicle_types** — `name`, `security_deposit`, `late_charge_per_hour`, 13 rate columns (`rate_3hr` … `rate_3months`, null = duration unavailable). 20 types seeded.

**vehicles** — `registration_number`, `vehicle_type_id`, `centre_id`, `active`. 52 rows, all at Sonagiri.

**customers** — `mobile TEXT UNIQUE`, `name`, `centre_id`. Global — one customer per mobile across all centres. Upsert on conflict `mobile`. Lookup has no centre filter.

**bookings** — `id BIGINT` (`Date.now()`), `centre_id NOT NULL`, `status` ('start'/'end'), split payment columns (`cash`, `upi_payment`, `app_payment`, `cash_paid_to`, `upi_paid_to`), split refund columns (`refund_cash`, `refund_upi`, `refund_app_payment`, `cash_refund_by`, `upi_refund_by`). Legacy columns kept for historic data: `paid_to`, `mode_of_payment`, `credit_to`, `refund_by` — **do not remove**.

---

## RLS Rules

Helper functions (security definer, stable, authenticated only): `get_my_centre_id()`, `is_super_admin()`, `is_franchise_user()`.

| Table | Rule |
|---|---|
| bookings | Staff: select/insert/update own centre only. super_admin: all. Anon: blocked. |
| customers | All authenticated: read/write (global pool). Anon: blocked. |
| vehicles | Company staff: see all company-centre vehicles. IISER: own only. super_admin: write. |
| vehicle_types | All authenticated: select. super_admin: write. |
| centres | All authenticated: select. super_admin: write. |
| profiles | Each user sees own row. super_admin sees all. No writes via API. |

---

## Booking Flow (Two-Phase)

**Phase 1 — vehicle goes out:** select vehicle (types with registrations only; Lectrix EV has no 3 Hr option) → duration → mobile (auto-fills customer name via global lookup) → payment split → save → `status = 'start'`.

**Phase 2 — vehicle returned:** Close button on `status='start'` row → actual return datetime, End KM, helmet, extra hours/charge, deduction → refund split → save → `status = 'end'`.

### Critical code behaviours

- `formOpen = showForm || !!returningId` — when true, filter bar + ALL booking lists (Today's + Active) are hidden; only the open form shows.
- `returningBooking` **must** search both `bookings` and `activeOutBookings` state arrays. Searching only one causes a blank page (see BUG-008 in `.claude/bug-log.md`).
- **Active Bookings card:** `status='start'` + `booking_date < today`. Shown below Today's Bookings, amber left border, hidden when empty or in search mode. Has its own independent sort state.
- `renderTable` — shared closure helper inside `BookingSheet`, drives both sections to avoid ~140 lines of JSX duplication.
- **Dates:** always use local date components (`getFullYear`/`getMonth`/`getDate`) — **never** `toISOString()` (breaks at midnight IST, see BUG-001).
- Centre filter changes: pass the new value explicitly as a function param, not via state — avoids async closure bug (see BUG-005).

---

## Payment & Refund Rules

**Initial booking — split payment:** Cash ₹ + UPI ₹ + App Payment ₹ (any combination). Full Amount Received = Rent + Deposit + Delivery (auto, editable, target). Cash/UPI Paid To shown conditionally when the respective field > 0. IISER: Paid To = "Banjara Ride" only; others: full staff list (Lokendra, Rizwan, Risabh Tiwari, Manish, Guard, Nazim, Banjara Ride). Payment match indicator: green = match, amber = under, red = over. Mode of Payment / Credit To removed from UI (DB columns kept for history).

**Close booking — split refund:** Refund Cash ₹ + Refund UPI ₹ + Refund App Payment ₹. Refund Amount = Full Amount − Base Rent − Extra Charges − Deduction (auto, target). Cash/UPI Refund By shown conditionally. Same match indicator logic. Single Refund By removed from UI (DB column kept for history).

---

## Auto-Calculations

```
Expected Return  = Booking Date + Time + Duration hours   (local TZ — getFullYear/getMonth/getDate)
Full Amount      = Rent + Security Deposit + Delivery Charges
Extra Charge     = Extra Hours × late_charge_per_hour     (from DB)
Actual Rent      = Base Rent + Extra Charge
Refund Amount    = Full Amount − Base Rent − Extra Charges − Deduction
KM Driven        = End KM − Start KM
```

---

## Development Rules (non-negotiable)

1. `npm run build` before every push — Vercel treats ESLint warnings as build errors
2. Never commit `.mcp.json` or `.claude/settings.json` (contain Supabase access token)
3. Never store auth passwords in any file, commit, or chat
4. Always use local date components — never `toISOString`
5. Always write a spec in `.claude/specs/` before implementing any feature
6. Update `CLAUDE.md` + memory files after every code change
7. One Supabase client — import from `supabaseClient.js`, never create a second instance
8. New layout sections use className from `src/index.css`, not inline styles
9. Stop for owner approval before running any DB migration
10. RLS + login code must ship atomically — never enable RLS without a deployed login page
11. Booking form has `autoComplete="off"`; Login form does not

### Code minimisation ("Ponytail")

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse it.
3. Does the standard library do it? Use it.
4. Does a native React/Supabase feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

No abstractions not explicitly requested. No new dependencies. Deletion > addition. Boring > clever.

---

## What's Next — Phase 6b

Replace hardcoded `paidToOptions` / `refundByOptions` in `src/data/options.js` with a DB-driven employees table per centre. Requires: spec written → owner approval → implementation. **Not yet started — do not implement without a written spec and explicit owner approval.**
