# Phase 3+4 — RLS Policies + Login UI (Combined, Atomic Deployment)

Status: DRAFT — awaiting owner approval before any step is executed.
Source of truth for architecture: `MULTI_CENTRE_SPEC.md` §5 (RLS), §6 (Auth/Page Access), §7 (UI Behaviour — Phase 5, referenced for context only, NOT built here), §8.2 (phase plan), §9 (resolved decisions — not reopened).
This document is the only place implementation SQL/code changes should be written. Do not write SQL or code directly into source files — follow this spec.

**These two phases ship as one deployment.** Enabling RLS (Phase 3) makes every table reject the anon key the live app currently uses — the app breaks the instant that SQL is committed. The login page (Phase 4) is what restores access. Per MULTI_CENTRE_SPEC §5: *"This will break the deployed app for anyone not logged in — expected; login page ships in Phase 4, so Phases 3–4 should deploy together."* This spec is written so the RLS logic can be fully proven correct, with zero production risk, before the real cutover — see §5 Execution Sequence.

---

## 1. Goal

Enforce database-level centre isolation via RLS on all six tables, and ship the login UI + session handling that makes the app usable again once RLS is live — deployed as a single atomic cutover so there is no window where the production app is broken with no way back in.

## 2. Scope

**In scope:**
- RLS enabled + policies on `bookings`, `customers`, `vehicles`, `vehicle_types`, `centres`, `profiles`, per MULTI_CENTRE_SPEC §5.
- `src/pages/Login.js` — email/password sign-in form.
- Session routing in `src/App.js` (no change expected to `src/index.js`, confirm only).
- `src/pages/BookingSheet.js`: logout button, current-user/centre display in header, centre dropdown locked to the logged-in centre for staff (free choice preserved for super_admin).
- A minimal, unavoidable side-effect fix: a friendly empty-state message when a staff centre has zero vehicle registrations of a selected type (see §6 flagged decision — this is a direct, immediate consequence of Step 1, not deferrable).

**Explicitly out of scope (later phases per MULTI_CENTRE_SPEC §8.2, §7):**
- Removing the Centre dropdown entirely for staff (MULTI_CENTRE_SPEC §7.1 — full removal + "Centre name shown in header instead" as the *only* centre UI). This spec **locks/pre-fills** the existing dropdown instead of removing it — see §6 Flagged Decisions for why that distinction matters and why locking (not removal) is required now, not later.
- Centre-scoping the search box, reminders, and bell dropdown in application code, and the super-admin "All Centres" overview + centre switcher (MULTI_CENTRE_SPEC §7.1–§7.2) — **but note:** RLS itself will already transparently scope staff's search/reminders/bell results to their own centre as a side effect of Step 1, with zero code changes — see §6 for why, and do not mistake this for Phase 5 being done.
- Route guards / nav-link hiding for admin pages (Vehicle Master, Employees, Dashboard) — those pages don't exist yet (Phase 6); nothing to guard.
- Individual (non-shared) employee logins.
- Any change to `vehicles.js`, `vehicle_types`/`vehicles` seed data, or the rate/duration mapping.

## 3. Prerequisites (must be true before starting)

1. Phase 1 (DB migration) complete and its exit criteria confirmed: `centres`, `vehicle_types`, `vehicles` tables live and seeded; `bookings.centre_id` NOT NULL; `customers` restructured to surrogate PK + `(mobile, centre_id)` unique.
2. Phase 2 (Auth foundation) complete and its exit criteria confirmed: `public.profiles` has exactly 4 rows matching MULTI_CENTRE_SPEC §2; all 4 `auth.users` confirmed; `get_my_centre_id()` and `is_super_admin()` exist, `security definer`, `stable`, granted to `authenticated` only.
3. Before writing or running anything, the implementer runs `list_tables` (and, for the two helper functions, a `pg_proc` check) via the Supabase MCP to confirm the live schema matches the above — do not assume the Phase 1/2 spec documents were executed exactly as written.
4. Supabase MCP server connected with write access to the project.
5. The 3 subagent files exist in `.claude/agents/`.
6. This spec has been reviewed and explicitly approved by the owner, **step by step** — see §9 Human Gate. No step below may be executed without that approval, even if earlier steps were approved in the same conversation. The atomic-cutover step (§5, "the real run") requires its own separate, final go-ahead distinct from approval of this spec's content.
7. The owner has the 4 accounts' passwords available (set during Phase 2) to log in locally during Step 5's testing — same password-handling rule as Phase 2: the implementer does not invent, paste, or persist passwords anywhere in chat, this spec, or the repo. The owner types them directly into the browser during the test session.
8. No fresh CSV backup is strictly required for this phase (RLS is non-destructive — it adds access control, it does not alter or delete rows), but confirm the Phase 1 backup is still on file in case an emergency rollback needs a reference point.

