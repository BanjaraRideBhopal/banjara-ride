// Shared vendor revenue-share calculation — extracted from VendorPayouts.js (Phase 15)
// so Phase 16 (Accounts.js) can reuse the exact same BJ Earn / Owner Amt formula
// instead of duplicating it a second time.

export function buildCreditByReg(bookings) {
  const creditByReg = {};
  bookings.forEach(b => {
    creditByReg[b.vehicle_number] = (creditByReg[b.vehicle_number] || 0) + (parseFloat(b.final_rent) || 0);
  });
  return creditByReg;
}

export function buildMaintenanceByVehicleId(expenses) {
  const maintenanceByVehicleId = {};
  expenses.forEach(e => {
    maintenanceByVehicleId[e.vehicle_id] = (maintenanceByVehicleId[e.vehicle_id] || 0) + (parseFloat(e.amount) || 0);
  });
  return maintenanceByVehicleId;
}

export function computeVendorRow(vv, creditByReg, maintenanceByVehicleId) {
  const reg = vv.vehicles.registration_number;
  const credit = creditByReg[reg] || 0;
  const gst = credit * 0.06;
  const creditAfterGst = credit - gst;
  const parking = parseFloat(vv.parking_charge) || 0;
  const maintenance = maintenanceByVehicleId[vv.vehicle_id] || 0;
  const amountLeft = creditAfterGst - parking - maintenance;
  const pct = parseFloat(vv.owner_share_pct) || 0;
  const ownerAmt = amountLeft * pct;
  const bjEarn = amountLeft - ownerAmt;
  return { credit, gst, creditAfterGst, parking, maintenance, amountLeft, pct, ownerAmt, bjEarn };
}
