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
- GitHub: github.com/BanjaraRideBhopal/banjara-ride (private)
- No backend yet — frontend only for now

## Current Build Status
- Building Daily Booking Sheet (POC with one vehicle — Activa)
- Folder structure: src/components, src/pages, src/data, src/utils

## Key Files
- src/data/vehicles.js — Vehicle master rate card
- src/data/options.js — All dropdown options
- src/utils/calculations.js — Auto-calculation logic
- src/pages/BookingSheet.js — Main booking form and table

## POC Vehicle — Activa
- Registration: MP09AB1234
- 3 Hr: ₹180, 6 Hr: ₹300, 12 Hr: ₹450
- Daily: ₹600, Weekly: ₹1000, Monthly: ₹5000
- Late charge: ₹60/hr, Security deposit: ₹800

## Booking Sheet Columns (v2.0)
All 30 columns documented. Key behaviours:
- Booking Date: Auto today, editable
- Booking Time: Auto current time (12hr AM/PM), editable
- Booking Duration: 3 Hr / 6 Hr / 12 Hr / Day / Week / Month
- Day selected → show Number of Days field
- Week selected → show Number of Weeks field
- Month = fixed 30 days
- Expected Return DateTime: Auto-calculated from Date + Time + Duration
- Vehicle Number: Auto-fills when vehicle selected (dropdown per vehicle type)
- Rent Amount: Auto = Base rate + late charges if exceeded
- Duration: Auto = Return DateTime - Booking DateTime
- Refund Amount: Auto = Full Amount + Old Deposit - Delivery - Deduction - Rent
- KM Driven: Auto = End KM - Start KM
- Repeat User Yearly/Monthly: Checkbox for reporting only

## Development Approach
- Requirements first, then build
- POC with one vehicle, then scale
- Step by step, one feature at a time
- Team reviews specs before building