## 4. Files to read before implementing

- `c:\Projects\banjara-ride\CLAUDE.md`
- `c:\Projects\banjara-ride\MULTI_CENTRE_SPEC.md` — §5 (RLS design), §6 (Auth/Page Access), §7 (UI Behaviour — for context, not building), §8.2 (phase plan), §9 (resolved decisions, do not reopen)
- `c:\Projects\banjara-ride\.claude\specs\phase-1-db-migration.md` — confirms exact current schema this phase builds on
- `c:\Projects\banjara-ride\.claude\specs\phase-2-auth.md` — confirms `profiles` shape, the 4 accounts, and the two helper functions this phase's policies call
- `c:\Projects\banjara-ride\src\pages\BookingSheet.js` — full file; §7 below references exact line numbers as of this spec's writing — re-locate by function/variable name if they've drifted
- `c:\Projects\banjara-ride\src\App.js` and `c:\Projects\banjara-ride\src\index.js` — current state (no auth, renders `BookingSheet` directly)
- `c:\Projects\banjara-ride\src\supabaseClient.js` — confirms a single shared client instance is exported and imported everywhere (`Login.js` must reuse this same instance, not create a second client)
- `c:\Projects\banjara-ride\src\data\options.js` — `centreOptions` (still used for the super-admin-facing free-choice dropdown; unchanged)
- `c:\Projects\banjara-ride\src\index.css` — existing class conventions (`br-page`, `br-form-card`, `br-header`, `br-grid-N`) — new layout must reuse or extend these, not inline style

## 5. Execution Sequence — read this before running any step

The numbered steps in §6/§7 below are written in spec/document order (SQL first, then code), matching how this document is organised. **The actual chronological run order is different and is what matters for safety:**

1. **Step 1a (SQL, safe, no downtime):** validate the exact RLS policies against the real database inside a single transaction that ends in `rollback` — nothing persists, the app is untouched. This is possible because Postgres DDL (`alter table ... enable row level security`, `create policy ...`) is fully transactional. This can be run any time, independently of code work, and gives a real answer to "does this policy design work against the live data and the 4 real logins" before anything is committed.
2. **Steps 2–4 (code):** build `Login.js`, the `App.js` session routing, and the `BookingSheet.js` changes. None of this depends on RLS being enabled — Supabase Auth (Phase 2) already works standalone, so sign-in, session persistence, and profile fetch can all be built and tested locally via `npm start` while the tables are still open under the anon key exactly as today.
3. **Local test (part of Step 5):** with RLS still **disabled**, run `npm start` and manually log in as all 4 accounts, confirm session persistence, the centre lock/free-choice behaviour, and logout. `npm run build` must pass with zero ESLint errors. Commit the code locally. **Do not push yet.**
4. **Get the owner's final go-ahead for the atomic cutover** — separate from approval of this spec's content (§9 Human Gate).
5. **Step 1b (SQL, real, breaks prod immediately):** run the exact same policy DDL validated in Step 1a, for real this time (commit, no rollback). The instant this commits, the currently-deployed production app (old code, anon key) and any local dev server on the anon key lose all data access.
6. **Step 5 push (immediately after, same session):** `git push` to `main` to trigger the Vercel auto-deploy of the already-built-and-tested code from step 2 above. This is what restores access.
7. **Smoke test production** immediately once the Vercel deploy finishes, with all 4 logins, per §8 Exit Criteria.
8. **Staff heads-up** (MULTI_CENTRE_SPEC §7.3): message the 3 centres before or immediately after the cutover that their installed PWA will show a login screen on next open, with their centre's login email + password.

