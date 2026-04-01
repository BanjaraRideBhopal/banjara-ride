import { bookingTypeHours } from '../data/options';

// Get current time in 12hr format HH:MM AM/PM
export function getCurrentTime12hr() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
}

// Convert 12hr time string to 24hr for calculations
export function to24hr(time12) {
  if (!time12) return '';
  const [time, period] = time12.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'AM' && hours === 12) hours = 0;
  if (period === 'PM' && hours !== 12) hours += 12;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Convert 24hr to 12hr format
export function to12hr(time24) {
  if (!time24) return '';
  let [hours, minutes] = time24.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Calculate expected return datetime
export function calculateReturnDateTime(date, time12, bookingType, numDays, numWeeks) {
  if (!date || !time12 || !bookingType) return '';

  const time24 = to24hr(time12);
  const start = new Date(`${date}T${time24}`);
  if (isNaN(start.getTime())) return '';

  let hoursToAdd = 0;

  if (bookingType === 'Day' && numDays) {
    hoursToAdd = parseFloat(numDays) * 24;
  } else if (bookingType === 'Week' && numWeeks) {
    hoursToAdd = parseFloat(numWeeks) * 168;
  } else if (bookingType === 'Month') {
    hoursToAdd = 720; // 30 days
  } else {
    hoursToAdd = bookingTypeHours[bookingType] || 0;
  }

  if (!hoursToAdd) return '';

  const returnDate = new Date(start.getTime() + hoursToAdd * 60 * 60 * 1000);

  const retDate = returnDate.toISOString().split('T')[0];
  const retTime = to12hr(returnDate.toTimeString().slice(0, 5));

  return `${retDate} ${retTime}`;
}

// Calculate duration in hours
export function calculateDuration(date, time12, returnDateTimeStr) {
  if (!date || !time12 || !returnDateTimeStr) return 0;
  const time24 = to24hr(time12);
  const start = new Date(`${date}T${time24}`);
  const [retDate, retTime, retPeriod] = returnDateTimeStr.split(' ');
  const retTime24 = to24hr(`${retTime} ${retPeriod}`);
  const end = new Date(`${retDate}T${retTime24}`);
  const diffHours = (end - start) / (1000 * 60 * 60);
  return Math.max(0, parseFloat(diffHours.toFixed(2)));
}

// Calculate rent amount with late charge logic
export function calculateRentAmount(vehicle, bookingType, actualDurationHours, numDays, numWeeks) {
  if (!vehicle || !bookingType) return 0;

  const baseRate = vehicle.rates[bookingType];
  let bookedHours = bookingTypeHours[bookingType] || 0;

  if (bookingType === 'Day' && numDays) bookedHours = parseFloat(numDays) * 24;
  if (bookingType === 'Week' && numWeeks) bookedHours = parseFloat(numWeeks) * 168;

  if (!baseRate) return 0;
  if (actualDurationHours <= bookedHours) return baseRate;

  const extraHours = Math.ceil(actualDurationHours - bookedHours);
  return baseRate + extraHours * vehicle.lateChargePerHour;
}

// Calculate refund amount
export function calculateRefundAmount(fullAmountReceived, oldDeposit, deliveryCharges, deduction, rentAmount) {
  const full = parseFloat(fullAmountReceived) || 0;
  const old = parseFloat(oldDeposit) || 0;
  const delivery = parseFloat(deliveryCharges) || 0;
  const ded = parseFloat(deduction) || 0;
  const rent = parseFloat(rentAmount) || 0;
  return full + old - delivery - ded - rent;
}

// Calculate KM driven
export function calculateKmDriven(startKm, endKm) {
  const start = parseFloat(startKm);
  const end = parseFloat(endKm);
  if (isNaN(start) || isNaN(end) || end < start) return '';
  return parseFloat((end - start).toFixed(1));
}