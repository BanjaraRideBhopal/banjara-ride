# Banjara Ride — Multi-Centre & Access Control Specification

**Version:** 1.3 (FINAL — all open items resolved) | **Date:** July 2026
**Purpose:** Addendum to CLAUDE.md. Defines multi-centre data model, user roles, access rules, and the agent + MCP build workflow.
**v1.3 changes:** All owner decisions closed (§9). Vehicles migrate to Supabase now (Option B). Dummy legacy bookings deleted, not mapped. Staff/vehicle centre assignments confirmed.

---

## 1. Business Context & Current State

Banjara Ride operates **three rental centres** in Bhopal:

1. **Sonagiri**
2. **Rani Kamlapati Station**
3. **IISER Bhouri**

(Spelling as used in the app's existing centre dropdown — keep consistent.)

**Already true today (do not rebuild):**
- Booking Sheet is live, mobile-responsive, PWA-installable, used across all 3 centres.
- The booking form already has a **Centre dropdown**, stored per booking in the `bookings` table. Centre selection is currently **manual and trust-based** — any staff member can pick any centre, and everyone sees all bookings.
- There is **no auth** — the app is open; the anon key is public in the repo.

**This spec's goal:** replace manual centre selection + open access with **login-scoped centres and database-enforced isolation (RLS)**.

---

## 2. Users & Roles

Exactly **4 login accounts** (Supabase Auth):

| Login | Role | Centre | Access |
|---|---|---|---|
| Super Admin | `super_admin` | — (all) | Full access, all centres, all pages |
| Sonagiri Staff | `staff` | Sonagiri | Sonagiri data only |
| Rani Kamlapati Staff | `staff` | Rani Kamlapati Station | That centre's data only |
| IISER Bhouri Staff | `staff` | IISER Bhouri | That centre's data only |

Rules:

- One **shared login per centre** — no individual employee logins for now.
- Role + centre stored in a `profiles` table linked to `auth.users` (not just user metadata) so RLS policies can reference it.
- Staff accountability for money continues via **Paid To / Credit To / Refund By** fields, not login identity. Current staff list: **Lokendra, Rizwan, Manish, Guard, Nazim, Banjara Ride**.
- Design must allow adding individual logins later without schema redesign.

---

## 3. Data Model Changes

### 3.1 New table: `centres`

| Column | Type | Notes |
|---|---|---|
| id | uuid or serial PK | |
| name | text unique | "Sonagiri", "Rani Kamlapati Station", "IISER Bhouri" |
| created_at | timestamptz | default now() |

### 3.2 New table: `profiles`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | references `auth.users.id` |
| role | text | `super_admin` or `staff` |
| centre_id | FK → centres | NULL for super_admin |

### 3.3 `bookings` — convert existing centre text to FK

The bookings table already stores centre (from the current dropdown). Migration:

1. Add `centre_id` (FK → centres, nullable initially).
2. Backfill: map existing centre text values → `centres.id`. Rows with NULL/missing centre are **dummy POC data — DELETE them** (owner confirmed; CSV backup taken first preserves them).
3. Set `centre_id` NOT NULL. Keep or drop the old text column (prefer drop after verification).

Note: `bookings.id` is currently BIGINT from `Date.now()`. Acceptable for now, but flag: two simultaneous saves at different centres could theoretically collide. Consider switching new inserts to a DB-generated identity/uuid during this migration (low effort now, harder later).

### 3.4 `customers` — PK restructure required ⚠️

Current schema: `mobile TEXT PRIMARY KEY, name, created_at`. Per-centre customers (§4) are **impossible** with mobile as PK. Migration:

1. Add surrogate `id` (uuid or bigint identity) as new PK.
2. Add `centre_id` (FK → centres).
3. Backfill `centre_id` on existing customers (owner to confirm mapping — likely derivable from their bookings' centres; a customer with bookings at 2 centres becomes 2 rows).
4. Unique constraint on `(mobile, centre_id)` — NOT mobile alone.
5. Update `bookings.mobile` FK: either re-point to the new structure or drop the FK and treat mobile as a plain lookup column (bookings already stores `customer_name` directly to avoid joins — a plain column + app-level lookup is acceptable; decide during Phase 1).
6. App change: the auto-fill-name-by-mobile lookup must now filter by the user's centre.

### 3.5 `vehicles` — migrate to Supabase now (Option B, owner confirmed)

The fleet (18 types, ~50 registrations) currently lives in `src/data/vehicles.js`. Migrate it to the database in Phase 1:

**New table `vehicle_types`:** id, name (e.g. "Activa 6G"), rate group data — deposit, late_charge_per_hour, and one rate column per duration (3hr, 6hr, 12hr, 1d, 2d, 3d, 4d, 5d, 6d, 7d, 15d, 1m, 3m; NULL where unavailable, e.g. Lectrix 3hr).

**New table `vehicles`:** id, registration_number (unique), vehicle_type_id FK, centre_id FK, active boolean (for future retire/maintenance flag).

Rules:
- Seed both tables from the current `vehicles.js` + `.claude/memory/vehicles_rates.md` data — exact rate-key ↔ duration mapping must be preserved (mismatched keys previously caused ₹0 rent bugs).
- **All ~50 vehicles are assigned to Sonagiri** (owner confirmed — only Sonagiri operates vehicle rentals today). Other centres get fleets later via the Vehicle Master admin page (Phase 6), which becomes an edit UI over these tables.
- Consequence accepted by owner: Rani Kamlapati and IISER staff will see an **empty vehicle dropdown** and cannot create vehicle bookings until vehicles are assigned to their centre. The form should show a friendly "No vehicles at this centre" message rather than a broken empty dropdown.
- App change: `BookingSheet.js` reads vehicle types, registrations, and rates from Supabase instead of `vehicles.js`. Keep `vehicles.js` in the repo until Phase 5 verification passes, then delete.
- RLS on vehicles/vehicle_types: readable by all authenticated users (staff see only their centre's vehicles via `centre_id` filter in policy); writable by super admin only.

### 3.6 `employees` (future)

When built: each employee belongs to one or more centres, feeding centre-filtered Paid To / Credit To / Refund By dropdowns. Currently hardcoded in `options.js`.

**Owner-confirmed split:** all five staff (Lokendra, Rizwan, Manish, Guard, Nazim) work across **both Sonagiri and Rani Kamlapati Station**. No staff at IISER Bhouri yet.
- Sonagiri + Rani Kamlapati dropdowns: all 5 names + Banjara Ride.
- IISER dropdowns: Banjara Ride only.
- Note: since staff span two centres, the eventual employees table needs a many-to-many (employee_centres join table) or a multi-value centre field — not a single centre_id. For now this can stay hardcoded per-centre in `options.js`; formalize in Phase 6.

---

## 4. Customer & Repeat-User Logic (Per-Centre)

**Decision: customers and repeat counts are scoped per centre.**

- Same mobile number at two centres = **two separate customer records**.
- Repeat User Yearly/Monthly = bookings from that mobile **at that centre** in the current year/month.
- All lookups filter `mobile = ? AND centre_id = ?` — including the existing auto-fill-name feature.
- No cross-centre combined view required now; data supports adding one later.

---

## 5. Row Level Security (RLS) — Mandatory

RLS must be **enabled on every Supabase table** with centre isolation enforced at the database level. UI-only filtering is not security — the anon key is public in the repo, and the database is currently open.

Policy logic:

- **staff**: `SELECT / INSERT / UPDATE` only rows where `centre_id = their profile.centre_id`. INSERT must be checked/forced to their centre. **UPDATE is required** — the two-phase flow (Close booking) and edit-closed-booking both update rows. **No date restriction on edits** (owner confirmed: staff may edit any past booking at their centre).
- **super_admin**: full access to all rows.
- **DELETE**: super admin only.
- `centres`: readable by all authenticated; writable by super admin only.
- `profiles`: users read own row; super admin reads all; no role edits via app.
- **No anonymous access** to any table once auth is live. (This will break the deployed app for anyone not logged in — expected; login page ships in Phase 4, so Phases 3–4 should deploy together or behind a short maintenance window.)

Implementation hint: security-definer helpers `get_my_centre_id()` / `is_super_admin()` reading `profiles` keep policies clean.

---

## 6. Page Access Matrix

| Page | Staff | Super Admin |
|---|---|---|
| Login | ✔ | ✔ |
| Booking Sheet (incl. search, date filter, reminders, bell) | ✔ own centre only | ✔ all centres + switcher |
| Customers (future page) | ✔ own centre only | ✔ all centres |
| Vehicle Master (future) | ✘ | ✔ |
| Employees (future) | ✘ | ✔ |
| Dashboard (future) | ✘ | ✔ |

Staff must not see nav links to admin pages, and routes must be guarded (redirect on direct URL access).

---

## 7. UI Behaviour

### 7.1 Staff experience

- **Remove the Centre dropdown from the booking form for staff** — centre comes from login, set automatically on every booking. Centre name shown in the header instead.
- Everything auto-scoped: bookings list, date filter, **search** (currently searches ALL bookings — must become centre-scoped for staff), **return reminders and bell dropdown** (only their centre's active bookings), mobile-number customer lookup.
- Vehicle / Vehicle Number dropdowns show only their centre's fleet (per §3.5 mapping).
- Paid To / Refund By dropdowns: their centre's staff + Banjara Ride (per §3.6 split; until then, keep full list).

### 7.2 Super admin experience

- Header **centre switcher**: `All Centres | Sonagiri | Rani Kamlapati Station | IISER Bhouri`.
- "All Centres" = overview mode with a Centre column visible in the table/cards.
- Creating a booking requires a specific centre selected (the existing form dropdown effectively remains, super-admin-only).
- Reminders/bell in All Centres mode show every centre's returns, labelled by centre.

### 7.3 Session

- Supabase session persistence — staff shouldn't log in daily. Logout button in header.
- PWA note: app is installed on staff phones; after auth deploys, first launch will show the login page — brief staff heads-up needed.

---

## 8. Build Workflow — Agents + MCP

Built with **Claude Code** using subagents and MCP servers. Owner provides raw requirements; the pipeline produces specs, code, verified results.

### 8.1 One-time setup

1. **Supabase MCP server** — connect via `claude mcp add` with a Supabase access token. Enables live schema inspection, running migrations, and **testing RLS against the real database**.
   - While building: full access OK. Once stable: read-only mode or a dev project.
2. **Subagents** in `.claude/agents/` (committed):
   - `spec-writer` — raw requirement → task spec; reads CLAUDE.md, this file, `.claude/memory/`. Read tools + Write for specs only.
   - `implementer` — builds against approved specs; file tools + Supabase MCP.
   - `reviewer` — verifies phase exit criteria via Supabase MCP; browser MCP later for UI flows.
   - Keep to these 3.
3. **Memory discipline** — per the existing memory rule, update `.claude/memory/` and CLAUDE.md after every change; this spec is the source of truth for the multi-centre work.
4. **Human gates** — owner approves between phases; no auto-chaining.
5. **Backup first** — CSV export of `bookings` and `customers` from Supabase before Phase 1 (free tier has no automatic backups).

### 8.2 Build phases (each verified via Supabase MCP before the next)

| Phase | Work | Exit criteria (reviewer checks) |
|---|---|---|
| 1. DB migration | `centres`, `profiles`; bookings centre→FK backfill + **delete dummy no-centre rows**; **customers PK restructure** (§3.4); **vehicles + vehicle_types tables seeded from vehicles.js, all assigned Sonagiri** (§3.5); BookingSheet reads vehicles from DB | All rows valid `centre_id`; `(mobile, centre_id)` unique; vehicle/rate data in DB matches vehicles.js exactly (spot-check rents); app still works (centre dropdown temporarily manual) |
| 2. Auth | 4 Supabase Auth users + `profiles` rows. Emails: admin@ / sonagiri@ / ranikamlapati@ / iiser@ banjararide.com (usernames only — need not be real mailboxes) | Each login authenticates; profiles match §2 |
| 3. RLS | Policies per §5 | **Tested with all 4 logins + anon**: staff blocked from other centres' rows (SELECT/INSERT/UPDATE); anon fully blocked; super admin sees all |
| 4. Login + route guards | React login page, session, protected routes | Deployed together with Phase 3; staff hitting admin URLs redirected; session persists incl. PWA |
| 5. Centre-aware UI | §7: remove staff centre dropdown, scope search/reminders/bell/lookup, super admin switcher | Manual walkthrough with all 4 logins on desktop + mobile card view |
| 6. Admin pages | Vehicle Master (vehicles → DB, §3.5 Option B), Employees, Dashboard | Spec each via `spec-writer` first |

**Phase 3 is the security gate.** No UI work until RLS is verified against the live database with all four logins. Phases 3+4 deploy together (RLS alone breaks the open app).

---

## 9. Resolved Decisions (owner-confirmed, July 2026)

| Decision | Answer |
|---|---|
| Legacy bookings without centre | Dummy data — delete during Phase 1 (after CSV backup) |
| Staff → centre split | Lokendra, Rizwan, Manish, Guard, Nazim: all at both Sonagiri and Rani Kamlapati Station; IISER has no staff yet (dropdowns show Banjara Ride only) |
| Vehicle → centre mapping | All ~50 vehicles → Sonagiri. Other centres get fleets later via Vehicle Master |
| Vehicles storage | Option B — migrate to Supabase `vehicles` + `vehicle_types` tables in Phase 1 |
| Staff editing past bookings | Allowed, any date, own centre only |
| Login scheme | admin@ / sonagiri@ / ranikamlapati@ / iiser@ banjararide.com |

## 10. Pre-flight Checklist (do on laptop before Phase 1)

- [ ] CSV backup of `bookings` and `customers` from Supabase dashboard
- [ ] Generate Supabase access token + connect Supabase MCP (`claude mcp add`)
- [ ] Create the 3 subagent files via `/agents` (spec-writer, implementer, reviewer)
- [ ] Add this file to repo root; reference it from CLAUDE.md