Do not skip from step 1 to step 5 above without doing steps 2–4 first — that is exactly the "RLS live, no login code deployed" outage this whole structure exists to avoid.

---

## 6. Phase 3 — RLS (SQL)

### Flagged decisions (read before Step 1a)

1. **Write policies on `vehicles`, `vehicle_types`, `centres` for `super_admin`.** The task brief for this spec only specified `SELECT` policies for these three tables. MULTI_CENTRE_SPEC §3.5 and §5 both say these tables are "writable by super admin only." Nothing in the brief forbids this — it's an omission, not a contradiction — so this spec includes minimal super-admin-only `insert`/`update`/`delete` policies for all three, so that Phase 6 (Vehicle Master admin page) does not need a follow-up RLS spec just to allow the one role that's supposed to manage this data to write to it. Flagged rather than silently added — confirm before running, or tell the implementer to drop these specific policies if you'd rather defer them to Phase 6.
2. **Centre dropdown lock, not removal, for staff (Step 4b).** MULTI_CENTRE_SPEC §7.1 describes *removing* the Centre dropdown for staff entirely in Phase 5. This spec instead **locks** the existing dropdown to the staff member's own centre and leaves it visible, disabled, in Phase 4. This is not a reopening of the §7.1 decision — it is a functional necessity created by Step 1's `bookings`/`customers` `INSERT`/`UPDATE` policies, which reject any row whose `centre_id` doesn't match the staff member's `profiles.centre_id`. Without locking the value staff submit, every booking a staff member tries to save with the "wrong" centre selected in the still-freely-editable dropdown would be silently rejected by the database the moment RLS goes live — that is a functional break, not a UX nicety, and it ships with Phase 3, not Phase 5. Full removal (dropdown gone, centre name only in header) remains Phase 5 work.
3. **Vehicle Number empty-state message.** `vehicle_types` stays unfiltered (`using (true)`) since types are shared, but `vehicles` (the registrations table) is centre-scoped. Combined in `BookingSheet.js`, this means the Vehicle *type* dropdown will keep showing all 18 types to every staff member (correct), but for Rani Kamlapati/IISER staff — who have zero vehicles assigned per MULTI_CENTRE_SPEC §9 — selecting any type will show an **empty Vehicle Number dropdown with no explanation**, the instant Step 1 ships. MULTI_CENTRE_SPEC §3.5 names a friendly message as the intended mitigation but doesn't assign it a phase. Since this is an immediate, unavoidable, confusing-looking consequence of Step 1 (not something that can wait for Phase 6's Vehicle Master), this spec includes the minimal one-line message in Step 4c. Flagged, not silently assumed.
4. **Side effect: search/reminders/bell become centre-scoped for staff for free.** `loadBookings`, `handleSearch`, and `checkApproachingReturns` all read from `bookings` via the shared `supabase` client with no app-level centre filter today. Once Step 1's `bookings` `SELECT` policy is live, every one of those queries is transparently filtered to the logged-in staff member's own centre **by the database**, with zero code changes. This is a real, correct, and desirable outcome — but it is a side effect of RLS, not an implementation of MULTI_CENTRE_SPEC §7.1's UI requirements (e.g. it does nothing for the super-admin "All Centres" + Centre column view, or centre-labelled bell entries). Do not treat this as Phase 5 having been completed.

### Canonical policy SQL (used identically in Step 1a and Step 1b)

