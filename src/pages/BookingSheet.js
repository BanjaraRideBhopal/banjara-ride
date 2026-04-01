import { useState } from 'react';
import { vehicles } from '../data/vehicles';
import {
  bookingTypes,
  helmetOptions,
  modeOfPaymentOptions,
  payViaOptions,
  refundStatusOptions,
  reasonForDeductionOptions,
  creditToOptions,
  refundByOptions
} from '../data/options';
import {
  getCurrentTime12hr,
  calculateReturnDateTime,
  calculateRentAmount,
  calculateRefundAmount,
  calculateKmDriven
} from '../utils/calculations';

function getToday() {
  return new Date().toISOString().split('T')[0];
}

const emptyForm = {
  bookingDate: getToday(),
  bookingTime: getCurrentTime12hr(),
  bookingType: '',
  numDays: '',
  numWeeks: '',
  expectedReturnDateTime: '',
  vehicle: '',
  vehicleNumber: '',
  helmet: '',
  startKm: '',
  customerName: '',
  mobileNumber: '',
  repeatUserYearly: false,
  repeatUserMonthly: false,
  rentAmount: '',
  oldDeposit: '',
  deliveryCharges: '',
  fullAmountReceived: '',
  cash: '',
  modeOfPayment: '',
  payVia: '',
  creditTo: '',
  remarks: '',
};

const emptyFinal = {
  actualReturnDateTime: '',
  endKm: '',
  kmDriven: '',
  helmetReturned: '',
  extraHours: '',
  extraCharge: '',
  rentAmount: '',
  deduction: '',
  reasonForDeduction: '',
  damagedFine: '',
  refundAmount: '',
  refundStatus: '',
  refundBy: '',
};

