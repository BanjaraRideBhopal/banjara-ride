# Banjara Ride — Project Context for Claude

> **Multi-centre build in progress.** See `MULTI_CENTRE_SPEC.md` (repo root) for the full architecture, data model, RLS rules, and phase plan. That file is the source of truth for all multi-centre work — this CLAUDE.md covers the base app.

## About the Business
- Company: Banjara Ride, Bhopal, Madhya Pradesh, India
- Est. 2017
- Rental business: Vehicles (bikes/scooters), Electronics, Furniture, Appliances
- Replacing Google Sheets with this custom app
- Users: Office staff and manager (multiple simultaneous users)
- Access: Web browser (desktop + mobile), installable as PWA

## Tech Stack
- Frontend: React (create-react-app)
- Database: Supabase (PostgreSQL) — URL: https://bmjminovnhhbrthuqgkt.supabase.co
- GitHub: github.com/BanjaraRideBhopal/banjara-ride (public)
- Deployed: https://banjara-ride.vercel.app (Vercel, auto-deploys on push to main)
- No backend — frontend only
- Always run `npm run build` before pushing — Vercel treats ESLint warnings as build errors

## Current Build Status
- Daily Booking Sheet — live, mobile-responsive, PWA-installable
- Folder structure: src/components, src/pages, src/data, src/utils

## Key Files
- src/data/vehicles.js — All 18 vehicle types with rate groups and registration numbers
- src/data/options.js — All dropdown options including booking types and payment options
- src/utils/calculations.js — Auto-calculation logic (return datetime, rent, KM)
- src/pages/BookingSheet.js — Main booking form, table, filter, search, reminders, bell
- src/supabaseClient.js — Supabase client setup
- src/index.css — Responsive CSS classes (br-grid-N, br-page, br-header, br-form-card, br-filter, desktop-table, mobile-cards)
- public/manifest.json — PWA manifest
- public/service-worker.js — Network-first service worker (skips supabase.co calls)

## Supabase Tables
### customers
- mobile (PK), name, created_at

### bookings
- id, mobile, customer_name, booking_date, booking_time, booking_type, centre,
  expected_return, vehicle, vehicle_number, helmet, start_km, rent_amount,
  delivery_charges, full_amount_received, cash, paid_to, mode_of_payment, credit_to,
  remarks, status ('start'/'end'), actual_return, end_km, km_driven, helmet_returned,
  extra_hours, extra_charge, final_rent, deduction, reason_for_deduction, damaged_fine,
  refund_amount, refund_status, refund_by, created_at

## Vehicles (18 types, 9 rate groups)
Rate groups (deposit / late charge):
- Lectrix EV: ₹800 deposit, ₹65/hr — no 3Hr option
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
- Lectrix EV: 3 Hr option hidden (not available for that vehicle)
- Form fields: Booking Date, Booking Time (3 dropdowns: hr/min/AM-PM), Centre, Vehicle, Vehicle Number,
  Booking Duration, Expected Return DateTime (auto), Helmet Given, Start KM,
  Mobile Number (auto-fills Customer Name for returning customers), Customer Name,
  Estimated Rent (auto, read-only), Security Deposit (auto, read-only),
  Delivery Charges, Full Amount Received (auto = Rent + Deposit + Delivery),
  Mode of Payment (Cash/UPI/App Payment), Cash ₹,
  Paid To (shows only when Cash > 0 — options: Lokendra/Rizwan/Manish/Guard/Nazim/Banjara Ride),
  Credit To (shows only when Mode = UPI or App Payment),
  Remarks
- Status set to 'start' on save

### Phase 2 — Close Booking (vehicle returned)
- Triggered by Close button (only on status='start' rows)
- Actual Return Date & Time: date picker + 3 time dropdowns (same pattern as booking time)
- Fields: Helmet Returned, End KM, KM Driven (auto), Extra Hours (manual — staff negotiates),
  Extra Charge (auto = Extra Hours × vehicle.lateChargePerHour), Actual Rent (auto = base + extra),
  Deduction ₹, Reason for Deduction (Damage/Helmet Lost/Challan/Penalty),
  Damage/Fine Description (textarea — only shows when Reason = Damage or Penalty),
  Refund Amount (auto), Refund Status (Processed/Unprocessed), Refund By
- Status set to 'end' on save

## Edit Behaviour
- Edit button always visible on every row
- For status='start': opens initial booking form pre-filled
- For status='end': opens BOTH initial form AND return details form pre-filled

## Auto-Calculations
- Expected Return DateTime: Booking Date + Time + Duration hours (local timezone — use getFullYear/getMonth/getDate, NEVER toISOString)
- Full Amount Received: Rent + Security Deposit + Delivery Charges
- Extra Charge: Extra Hours × vehicle.lateChargePerHour
- Actual Rent: Base Rent + Extra Charge
- Refund Amount: Full Amount Received − Base Rent − Extra Charges − Deduction
- KM Driven: End KM − Start KM

## Payment Rules
- Paid To field: only shows when Cash > 0
- Credit To field: only shows when Mode of Payment is UPI or App Payment
- Form has autoComplete="off" to prevent browser autofill

## Date Filter & Search
- Date filter at top: ‹ › navigation + date picker + Today button. Default = today.
- Search box: searches ALL bookings (all dates) by mobile number or vehicle number (partial match)
- Search and date filter are mutually exclusive

## Return Reminders & Bell Icon
- Checks every 60 seconds for active bookings with expected return ≤ 15 min
- Yellow alert banner appears — has ✕ dismiss button (no Close Now). Dismissed per-booking via ref.
- 🔔 Bell icon in header: red badge count for urgent returns. Click opens dropdown of all active bookings today sorted by expected return time. Overdue = red, due soon = amber.

## Responsive UI & PWA
- CSS classes in src/index.css handle responsive layout (not inline styles)
- Tablet (≤768px): 4/3-col grids → 2-col, header stacks, filter bar stacks
- Phone (≤480px): all grids → 1-col, bookings shown as cards instead of wide table
- Mobile card view: .mobile-cards shown, .desktop-table hidden at ≤768px
- PWA: installable via browser "Add to Home Screen" on Android (Chrome) and iPhone (Safari)

## Development Approach
- Requirements first, then build — step by step, one feature at a time
- Team reviews before building
- Always use local date components (never toISOString) for IST timezone correctness
- When adding new table columns, also update the mobile card view
- New layout sections use className from index.css, not inline style