```sql
-- ── bookings ─────────────────────────────────────────────
alter table public.bookings enable row level security;

create policy bookings_select_own_centre on public.bookings
for select to authenticated
using (public.is_super_admin() or centre_id = public.get_my_centre_id());

create policy bookings_insert_own_centre on public.bookings
for insert to authenticated
with check (public.is_super_admin() or centre_id = public.get_my_centre_id());

create policy bookings_update_own_centre on public.bookings
for update to authenticated
using (public.is_super_admin() or centre_id = public.get_my_centre_id())
with check (public.is_super_admin() or centre_id = public.get_my_centre_id());

create policy bookings_delete_super_admin_only on public.bookings
for delete to authenticated
using (public.is_super_admin());

-- ── customers ────────────────────────────────────────────
alter table public.customers enable row level security;

create policy customers_select_own_centre on public.customers
for select to authenticated
using (public.is_super_admin() or centre_id = public.get_my_centre_id());

create policy customers_insert_own_centre on public.customers
for insert to authenticated
with check (public.is_super_admin() or centre_id = public.get_my_centre_id());

create policy customers_update_own_centre on public.customers
for update to authenticated
using (public.is_super_admin() or centre_id = public.get_my_centre_id())
with check (public.is_super_admin() or centre_id = public.get_my_centre_id());

create policy customers_delete_super_admin_only on public.customers
for delete to authenticated
using (public.is_super_admin());

-- ── vehicles ─────────────────────────────────────────────
alter table public.vehicles enable row level security;

create policy vehicles_select_own_centre on public.vehicles
for select to authenticated
using (public.is_super_admin() or centre_id = public.get_my_centre_id());

create policy vehicles_insert_super_admin_only on public.vehicles
for insert to authenticated
with check (public.is_super_admin());

create policy vehicles_update_super_admin_only on public.vehicles
for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy vehicles_delete_super_admin_only on public.vehicles
for delete to authenticated
using (public.is_super_admin());

-- ── vehicle_types (no centre filter — shared reference data) ─
alter table public.vehicle_types enable row level security;

create policy vehicle_types_select_all_authenticated on public.vehicle_types
for select to authenticated
using (true);

create policy vehicle_types_insert_super_admin_only on public.vehicle_types
for insert to authenticated
with check (public.is_super_admin());

create policy vehicle_types_update_super_admin_only on public.vehicle_types
for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy vehicle_types_delete_super_admin_only on public.vehicle_types
for delete to authenticated
using (public.is_super_admin());

-- ── centres (all authenticated can read, for the dropdown) ───
alter table public.centres enable row level security;

create policy centres_select_all_authenticated on public.centres
for select to authenticated
using (true);

create policy centres_insert_super_admin_only on public.centres
for insert to authenticated
with check (public.is_super_admin());

create policy centres_update_super_admin_only on public.centres
for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy centres_delete_super_admin_only on public.centres
for delete to authenticated
using (public.is_super_admin());

-- ── profiles ─────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy profiles_select_own_or_super_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_super_admin());

-- Deliberately no insert/update/delete policy at all. With RLS enabled and zero
-- write policies, every write attempt through PostgREST (anon or authenticated)
-- is rejected by default-deny. The service-role key used by the Supabase MCP /
-- Dashboard bypasses RLS entirely, so admin edits to profiles remain possible
-- that way only — matching "no role edits via app" (MULTI_CENTRE_SPEC §5) and
-- "managed only via SQL/service role" from the task brief.
```

No policy targets the `anon` role on any of the six tables. With RLS enabled and no matching policy, Postgres denies access outright — this is what "no anonymous access" means in practice; there is nothing further to write.

### Step 1a — Dry-run validation (transaction, rolled back, no production impact)

Requires its own explicit go-ahead like every other step, even though nothing persists.