export default function BookingSheet() {
  const [form, setForm] = useState(emptyForm);
  const [bookings, setBookings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [returningId, setReturningId] = useState(null);
  const [finalForm, setFinalForm] = useState(emptyFinal);

  const selectedVehicle = vehicles.find(v => v.type === form.vehicle);
  const returningBooking = bookings.find(b => b.id === returningId);

  // autoFillAmount = true only when vehicle/bookingType/numDays/numWeeks changes
  function recalculate(updated, autoFillAmount = false) {
    const returnDT = calculateReturnDateTime(
      updated.bookingDate,
      updated.bookingTime,
      updated.bookingType,
      updated.numDays,
      updated.numWeeks
    );
    updated.expectedReturnDateTime = returnDT;

    if (updated.vehicle && updated.bookingType) {
      const v = vehicles.find(veh => veh.type === updated.vehicle);
      if (v) {
        updated.rentAmount = calculateRentAmount(v, updated.bookingType, 0, updated.numDays, updated.numWeeks);

        if (autoFillAmount) {
          updated.fullAmountReceived = (parseFloat(updated.rentAmount) || 0) + v.securityDeposit;
        }
      }
    }

    return updated;
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    let updated = {
      ...form,
      [name]: type === 'checkbox' ? checked : value,
    };

    if (name === 'vehicle') {
      const v = vehicles.find(v => v.type === value);
      updated.vehicleNumber = v ? v.registrationNumber : '';
    }

    if (name === 'bookingType') {
      updated.numDays = '';
      updated.numWeeks = '';
    }

    const autoFillAmount = ['vehicle', 'bookingType', 'numDays', 'numWeeks'].includes(name);
    updated = recalculate(updated, autoFillAmount);
    setForm(updated);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.customerName || !form.mobileNumber || !form.vehicle) {
      alert('Please fill Customer Name, Mobile Number and Vehicle');
      return;
    }
    setBookings([...bookings, { ...form, id: Date.now(), status: 'start', final: null }]);
    setForm({ ...emptyForm, bookingDate: getToday(), bookingTime: getCurrentTime12hr() });
    setShowForm(false);
  }

  function recalculateFinal(updated, booking) {
    // KM driven
    updated.kmDriven = calculateKmDriven(booking.startKm, updated.endKm);

    // Base rent from booking type (no late charge)
    const v = vehicles.find(veh => veh.type === booking.vehicle);
    const baseRent = v ? calculateRentAmount(v, booking.bookingType, 0, booking.numDays, booking.numWeeks) : 0;

    // Extra charge from extra hours
    const extraHours = parseFloat(updated.extraHours) || 0;
    const lateRate = v ? v.lateChargePerHour : 0;
    updated.extraCharge = extraHours * lateRate;

    // Actual rent = base + extra
    updated.rentAmount = baseRent + updated.extraCharge;

    // Refund
    updated.refundAmount = calculateRefundAmount(
      booking.fullAmountReceived,
      booking.oldDeposit,
      booking.deliveryCharges,
      updated.deduction,
      updated.rentAmount
    );

    return updated;
  }

  function handleFinalChange(e) {
    const { name, value } = e.target;
    let updated = { ...finalForm, [name]: value };
    updated = recalculateFinal(updated, returningBooking);
    setFinalForm(updated);
  }

  function handleFinalSubmit(e) {
    e.preventDefault();
    setBookings(bookings.map(b =>
      b.id === returningId
        ? { ...b, status: 'end', final: { ...finalForm } }
        : b
    ));
    setReturningId(null);
    setFinalForm(emptyFinal);
  }

  function startReturn(booking) {
    setReturningId(booking.id);
    setFinalForm({
      ...emptyFinal,
      actualReturnDateTime: `${getToday()} ${getCurrentTime12hr()}`,
    });
    setShowForm(false);
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a56a0' }}>Banjara Ride</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>Daily Booking Sheet</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setReturningId(null); }} style={btnPrimary}>
          {showForm ? 'Close Form' : '+ New Booking'}
        </button>
      </div>

      {/* INITIAL BOOKING FORM */}
      {showForm && (
        <form onSubmit={handleSubmit} style={formCard}>
          <h2 style={{ marginBottom: '20px', color: '#1a56a0', fontSize: '18px' }}>New Booking</h2>

          <SectionTitle title="Trip Details" />
          <div style={grid(4)}>
            <Field label="Booking Date *">
              <input type="date" name="bookingDate" value={form.bookingDate} onChange={handleChange} style={input} />
            </Field>
            <Field label="Booking Time *">
              <input type="text" name="bookingTime" value={form.bookingTime} onChange={handleChange} style={input} placeholder="HH:MM AM/PM" />
            </Field>
            <Field label="Booking Duration *">
              <select name="bookingType" value={form.bookingType} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {bookingTypes.map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
            {form.bookingType === 'Day' && (
              <Field label="Number of Days">
                <input type="number" name="numDays" value={form.numDays} onChange={handleChange} style={input} placeholder="e.g. 2" min="1" />
              </Field>
            )}
            {form.bookingType === 'Week' && (
              <Field label="Number of Weeks">
                <input type="number" name="numWeeks" value={form.numWeeks} onChange={handleChange} style={input} placeholder="e.g. 2" min="1" />
              </Field>
            )}
          </div>
          <div style={grid(3)}>
            <Field label="Expected Return Date & Time">
              <input type="text" value={form.expectedReturnDateTime} style={{ ...input, background: '#f0f4ff' }} readOnly />
            </Field>
            <Field label="Helmet Given">
              <select name="helmet" value={form.helmet} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {helmetOptions.map(h => <option key={h}>{h}</option>)}
              </select>
            </Field>
          </div>

          <SectionTitle title="Vehicle Details" />
          <div style={grid(3)}>
            <Field label="Vehicle *">
              <select name="vehicle" value={form.vehicle} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {vehicles.map(v => <option key={v.id}>{v.type}</option>)}
              </select>
            </Field>
            <Field label="Vehicle Number">
              <input type="text" value={form.vehicleNumber} style={{ ...input, background: '#f0f4ff' }} readOnly />
            </Field>
            <Field label="Start KM">
              <input type="number" name="startKm" value={form.startKm} onChange={handleChange} style={input} placeholder="Odometer reading" />
            </Field>
          </div>

          <SectionTitle title="Customer Details" />
          <div style={grid(3)}>
            <Field label="Customer Name *">
              <input type="text" name="customerName" value={form.customerName} onChange={handleChange} style={input} placeholder="Full name" />
            </Field>
            <Field label="Mobile Number *">
              <input type="text" name="mobileNumber" value={form.mobileNumber} onChange={handleChange} style={input} placeholder="10-digit mobile" maxLength={10} />
            </Field>
            <Field label="Repeat User">
              <div style={{ display: 'flex', gap: '16px', paddingTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                  <input type="checkbox" name="repeatUserYearly" checked={form.repeatUserYearly} onChange={handleChange} />
                  Yearly
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                  <input type="checkbox" name="repeatUserMonthly" checked={form.repeatUserMonthly} onChange={handleChange} />
                  Monthly
                </label>
              </div>
            </Field>
          </div>

          <SectionTitle title="Payment Details" />
          <div style={grid(4)}>
            <Field label="Estimated Rent ₹">
              <input type="number" value={form.rentAmount} style={{ ...input, background: '#f0f4ff' }} readOnly />
            </Field>
            <Field label="Security Deposit ₹">
              <input type="number" value={selectedVehicle ? selectedVehicle.securityDeposit : ''} style={{ ...input, background: '#f0f4ff' }} readOnly />
            </Field>
            <Field label="Old Deposit ₹">
              <input type="number" name="oldDeposit" value={form.oldDeposit} onChange={handleChange} style={input} placeholder="0" />
            </Field>
            <Field label="Delivery Charges ₹">
              <input type="number" name="deliveryCharges" value={form.deliveryCharges} onChange={handleChange} style={input} placeholder="0" />
            </Field>
          </div>
          <div style={grid(4)}>
            <Field label="Full Amount Received ₹">
              <input type="number" name="fullAmountReceived" value={form.fullAmountReceived} onChange={handleChange} style={input} placeholder="Auto: Rent + Deposit" />
            </Field>
            <Field label="Cash ₹">
              <input type="number" name="cash" value={form.cash} onChange={handleChange} style={input} placeholder="0" />
            </Field>
            <Field label="Mode of Payment">
              <select name="modeOfPayment" value={form.modeOfPayment} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {modeOfPaymentOptions.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Pay Via">
              <select name="payVia" value={form.payVia} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {payViaOptions.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <div style={grid(3)}>
            <Field label="Credit To">
              <select name="creditTo" value={form.creditTo} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {creditToOptions.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Remarks">
              <input type="text" name="remarks" value={form.remarks} onChange={handleChange} style={input} placeholder="Any additional notes" />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Cancel</button>
            <button type="submit" style={btnPrimary}>Save Booking</button>
          </div>
        </form>
      )}

      {/* FINAL / RETURN FORM */}
      {returningBooking && (
        <form onSubmit={handleFinalSubmit} style={{ ...formCard, borderLeft: '4px solid #f59e0b' }}>
          <h2 style={{ marginBottom: '4px', color: '#1a56a0', fontSize: '18px' }}>Close Booking — Return Details</h2>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>
            {returningBooking.customerName} &nbsp;|&nbsp; {returningBooking.vehicle} ({returningBooking.vehicleNumber}) &nbsp;|&nbsp;
            Booked: {returningBooking.bookingDate} {returningBooking.bookingTime} &nbsp;|&nbsp;
            Expected Return: {returningBooking.expectedReturnDateTime}
          </p>

          <SectionTitle title="Return Info" />
          <div style={grid(3)}>
            <Field label="Actual Return Date & Time">
              <input type="text" name="actualReturnDateTime" value={finalForm.actualReturnDateTime} onChange={handleFinalChange} style={input} placeholder="YYYY-MM-DD HH:MM AM/PM" />
            </Field>
            <Field label="Helmet Returned">
              <select name="helmetReturned" value={finalForm.helmetReturned} onChange={handleFinalChange} style={input}>
                <option value="">Select...</option>
                {helmetOptions.map(h => <option key={h}>{h}</option>)}
              </select>
            </Field>
          </div>

          <SectionTitle title="Vehicle Return" />
          <div style={grid(3)}>
            <Field label="End KM">
              <input type="number" name="endKm" value={finalForm.endKm} onChange={handleFinalChange} style={input} placeholder="Odometer at return" />
            </Field>
            <Field label="KM Driven">
              <input type="text" value={finalForm.kmDriven} style={{ ...input, background: '#f0f4ff' }} readOnly />
            </Field>
          </div>

          <SectionTitle title="Final Payment" />
          <div style={grid(4)}>
            <Field label="Extra Hours">
              <input type="number" name="extraHours" value={finalForm.extraHours} onChange={handleFinalChange} style={input} placeholder="0" min="0" step="1" />
            </Field>
            <Field label="Extra Charge ₹ (@ ₹50/hr)">
              <input type="number" value={finalForm.extraCharge} style={{ ...input, background: '#fff7ed' }} readOnly />
            </Field>
            <Field label="Actual Rent ₹">
              <input type="number" value={finalForm.rentAmount} style={{ ...input, background: '#f0f4ff' }} readOnly />
            </Field>
            <Field label="Deduction ₹">
              <input type="number" name="deduction" value={finalForm.deduction} onChange={handleFinalChange} style={input} placeholder="0" />
            </Field>
          </div>
          <div style={grid(4)}>
            <Field label="Reason For Deduction">
              <select name="reasonForDeduction" value={finalForm.reasonForDeduction} onChange={handleFinalChange} style={input}>
                <option value="">Select...</option>
                {reasonForDeductionOptions.map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Damaged & Fine">
              <input type="text" name="damagedFine" value={finalForm.damagedFine} onChange={handleFinalChange} style={input} placeholder="Describe + amount" />
            </Field>
            <Field label="Refund Amount ₹">
              <input type="number" value={finalForm.refundAmount} style={{ ...input, background: '#f0f4ff' }} readOnly />
            </Field>
          </div>
          <div style={grid(3)}>
            <Field label="Refund Status">
              <select name="refundStatus" value={finalForm.refundStatus} onChange={handleFinalChange} style={input}>
                <option value="">Select...</option>
                {refundStatusOptions.map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Refund By">
              <select name="refundBy" value={finalForm.refundBy} onChange={handleFinalChange} style={input}>
                <option value="">Select...</option>
                {refundByOptions.map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button type="button" onClick={() => setReturningId(null)} style={btnSecondary}>Cancel</button>
            <button type="submit" style={{ ...btnPrimary, background: '#059669' }}>Close Booking</button>
          </div>
        </form>
      )}

      {/* BOOKINGS TABLE */}
      <div style={formCard}>
        <h2 style={{ marginBottom: '16px', color: '#1a56a0', fontSize: '18px' }}>
          Today's Bookings ({bookings.length})
        </h2>
        {bookings.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>No bookings yet. Click "+ New Booking" to add one.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th colSpan={9} style={{ ...th, background: '#dbeafe', textAlign: 'center' }}>Initial Booking</th>
                  <th colSpan={8} style={{ ...th, background: '#fef9c3', textAlign: 'center' }}>Return Details</th>
                  <th style={th}></th>
                </tr>
                <tr>
                  {['Date', 'Time', 'Customer', 'Mobile', 'Vehicle', 'Booking', 'Exp. Return', 'Start KM', 'Est. Rent ₹'].map(h => (
                    <th key={h} style={{ ...th, background: '#dbeafe' }}>{h}</th>
                  ))}
                  {['Status', 'Actual Return', 'End KM', 'KM Driven', 'Extra Hrs', 'Actual Rent ₹', 'Refund ₹', 'Helmet Returned'].map(h => (
                    <th key={h} style={{ ...th, background: '#fef9c3' }}>{h}</th>
                  ))}
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                    <td style={tdStyle}>{b.bookingDate}</td>
                    <td style={tdStyle}>{b.bookingTime}</td>
                    <td style={tdStyle}>{b.customerName}</td>
                    <td style={tdStyle}>{b.mobileNumber}</td>
                    <td style={tdStyle}>{b.vehicle} — {b.vehicleNumber}</td>
                    <td style={tdStyle}>{b.bookingType}{b.numDays ? ` (${b.numDays}d)` : ''}{b.numWeeks ? ` (${b.numWeeks}w)` : ''}</td>
                    <td style={tdStyle}>{b.expectedReturnDateTime}</td>
                    <td style={tdStyle}>{b.startKm || '—'}</td>
                    <td style={tdStyle}>₹{b.rentAmount}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                        background: b.status === 'start' ? '#fef3c7' : '#d1fae5',
                        color: b.status === 'start' ? '#92400e' : '#065f46'
                      }}>
                        {b.status === 'start' ? 'Start' : 'End'}
                      </span>
                    </td>
                    <td style={tdStyle}>{b.final?.actualReturnDateTime || '—'}</td>
                    <td style={tdStyle}>{b.final?.endKm || '—'}</td>
                    <td style={tdStyle}>{b.final?.kmDriven ? `${b.final.kmDriven} km` : '—'}</td>
                    <td style={tdStyle}>{b.final?.extraHours ? `${b.final.extraHours} hr` : '—'}</td>
                    <td style={tdStyle}>{b.final ? `₹${b.final.rentAmount}` : '—'}</td>
                    <td style={tdStyle}>{b.final ? `₹${b.final.refundAmount}` : '—'}</td>
                    <td style={tdStyle}>{b.final?.helmetReturned || '—'}</td>
                    <td style={tdStyle}>
                      {b.status === 'start' && (
                        <button
                          onClick={() => startReturn(b)}
                          style={{ ...btnPrimary, padding: '4px 12px', fontSize: '12px', background: '#f59e0b' }}
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#1a56a0', borderBottom: '1px solid #e0e8f0', paddingBottom: '6px', marginBottom: '14px', marginTop: '20px' }}>
      {title}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>{label}</label>
      {children}
    </div>
  );
}

const input = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', outline: 'none' };
const tdStyle = { padding: '10px 12px', whiteSpace: 'nowrap', color: '#333' };
const th = { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#1a56a0', whiteSpace: 'nowrap', borderBottom: '2px solid #1a56a0' };
const formCard = { background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' };
const btnPrimary = { background: '#1a56a0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' };
const btnSecondary = { padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '14px' };
function grid(cols) { return { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px', marginBottom: '16px' }; }
