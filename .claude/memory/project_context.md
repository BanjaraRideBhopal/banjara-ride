---
name: banjara-ride-project-context
description: "Core business context, tech stack, and current build status — updated 2026-07-09"
metadata: 
  node_type: memory
  type: project
  originSessionId: 19d5c8a1-c885-4a13-a043-829744e75788
---

Banjara Ride is a vehicle + electronics/furniture rental business in Bhopal, Madhya Pradesh, India (Est. 2017). This app replaces their existing Google Sheets workflow.

**Why:** Staff needed a custom web app usable on desktop and mobile browsers by multiple simultaneous users.

**Tech Stack:** React (Create React App), Supabase (PostgreSQL). GitHub: BanjaraRideBhopal/banjara-ride (public). Deployed on Vercel: https://banjara-ride.vercel.app — auto-deploys on every push to main.

**Current Stage:** Daily Booking Sheet is live with mobile-responsive UI and PWA support. All 18 vehicles with real rates. Actively used by team across 3 centres. Staff can install the app on their phone home screen via browser "Add to Home Screen".

**Key Files:**
- src/data/vehicles.js — All 18 vehicle types, registrations, rate groups
- src/data/options.js — All dropdown options (booking types, centres, staff, payment modes)
- src/utils/calculations.js — Auto-calculation logic (return datetime, rent, KM)
- src/pages/BookingSheet.js — Main booking form, table, date filter, search
- src/supabaseClient.js — Supabase client

**3 Operating Centres:** Sonagiri, Rani Kamlapati Station, IISER Bhouri

**How to apply:** Frontend-only (no backend), React-based. Always run `npm run build` before pushing — Vercel treats ESLint warnings as errors and will fail the deploy.