```sql
begin;

-- (paste the full canonical policy SQL block above here)

-- fetch the 4 real UUIDs to drive the simulation
select id, email from auth.users
where email in (
  'admin@banjararide.com', 'sonagiri@banjararide.com',
  'ranikamlapati@banjararide.com', 'iiser@banjararide.com'
)
order by email;

-- ── simulate sonagiri@ ──
set local role authenticated;
set local request.jwt.claims = '{"sub": "<sonagiri-uuid>"}';
select count(*) from bookings;                                   -- expect: only Sonagiri rows
select count(*) from bookings where centre_id <> (select id from centres where name = 'Sonagiri');  -- expect: 0
select count(*) from vehicles;                                   -- expect: 52 (all Sonagiri's)
select count(*) from vehicle_types;                               -- expect: 18 (shared, unfiltered)
select count(*) from centres;                                     -- expect: 3 (shared, unfiltered)
select count(*) from profiles;                                    -- expect: 1 (own row only)
-- attempt a cross-centre insert — expect this to raise a row-level security policy violation
insert into bookings (id, mobile, customer_name, booking_date, booking_time, booking_type, centre, centre_id, vehicle, vehicle_number, status)
values (999999901, '9999999901', 'RLS TEST', '2026-07-12', '12:00 PM', '1 Day', 'IISER Bhouri', (select id from centres where name = 'IISER Bhouri'), 'Activa 6G', 'TESTREG', 'start');

reset role;

-- repeat the block above for ranikamlapati-uuid and iiser-uuid, each expecting
-- their own centre's counts and a rejected cross-centre insert

-- ── simulate admin@ (super_admin) ──
set local role authenticated;
set local request.jwt.claims = '{"sub": "<admin-uuid>"}';
select count(*) from bookings;   -- expect: all rows, all centres
select count(*) from profiles;   -- expect: 4 (all rows)
-- cross-centre insert should succeed for super_admin — verify, then note it will
-- need to be cleaned up before rollback (rollback handles this automatically)
insert into bookings (id, mobile, customer_name, booking_date, booking_time, booking_type, centre, centre_id, vehicle, vehicle_number, status)
values (999999902, '9999999902', 'RLS TEST ADMIN', '2026-07-12', '12:00 PM', '1 Day', 'IISER Bhouri', (select id from centres where name = 'IISER Bhouri'), 'Activa 6G', 'TESTREG', 'start');

reset role;

-- ── simulate anon ──
set local role anon;
select count(*) from bookings;    -- expect: permission denied / 0 (policy denies, no anon policy exists)
select count(*) from centres;     -- expect: permission denied
reset role;

rollback;   -- undo everything above, including the enable-RLS/create-policy statements — production untouched
```

Report every count/error back to the owner before proceeding. If any result doesn't match the expected outcome, stop — do not proceed to Steps 2–4 or the real Step 1b until the policy SQL is corrected and re-validated.

### Step 1b — Real cutover (only as part of the atomic deployment in §5)

Run the exact same canonical policy SQL block from above, **without** wrapping it in `begin ... rollback`. This is a live commit. Do not run this until:
- Steps 2–4 (code) are built,
- Local testing (part of Step 5) has passed,
- `npm run build` is clean,
- the owner has given the final, separate go-ahead for the cutover (§9 Human Gate),
- and the implementer is ready to immediately follow with the `git push` in Step 5.

---

## 7. Phase 4 — Login UI (code)

### Step 2 — Create `src/pages/Login.js`

New file. Email + password fields, `supabase.auth.signInWithPassword`, inline error display. No manual redirect on success — `App.js`'s `onAuthStateChange` listener (Step 3) detects the new session and swaps the view; `Login.js` itself does not need to know what renders next.

Intended content:

```jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError('Login failed: ' + error.message);
  }

  return (
    <div className="br-page br-login-page">
      <form onSubmit={handleSubmit} className="br-form-card br-login-card">
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1a56a0', marginBottom: '4px' }}>Banjara Ride</h1>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>Sign in to continue</p>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>Email</label>
            <input
              type="email" name="email" autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)}
              style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%' }}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>Password</label>
            <input
              type="password" name="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%' }}
              required
            />
          </div>
          <button type="submit" disabled={loading}
            style={{ background: '#1a56a0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

Flagged decision: this form deliberately does **not** set `autoComplete="off"` (unlike the booking form). The booking form's `autoComplete="off"` exists to stop the browser guessing customer PII into unrelated fields — it is not a blanket "never autofill anything in this app" rule. Since each centre uses one shared login repeatedly, letting the browser/PWA remember the centre's password is a genuine convenience, not a risk beyond what the shared-login model already accepts (MULTI_CENTRE_SPEC §2). `name="email"`/`autoComplete="username"` and `name="password"`/`autoComplete="current-password"` are the standard attributes browsers use to offer to save/fill credentials. Confirm before running — if the owner prefers no browser-saved passwords, drop the two `autoComplete` attributes.

Add to `src/index.css` (do not inline these — extends the existing convention):

```css
.br-login-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.br-login-card { width: 100%; max-width: 360px; }
```

### Step 3 — `src/App.js`: session routing

Replace the entire file. Intended content:

```jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './pages/Login';
import BookingSheet from './pages/BookingSheet';

