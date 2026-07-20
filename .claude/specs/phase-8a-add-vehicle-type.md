Status: COMPLETE — implemented and live as of 2026-07-21

---

# Phase 8a — Add New Vehicle Type from Vehicle Master

## 1. Goal

When adding a new vehicle registration in Vehicle Master, allow the admin to also create a brand-new vehicle type inline — without needing to seed it separately in Supabase. The existing "select from existing type" flow is unchanged; this adds a second path.

---

## 2. What changes

### Vehicle Type field in Add Vehicle form

Add an option at the top of the Vehicle Type dropdown:

```
[ Select... ]
[ + Add new type... ]   ← new
[ Activa 5G ]
[ Activa 6G ]
...
```

When "+ Add new type..." is selected, the form expands to show a **New Vehicle Type** sub-section below the three existing fields. The vehicle type sub-section contains:

| Field | Type | Rule |
|---|---|---|
| Type Name * | Text | Required. e.g. "Pulsar NS 125" |
| Security Deposit ₹ * | Number | Required. |
| Late Charge / Hr ₹ * | Number | Required. |
| Rate — 3 Hr ₹ | Number | Required. |
| Rate — 6 Hr ₹ | Number | Required. |
| Rate — 12 Hr ₹ | Number | Required. |
| Rate — 1 Day ₹ | Number | Required. |
| Rate — 2 Days ₹ | Number | Required. |
| Rate — 3 Days ₹ | Number | Required. |
| Rate — 4 Days ₹ | Number | Required. |
| Rate — 5 Days ₹ | Number | Required. |
| Rate — 6 Days ₹ | Number | Required. |
| Rate — 7 Days ₹ | Number | Required. |
| Rate — 15 Days ₹ | Number | Required. |
| Rate — 1 Month ₹ | Number | Required. |
| Rate — 3 Months ₹ | Number | Required. |

Rate fields use a `br-grid-4` layout. All 13 rates are required — a vehicle type must have a complete rate card. Values save as integers in DB.

### Save behaviour

When the Vehicle Type dropdown shows "+ Add new type..." and the sub-section is visible:
1. Validate: Registration Number, Group, Type Name, Security Deposit, Late Charge/Hr all filled.
2. Insert new row into `vehicle_types` — get back the new `id`.
3. Insert new row into `vehicles` using the new `vehicle_type_id`.
4. Reload data; close form.

If the vehicle_type insert fails (e.g. duplicate name), show the error — do NOT insert the vehicle.

### Switching back

If admin selects an existing type after having selected "+ Add new type...", the sub-section collapses and its fields are cleared.

---

## 3. DB changes

None — `vehicle_types` table already has all needed columns. Insert uses existing columns.

---

## 4. Files changed

| File | Change |
|---|---|
| `src/pages/VehicleMaster.js` | `addForm` state: add `isNewType` boolean + 16 new-type fields. Handle "+ Add new type..." selection. Expand sub-section conditionally. `saveAdd`: two-step insert when `isNewType`. |

---

## 5. Exit criteria

- [x] "+ Add new type..." option appears at top of Vehicle Type dropdown in Add Vehicle form
- [x] Selecting it expands a New Vehicle Type sub-section with all 16 fields
- [x] Selecting an existing type after "+ Add new type..." collapses sub-section and clears its fields
- [x] Save with new type: inserts vehicle_type first, then vehicle; both appear in list after reload
- [x] Validation error shown if Type Name, Security Deposit, Late Charge/Hr, or any of the 13 rate fields is missing
- [x] Existing "select existing type" flow unchanged
- [x] `npm run build` passes with no warnings
