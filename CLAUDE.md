# Banjara Ride — Project Context for Claude

## About the Business
- Company: Banjara Ride, Bhopal, Madhya Pradesh, India
- Est. 2017
- Rental business: Vehicles (bikes/scooters), Electronics, Furniture, Appliances
- Replacing Google Sheets with this custom app
- Users: Office staff and manager (multiple simultaneous users)
- Access: Web browser (desktop + mobile)

## Tech Stack
- Frontend: React (create-react-app)
- Database: Supabase (PostgreSQL) — URL: https://bmjminovnhhbrthuqgkt.supabase.co
- GitHub: github.com/BanjaraRideBhopal/banjara-ride (public)
- Deployed: https://banjara-ride.vercel.app (Vercel, auto-deploys on push to main)
- No backend — frontend only

## Current Build Status
- Daily Booking Sheet — live with real vehicle data
- Folder structure: src/components, src/pages, src/data, src/utils

## Key Files
- src/data/vehicles.js — All 18 vehicle types with rate groups and registration numbers
- src/data/options.js — All dropdown options including booking types and payment options
- src/utils/calculations.js — Auto-calculation logic (return datetime, rent, refund, KM)
- src/pages/BookingSheet.js — Main booking form and table
- src/supabaseClient.js — Supabase client setup

## Supabase Tables
- customers: mobile (PK), name
- bookings: id, mobile, customer_name, booking_date, booking_time, booking_type,
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
Each is a fixed option with a fixed rate — no "number of days" picker needed.

## Booking Flow (Two-Phase)
### Phase 1 — Initial Booking (vehicle goes out)
- Form fields: Booking Date, Time, Duration, Vehicle Type, Vehicle Number (dropdown filtered by type),
  Helmet, Start KM, Customer Name, Mobile (auto-fills name for returning customers),
  Estimated Rent (auto), Security Deposit (auto), Delivery Charges, Full Amount Received (auto = Rent + Deposit),
  Mode of Payment (Cash/UPI/App Payment), Cash ₹, Paid To (shows if cash > 0, options: Nazim/Manish),
  Credit To (shows if UPI/App Payment), Remarks
- Status set to 'start' on save

### Phase 2 — Close Booking (vehicle returned)
- Triggered by Close button (only on status='start' rows)
- Fields: Actual Return DateTime, Helmet Returned, End KM, KM Driven (auto),
  Extra Hours, Extra Charge (auto = hours × late charge rate), Actual Rent (auto = base + extra),
  Deduction, Reason for Deduction, Damaged & Fine, Refund Amount (auto), Refund Status, Refund By
- Status set to 'end' on save

## Edit Behaviour
- Edit button always visible on every row
- For status='start': opens initial booking form pre-filled
- For status='end': opens BOTH initial form AND return details form pre-filled

## Auto-Calculations
- Expected Return DateTime: Booking Date + Time + Duration hours (local timezone, not UTC)
- Full Amount Received: Rent + Security Deposit
- Extra Charge: Extra Hours × vehicle.lateChargePerHour
- Actual Rent: Base Rent + Extra Charge
- Refund Amount: Full Amount Received − Delivery Charges − Deduction − Actual Rent
- KM Driven: End KM − Start KM

## Payment Rules
- Paid To field: only shows when Cash > 0
- Credit To field: only shows when Mode of Payment is UPI or App Payment
- Form has autoComplete="off" to prevent browser autofill

## Development Approach
- Requirements first, then build
- Step by step, one feature at a time
- Team reviews before building
- Bookings table loads today's bookings only (filter by booking_date = today)