function App() {
  const [authStatus, setAuthStatus] = useState('loading'); // 'loading' | 'signedOut' | 'signedIn'
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthStatus(session ? 'signedIn' : 'signedOut');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthStatus(newSession ? 'signedIn' : 'signedOut');
      if (!newSession) { setProfile(null); setProfileError(''); }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authStatus !== 'signedIn' || !session) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*, centres(name)')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setProfileError('No profile is configured for this account. Contact the admin.');
          setProfile(null);
        } else {
          setProfile(data);
          setProfileError('');
        }
      });
    return () => { cancelled = true; };
  }, [authStatus, session]);

  if (authStatus === 'loading') return null;
  if (authStatus === 'signedOut') return <Login />;

  if (profileError) {
    return (
      <div className="br-page" style={{ textAlign: 'center', marginTop: '80px' }}>
        <p style={{ color: '#991b1b' }}>{profileError}</p>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: '16px', padding: '8px 16px' }}>Log out</button>
      </div>
    );
  }

  if (!profile) return null; // brief flash while the profile row loads, acceptable

  return <BookingSheet session={session} profile={profile} />;
}

export default App;
```

Notes:
- The profile fetch uses `select('*, centres(name)')` — an embedded join — so `profile.centres.name` is available for staff without needing `BookingSheet.js`'s own `centreIdByName` map to have finished loading first (there's no shared-timing dependency between App.js's profile fetch and BookingSheet's own `loadVehiclesAndCentres`).
- `profileError` state covers the edge case of an `auth.users` row with no matching `profiles` row (shouldn't happen with the 4 known accounts, but fails loudly instead of rendering a broken `BookingSheet` if it ever does — e.g. a 5th account created later without a profile).
- React 18 `StrictMode` (already wrapping `<App/>` in `index.js`) double-invokes effects in dev only; the `subscription.unsubscribe()` cleanup in the returned function handles this correctly — no change needed to `index.js` itself. Confirm this after building, don't assume.

### Step 4 — `src/pages/BookingSheet.js` changes

**4a. Accept `session`/`profile` as props, do not re-fetch.**
- Signature becomes `export default function BookingSheet({ session, profile })` (currently line 73, no props).
- Add near the top of the function body: `const isStaff = profile.role === 'staff';` and `const staffCentreName = profile.centres ? profile.centres.name : '';`.

**4b. Header — logout + identity display.**
Inside the `<div className="br-header">` block (currently lines 484–548), add a right-aligned block showing `profile.display_name` and, for staff, `staffCentreName` (for super_admin, a static "All Centres" label — the functional switcher itself is Phase 5), plus a **Logout** button calling `supabase.auth.signOut()`. No local state change is needed after calling it — `App.js`'s `onAuthStateChange` listener detects `SIGNED_OUT` and swaps back to `Login` automatically.

**4c. Centre lock for staff.**
- Add a `useEffect` (near the other effects, after line 126) that runs once `isStaff` and `staffCentreName` are available and pre-fills `form.centre` if it is currently empty — covers the very first render, since `useState(emptyForm)` (line 74) can't reference `profile` at initialisation time.
- At the three places the code currently resets to a fresh form —
  - line 395 (`setForm({ ...emptyForm, bookingDate: getToday(), bookingTime: getCurrentTime12hr() });`, inside `handleSubmit`'s update branch),
  - line 407 (same pattern, insert branch),
  - line 541 (`+ New Booking` toggle handler) —
  add `centre: isStaff ? staffCentreName : ''` to each spread, e.g.:
  ```js
  setForm({ ...emptyForm, bookingDate: getToday(), bookingTime: getCurrentTime12hr(), centre: isStaff ? staffCentreName : '' });
  ```
- On the Centre `<select>` itself (lines 600–605), add `disabled={isStaff}`. The already-selected value (from the pre-fill above, or from `formFromBooking`'s `centre: b.centre || ''` at line 286 when editing) continues to display correctly under `disabled` — no other change needed there.
- This is a UX convenience only. The real boundary is Step 1's `with check` clause on `bookings`/`customers` `INSERT`/`UPDATE` — even if this UI lock were bypassed or buggy, the database rejects any centre mismatch. Do not treat the disabled dropdown as the security control.
- For `super_admin`, no change to the Centre `<select>` — it stays exactly as it is today, fully interactive, populated from `centreOptions` (`src/data/options.js`, unchanged).

**4d. Vehicle Number empty-state message (flagged addition, §6 decision 3).**
Near the Vehicle Number field (lines 627–632), when `selectedVehicle` is truthy and `selectedVehicle.registrations.length === 0`, render a short inline message below the field, e.g. `"No vehicles of this type are assigned to your centre yet — contact admin."`, using the existing `Field`/styling conventions already in the file (no new component library, plain conditional JSX consistent with the rest of the form).

**4e. Validation at line 337–340.**
No functional change required — for staff, `form.centre` is now always pre-filled by 4c before submission is possible; for super_admin, behaviour is unchanged. Leave the existing check in place as a safety net.

---

## 8. Exit Criteria (reviewer checklist, verify via Supabase MCP + manual walkthrough)

**RLS (Phase 3):**
- [ ] RLS is enabled (`relrowsecurity = true`) on all six tables: `bookings`, `customers`, `vehicles`, `vehicle_types`, `centres`, `profiles`.
- [ ] Policy set on each table matches §6's canonical SQL exactly (verify via `pg_policies`).
- [ ] Step 1a's dry-run simulation was executed and its results reported and confirmed correct for all 4 real logins + anon, before Step 1b ran for real.
- [ ] Staff (`sonagiri@`, `ranikamlapati@`, `iiser@`) can `SELECT`/`INSERT`/`UPDATE` only their own centre's `bookings`/`customers` rows; cross-centre attempts are rejected; none can `DELETE` any row.
- [ ] `admin@` (`super_admin`) can `SELECT`/`INSERT`/`UPDATE`/`DELETE` across all centres, on `bookings`, `customers`; can write to `vehicles`, `vehicle_types`, `centres`; can `SELECT` all `profiles` rows.
- [ ] Every staff account sees all 18 `vehicle_types` (unfiltered) and only their own centre's `vehicles` registrations (0 for Rani Kamlapati/IISER, 52 for Sonagiri).
- [ ] `centres` is fully readable by all 4 accounts; only `admin@` can write to it.
- [ ] Each staff account can `SELECT` only their own `profiles` row; `admin@` sees all 4; no account can `INSERT`/`UPDATE`/`DELETE` any `profiles` row through the API (only via Supabase MCP/Dashboard service role).
- [ ] Anon key is fully blocked on all six tables (verified against real production database, not just assumed from the SQL).
- [ ] No unrelated schema/data changes — row counts and structure on all six tables identical to the Phase 1/2 exit state, aside from RLS itself.

**Login UI (Phase 4):**
- [ ] `src/pages/Login.js` exists; sign-in works for all 4 accounts; a wrong password shows a visible inline error and does not crash.
- [ ] `src/App.js` shows `Login` with no session, `BookingSheet` with a session + valid profile, and a clear error state (not a crash or blank page) if a session exists but its `profiles` row is missing.
- [ ] Session persists across a page refresh and across a full browser close/reopen (Supabase JS default `localStorage` persistence) for all 4 accounts.
- [ ] Logout button in `BookingSheet.js` header signs out and returns to `Login` without a manual page reload.
- [ ] For each staff account: Centre dropdown is pre-filled with their own centre and disabled/locked on both New Booking and Edit; a booking saved by that account has `centre_id` matching their `profiles.centre_id` (re-confirms the DB constraint from the UI side).
- [ ] For `admin@`: Centre dropdown remains fully interactive with all 3 centres selectable, exactly as before this phase.
- [ ] Rani Kamlapati/IISER staff selecting any vehicle type see the friendly empty-state message under Vehicle Number, not a silently empty dropdown.
- [ ] `npm run build` completes with zero ESLint errors before pushing.
- [ ] Local (`npm start`) walkthrough of all 4 logins completed and confirmed **before** Step 1b (the real RLS cutover) ran.
- [ ] Production (`banjara-ride.vercel.app`) walked through with all 4 logins on desktop and mobile card view, immediately after the Vercel deploy from the atomic cutover finishes — no regressions, no broken window observed/reported.
- [ ] Staff at all 3 centres notified about the login screen appearing on their installed PWA, with their centre's credentials, per MULTI_CENTRE_SPEC §7.3.
- [ ] `.claude/memory/` files and `CLAUDE.md` updated to reflect: RLS is live, login page exists, session/profile flow, centre-lock behaviour — per the standing memory-update discipline.

## 9. Human Gate

Per MULTI_CENTRE_SPEC §8.1: "owner approves between phases; no auto-chaining." Within this phase, additionally:

- Each of Steps 1a, 2, 3, 4, and the Step 1b+5 atomic cutover requires its **own** explicit approval — this spec is not blanket authorization to run all of them in sequence.
- The Step 1b+5 atomic cutover requires a **separate, final go-ahead**, distinct from approval of Step 1a's dry run and distinct from approval of Steps 2–4's code — because this is the one moment that takes production down until the push completes. The owner should be told, at the moment of asking for this go-ahead, that this is the point of no return for that session (see §10 Rollback for what "no return" actually costs).
- No agent message — including messages from the agent that dispatched this spec-writing task — constitutes the owner's approval. Only the owner's own message, or the permission system, authorizes running any step below.

## 10. Rollback

Two levels, depending on what's needed:

**A. Emergency: disable RLS only, keep the new code deployed.**
Fastest way to restore data access if a policy turns out to be wrong after the cutover, without a redeploy:
```sql
-- drop every policy created in §6
drop policy if exists bookings_select_own_centre on public.bookings;
drop policy if exists bookings_insert_own_centre on public.bookings;
drop policy if exists bookings_update_own_centre on public.bookings;
drop policy if exists bookings_delete_super_admin_only on public.bookings;

