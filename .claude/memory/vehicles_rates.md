---
name: vehicle-rate-card
description: "All 18 vehicle types, registration numbers, rate groups, deposits and late charges"
metadata: 
  node_type: memory
  type: project
  originSessionId: 19d5c8a1-c885-4a13-a043-829744e75788
---

## Rate Groups (from official rate card PDF, 2026-07-09)

All durations: 3 Hr / 6 Hr / 12 Hr / 1 Day / 2 Days / 3 Days / 4 Days / 5 Days / 6 Days / 7 Days / 15 Days / 1 Month / 3 Months

| Rate Group | Deposit | Late Charge | Vehicles |
|---|---|---|---|
| Lectrix EV | ₹800 | ₹65/hr | Lectrix EV (no 3Hr rate) |
| Jupiter BS6 / Activa 6G | ₹800 | ₹65/hr | Jupiter BS6, Activa 6G (23 vehicles) |
| Activa 5G | ₹800 | ₹55/hr | Activa 5G (4 vehicles) |
| StarCityPlus / Delux | ₹800 | ₹55/hr | StarCityPlus, HF Delux (3 vehicles) |
| Dream Yuga / Splendor+ / TVS Sport / Shine BS4 | ₹800 | ₹55/hr | Dream Yuga, Splendor+, TVS Sport, Shine |
| Shine BS6 | ₹800 | ₹65/hr | Shine BS6 (7 vehicles) |
| Gixxer / Honda SP / Pulsar 125 | ₹800 | ₹75/hr | Honda SP (2), Pulsar 125, Gixxer |
| Thunderbird | ₹1000 | ₹110/hr | Thunderbird |
| CB 350 / Hunter 350 / Classic 350 | ₹1500 | ₹120/hr | CB 350, Hunter 350, Classic 350 |

## Registration Numbers by Vehicle Type

- **Lectrix EV:** MP04YH8685
- **Jupiter BS6:** MP04ZD6010
- **Activa 6G (23):** MP04YR5523, MP04ZA9765, MP04ZC1643, MP04UL2618, MP38S6057, MP04ZK7670, MP04ZQ6498, MP04ZU0958, MP04ZW2835, MP04ZW3265, MP04ZW3269, MP04ZW8614, MP04ZY7794, MP04YA1224, MP04YA1027, MP04YA1080, MP04YA1056, MP04YA8780, MP04YB1143, MP04YA9538, MP04YH0480, MP04YF0914, MP04YQ2197
- **Activa 5G (4):** MP04UF4596, MP04UF4729, MP04UE0280, MP04UE0281
- **StarCityPlus:** MP04ZQ9887
- **HF Delux (3):** MP04YR6056, MP04YR5740, MP04YR5653
- **Dream Yuga:** MP04QU5468
- **Splendor+:** MP04QT7794
- **TVS Sport:** MP04ML0524
- **Shine (BS4):** MP04QT6138
- **Shine BS6 (7):** MP04ZF2527, MP04VF2469, MP04ZP3336, MP04VF2334, MP04VD6987, MP04YH2878, MP04YN6919
- **Honda SP (2):** MP04VC9332, MP04YS8465
- **Pulsar 125:** MP04YS5213
- **Gixxer:** MP04QN7669
- **Thunderbird:** MP04QF1727
- **CB 350:** MP04ZU7811
- **Hunter 350:** MP04ZW2275
- **Classic 350:** MP04UM3438

**Important:** Rate keys in vehicles.js must exactly match bookingTypes in options.js. Lectrix EV has no "3 Hr" key — it is excluded from the duration dropdown when Lectrix is selected.
