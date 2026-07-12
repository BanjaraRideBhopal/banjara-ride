---
name: Supabase Setup
description: Supabase project credentials, table structure, and integration details
type: project
---

## Credentials
- Project URL: https://bmjminovnhhbrthuqgkt.supabase.co
- Anon key stored in: src/supabaseClient.js
- Client imported as: `import { supabase } from '../supabaseClient'`

## Tables

### customers
- `mobile` TEXT — PRIMARY KEY
- `name` TEXT
- `created_at` TIMESTAMP

### bookings
- `id` BIGINT — PRIMARY KEY (uses Date.now())
- `mobile` TEXT — FK → customers.mobile
- `customer_name` TEXT
- `booking_date`, `booking_time`, `booking_type`, `num_days`, `num_weeks`
- `expected_return`, `vehicle`, `vehicle_number`, `helmet`, `start_km`
- `rent_amount`, `old_deposit`, `delivery_charges`, `full_amount_received`, `cash`
- `mode_of_payment`, `pay_via`, `credit_to`, `remarks`
- `status` TEXT — 'start' or 'end'
- `actual_return`, `end_km`, `km_driven`, `helmet_returned`
- `extra_hours`, `extra_charge`, `final_rent`
- `deduction`, `reason_for_deduction`, `damaged_fine`
- `refund_amount`, `refund_status`, `refund_by`
- `created_at` TIMESTAMP

## Key Behaviours
- On app load: fetches today's bookings (filtered by booking_date)
- Mobile number lookup: typing 10 digits auto-fills customer name if they exist in customers table
- Save Booking: upserts customer → inserts booking
- Close Booking: updates existing booking row with return details
- customer_name is stored directly in bookings table (avoids joins)

**How to apply:** Always use snake_case field names when reading from DB (e.g. b.booking_date, b.vehicle_number). camelCase is only used in local form state.