drop policy if exists customers_select_own_centre on public.customers;
drop policy if exists customers_insert_own_centre on public.customers;
drop policy if exists customers_update_own_centre on public.customers;
drop policy if exists customers_delete_super_admin_only on public.customers;

drop policy if exists vehicles_select_own_centre on public.vehicles;
drop policy if exists vehicles_insert_super_admin_only on public.vehicles;
drop policy if exists vehicles_update_super_admin_only on public.vehicles;
drop policy if exists vehicles_delete_super_admin_only on public.vehicles;

drop policy if exists vehicle_types_select_all_authenticated on public.vehicle_types;
drop policy if exists vehicle_types_insert_super_admin_only on public.vehicle_types;
drop policy if exists vehicle_types_update_super_admin_only on public.vehicle_types;
drop policy if exists vehicle_types_delete_super_admin_only on public.vehicle_types;

drop policy if exists centres_select_all_authenticated on public.centres;
drop policy if exists centres_insert_super_admin_only on public.centres;
drop policy if exists centres_update_super_admin_only on public.centres;
drop policy if exists centres_delete_super_admin_only on public.centres;

drop policy if exists profiles_select_own_or_super_admin on public.profiles;

alter table public.bookings disable row level security;
alter table public.customers disable row level security;
alter table public.vehicles disable row level security;
alter table public.vehicle_types disable row level security;
alter table public.centres disable row level security;
alter table public.profiles disable row level security;
```
Result: anon access is fully restored (tables open again, matching the Phase 1/2 exit state), but the login code is still deployed and live — staff will still see a login screen and must still sign in (harmless, since Supabase Auth itself is untouched by this), but once signed in they'll have unrestricted access to all centres' data again, same as an unauthenticated anon request would if it bypassed the UI. This is a stopgap, not a return to the pre-Phase-3/4 state — use it only to stop active data-access errors while a fix is prepared, not as a resting state.

**B. Full rollback: restore exactly the Phase 1/2 exit state.**
1. Run all of section A above (drop policies, disable RLS).
2. `git revert` the commit(s) from Step 5's push, and push that revert to `main` (triggers a Vercel redeploy of the pre-Phase-3/4 code — no login, direct `BookingSheet`, exactly as before this phase).
3. Confirm the reverted deploy loads with no login prompt and works exactly as it did at the end of Phase 2.

In both cases: stop, do not attempt a fix-forward without the owner's sign-off, and report exactly which check/step failed and the error returned. Since RLS changes are non-destructive to data (no rows are altered or deleted by anything in this spec), there is no data-loss scenario to recover from here — only an access-control state to correct.
