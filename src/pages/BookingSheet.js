import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { vehicles } from '../data/vehicles';
import {
  bookingTypes,
  helmetOptions,
  modeOfPaymentOptions,
  paidToOptions,
  refundStatusOptions,
  reasonForDeductionOptions,
  creditToOptions,
  refundByOptions,
  centreOptions,
} from '../data/options';
import {
  getCurrentTime12hr,
  calculateReturnDateTime,
  calculateRentAmount,
  calculateKmDriven
} from '../utils/calculations';

function getToday() {
  return new Date().toISOString().split('T')[0];
}

const emptyForm = {
  bookingDate: getToday(),
  bookingTime: getCurrentTime12hr(),
  bookingType: '',
  expectedReturnDateTime: '',
  centre: '',
  vehicle: '',
  vehicleNumber: '',
  helmet: '',
  startKm: '',
  customerName: '',
  mobileNumber: '',
  rentAmount: '',
  deliveryCharges: '',
  fullAmountReceived: '',
  cash: '',
  paidTo: '',
  modeOfPayment: '',
  creditTo: '',
  remarks: '',
};

function parseTime12hr(timeStr) {
  const match = timeStr && timeStr.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!match) return { hour: '12', minute: '00', period: 'AM' };
  return { hour: match[1].padStart(2, '0'), minute: match[2], period: match[3] };
}

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
  const [editingId, setEditingId] = useState(null);
  const [returningId, setReturningId] = useState(null);
  const [finalForm, setFinalForm] = useState(emptyFinal);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedVehicle = vehicles.find(v => v.type === form.vehicle);
  const returningBooking = bookings.find(b => b.id === returningId);

  useEffect(() => { loadBookings(); }, []);

  async function loadBookings() {
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_date', getToday())
      .order('created_at', { ascending: true });

    if (error) setError('Failed to load bookings: ' + error.message);
    else setBookings(data || []);
    setLoading(false);
  }

  async function lookupCustomer(mobile) {
    if (mobile.length !== 10) return;
    const { data } = await supabase
      .from('customers')
      .select('name')
      .eq('mobile', mobile)
      .single();
    if (data) setForm(prev => ({ ...prev, customerName: data.name }));
  }

  function recalculate(updated, autoFillAmount = false) {
    const returnDT = calculateReturnDateTime(
      updated.bookingDate, updated.bookingTime, updated.bookingType
    );
    updated.expectedReturnDateTime = returnDT;

    if (updated.vehicle && updated.bookingType) {
      const v = vehicles.find(veh => veh.type === updated.vehicle);
      if (v) {
        updated.rentAmount = calculateRentAmount(v, updated.bookingType, 0);
        if (autoFillAmount) {
          updated.fullAmountReceived = (parseFloat(updated.rentAmount) || 0) + v.securityDeposit + (parseFloat(updated.deliveryCharges) || 0);
        }
      }
    }
    return updated;
  }

  function handleChange(e) {
    const { name, value } = e.target;
    let updated = { ...form, [name]: value };

    if (name === 'vehicle') {
      const v = vehicles.find(v => v.type === value);
      updated.vehicleNumber = v && v.registrations.length === 1 ? v.registrations[0] : '';
      updated.bookingType = '';
      updated.rentAmount = '';
      updated.fullAmountReceived = '';
    }
    if (name === 'mobileNumber') lookupCustomer(value);
    if (name === 'cash' && !value) updated.paidTo = '';
    if (name === 'modeOfPayment' && value === 'Cash') updated.creditTo = '';

    const autoFillAmount = ['vehicle', 'bookingType', 'deliveryCharges'].includes(name);
    updated = recalculate(updated, autoFillAmount);
    setForm(updated);
  }

  function formFromBooking(b) {
    return {
      bookingDate: b.booking_date,
      bookingTime: b.booking_time,
      bookingType: b.booking_type,
      expectedReturnDateTime: b.expected_return,
      centre: b.centre || '',
      vehicle: b.vehicle,
      vehicleNumber: b.vehicle_number,
      helmet: b.helmet || '',
      startKm: b.start_km || '',
      customerName: b.customer_name,
      mobileNumber: b.mobile,
      rentAmount: b.rent_amount || '',
      deliveryCharges: b.delivery_charges || '',
      fullAmountReceived: b.full_amount_received || '',
      cash: b.cash || '',
      paidTo: b.paid_to || '',
      modeOfPayment: b.mode_of_payment || '',
      creditTo: b.credit_to || '',
      remarks: b.remarks || '',
    };
  }

  function finalFormFromBooking(b) {
    return {
      actualReturnDateTime: b.actual_return || '',
      endKm: b.end_km || '',
      kmDriven: b.km_driven || '',
      helmetReturned: b.helmet_returned || '',
      extraHours: b.extra_hours || '',
      extraCharge: b.extra_charge || '',
      rentAmount: b.final_rent || '',
      deduction: b.deduction || '',
      reasonForDeduction: b.reason_for_deduction || '',
      damagedFine: b.damaged_fine || '',
      refundAmount: b.refund_amount || '',
      refundStatus: b.refund_status || '',
      refundBy: b.refund_by || '',
    };
  }

  function startEdit(booking) {
    setEditingId(booking.id);
    setForm(formFromBooking(booking));
    setShowForm(true);
    if (booking.status === 'end') {
      setReturningId(booking.id);
      setFinalForm(finalFormFromBooking(booking));
    } else {
      setReturningId(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.customerName || !form.mobileNumber || !form.vehicle) {
      alert('Please fill Customer Name, Mobile Number and Vehicle');
      return;
    }

    setSaving(true);
    setError('');

    const { error: custError } = await supabase
      .from('customers')
      .upsert({ mobile: form.mobileNumber, name: form.customerName }, { onConflict: 'mobile' });

    if (custError) {
      setError('Failed to save customer: ' + custError.message);
      setSaving(false);
      return;
    }

    const payload = {
      mobile: form.mobileNumber,
      customer_name: form.customerName,
      booking_date: form.bookingDate,
      booking_time: form.bookingTime,
      booking_type: form.bookingType,
      centre: form.centre,
      expected_return: form.expectedReturnDateTime,
      vehicle: form.vehicle,
      vehicle_number: form.vehicleNumber,
      helmet: form.helmet,
      start_km: form.startKm,
      rent_amount: form.rentAmount || 0,
      delivery_charges: form.deliveryCharges || 0,
      full_amount_received: form.fullAmountReceived || 0,
      cash: form.cash || 0,
      paid_to: form.cash ? form.paidTo : null,
      mode_of_payment: form.modeOfPayment,
      credit_to: ['UPI', 'App Payment'].includes(form.modeOfPayment) ? form.creditTo : null,
      remarks: form.remarks,
    };

    if (editingId) {
      const { data, error: updateError } = await supabase
        .from('bookings')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single();

      if (updateError) setError('Failed to update booking: ' + updateError.message);
      else {
        setBookings(prev => prev.map(b => b.id === editingId ? data : b));
        setEditingId(null);
        setShowForm(false);
        setForm({ ...emptyForm, bookingDate: getToday(), bookingTime: getCurrentTime12hr() });
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('bookings')
        .insert({ id: Date.now(), ...payload, status: 'start' })
        .select()
        .single();

      if (insertError) setError('Failed to save booking: ' + insertError.message);
      else {
        setBookings(prev => [...prev, data]);
        setForm({ ...emptyForm, bookingDate: getToday(), bookingTime: getCurrentTime12hr() });
        setShowForm(false);
      }
    }

    setSaving(false);
  }

  function recalculateFinal(updated, booking) {
    updated.kmDriven = calculateKmDriven(booking.start_km, updated.endKm);
    const v = vehicles.find(veh => veh.type === booking.vehicle);
    const baseRent = v ? calculateRentAmount(v, booking.booking_type, 0) : 0;
    const extraHours = parseFloat(updated.extraHours) || 0;
    updated.extraCharge = extraHours * (v ? v.lateChargePerHour : 0);
    updated.rentAmount = baseRent + updated.extraCharge;
    const fullAmount = parseFloat(booking.full_amount_received) || 0;
    const extraCharge = parseFloat(updated.extraCharge) || 0;
    const deduction = parseFloat(updated.deduction) || 0;
    updated.refundAmount = fullAmount - baseRent - extraCharge - deduction;
    return updated;
  }

  function handleFinalChange(e) {
    const { name, value } = e.target;
    let updated = { ...finalForm, [name]: value };
    updated = recalculateFinal(updated, returningBooking);
    setFinalForm(updated);
  }

  async function handleFinalSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const { data, error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'end',
        actual_return: finalForm.actualReturnDateTime,
        end_km: finalForm.endKm,
        km_driven: finalForm.kmDriven,
        helmet_returned: finalForm.helmetReturned,
        extra_hours: finalForm.extraHours || 0,
        extra_charge: finalForm.extraCharge || 0,
        final_rent: finalForm.rentAmount || 0,
        deduction: finalForm.deduction || 0,
        reason_for_deduction: finalForm.reasonForDeduction,
        damaged_fine: finalForm.damagedFine,
        refund_amount: finalForm.refundAmount || 0,
        refund_status: finalForm.refundStatus,
        refund_by: finalForm.refundBy,
      })
      .eq('id', returningId)
      .select()
      .single();

    if (updateError) setError('Failed to close booking: ' + updateError.message);
    else {
      setBookings(prev => prev.map(b => b.id === returningId ? data : b));
      setReturningId(null);
      setFinalForm(emptyFinal);
    }
    setSaving(false);
  }

  function startReturn(booking) {
    setReturningId(booking.id);
    setFinalForm({ ...emptyFinal, actualReturnDateTime: `${getToday()} ${getCurrentTime12hr()}` });
    setShowForm(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const showCreditTo = ['UPI', 'App Payment'].includes(form.modeOfPayment);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a56a0' }}>Banjara Ride</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>Daily Booking Sheet</p>
        </div>
        <button onClick={() => {
          if (showForm && editingId) { setEditingId(null); setForm({ ...emptyForm, bookingDate: getToday(), bookingTime: getCurrentTime12hr() }); }
          setShowForm(!showForm);
          setReturningId(null);
        }} style={btnPrimary}>
          {showForm ? 'Close Form' : '+ New Booking'}
        </button>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: '700' }}>✕</button>
        </div>
      )}

      {/* BOOKING FORM (new or edit) */}
      {showForm && (
        <form onSubmit={handleSubmit} autoComplete="off" style={{ ...formCard, borderLeft: editingId ? '4px solid #6366f1' : 'none' }}>
          <h2 style={{ marginBottom: '20px', color: '#1a56a0', fontSize: '18px' }}>
            {editingId ? 'Edit Booking' : 'New Booking'}
          </h2>

          <SectionTitle title="Trip Details" />
          <div style={grid(4)}>
            <Field label="Booking Date *">
              <input type="date" name="bookingDate" value={form.bookingDate} onChange={handleChange} style={input} />
            </Field>
            <Field label="Booking Time *">
              {(() => {
                const { hour, minute, period } = parseTime12hr(form.bookingTime);
                const setTimePart = (part, val) => {
                  const cur = parseTime12hr(form.bookingTime);
                  const updated = { ...cur, [part]: val };
                  handleChange({ target: { name: 'bookingTime', value: `${updated.hour}:${updated.minute} ${updated.period}` } });
                };
                return (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <select value={hour} onChange={e => setTimePart('hour', e.target.value)} style={{ ...input, padding: '8px 4px' }}>
                      {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => <option key={h}>{h}</option>)}
                    </select>
                    <select value={minute} onChange={e => setTimePart('minute', e.target.value)} style={{ ...input, padding: '8px 4px' }}>
                      {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => <option key={m}>{m}</option>)}
                    </select>
                    <select value={period} onChange={e => setTimePart('period', e.target.value)} style={{ ...input, padding: '8px 4px' }}>
                      <option>AM</option>
                      <option>PM</option>
                    </select>
                  </div>
                );
              })()}
            </Field>
            <Field label="Booking Duration *">
              <select name="bookingType" value={form.bookingType} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {(selectedVehicle ? bookingTypes.filter(bt => selectedVehicle.rates[bt] != null) : bookingTypes).map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Centre *">
              <select name="centre" value={form.centre} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {centreOptions.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
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
            <Field label="Vehicle Number *">
              <select name="vehicleNumber" value={form.vehicleNumber} onChange={handleChange} style={input} disabled={!selectedVehicle}>
                <option value="">Select...</option>
                {selectedVehicle && selectedVehicle.registrations.map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Start KM">
              <input type="number" name="startKm" value={form.startKm} onChange={handleChange} style={input} placeholder="Odometer reading" />
            </Field>
          </div>

          <SectionTitle title="Customer Details" />
          <div style={grid(3)}>
            <Field label="Mobile Number *">
              <input type="text" name="mobileNumber" value={form.mobileNumber} onChange={handleChange} style={input} placeholder="10-digit mobile" maxLength={10} />
            </Field>
            <Field label="Customer Name *">
              <input type="text" name="customerName" value={form.customerName} onChange={handleChange} style={input} placeholder="Auto-fills for returning customers" />
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
            <Field label="Delivery Charges ₹">
              <input type="number" name="deliveryCharges" value={form.deliveryCharges} onChange={handleChange} style={input} placeholder="0" />
            </Field>
            <Field label="Full Amount Received ₹">
              <input type="number" name="fullAmountReceived" value={form.fullAmountReceived} onChange={handleChange} style={input} placeholder="Auto: Rent + Deposit" />
            </Field>
          </div>
          <div style={grid(4)}>
            <Field label="Mode of Payment">
              <select name="modeOfPayment" value={form.modeOfPayment} onChange={handleChange} style={input}>
                <option value="">Select...</option>
                {modeOfPaymentOptions.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Cash ₹">
              <input type="number" name="cash" value={form.cash} onChange={handleChange} style={input} placeholder="0" />
            </Field>
            {form.cash > 0 && (
              <Field label="Paid To">
                <select name="paidTo" value={form.paidTo} onChange={handleChange} style={input}>
                  <option value="">Select...</option>
                  {paidToOptions.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
            )}
            {showCreditTo && (
              <Field label="Credit To">
                <select name="creditTo" value={form.creditTo} onChange={handleChange} style={input}>
                  <option value="">Select...</option>
                  {creditToOptions.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div style={grid(2)}>
            <Field label="Remarks">
              <input type="text" name="remarks" value={form.remarks} onChange={handleChange} style={input} placeholder="Any additional notes" />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm, bookingDate: getToday(), bookingTime: getCurrentTime12hr() }); }} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : editingId ? 'Update Booking' : 'Save Booking'}
            </button>
          </div>
        </form>
      )}

      {/* FINAL / RETURN FORM */}
      {returningBooking && (
        <form onSubmit={handleFinalSubmit} style={{ ...formCard, borderLeft: '4px solid #f59e0b' }}>
          <h2 style={{ marginBottom: '4px', color: '#1a56a0', fontSize: '18px' }}>Close Booking — Return Details</h2>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>
            {returningBooking.customer_name} &nbsp;|&nbsp; {returningBooking.vehicle} ({returningBooking.vehicle_number}) &nbsp;|&nbsp;
            Booked: {returningBooking.booking_date} {returningBooking.booking_time} &nbsp;|&nbsp;
            Expected Return: {returningBooking.expected_return}
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
            <button type="submit" disabled={saving} style={{ ...btnPrimary, background: '#059669', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Close Booking'}
            </button>
          </div>
        </form>
      )}

      {/* BOOKINGS TABLE */}
      <div style={formCard}>
        <h2 style={{ marginBottom: '16px', color: '#1a56a0', fontSize: '18px' }}>
          Today's Bookings ({bookings.length})
        </h2>
        {loading ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>Loading...</p>
        ) : bookings.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>No bookings yet. Click "+ New Booking" to add one.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th colSpan={10} style={{ ...th, background: '#dbeafe', textAlign: 'center' }}>Initial Booking</th>
                  <th colSpan={8} style={{ ...th, background: '#fef9c3', textAlign: 'center' }}>Return Details</th>
                  <th colSpan={2} style={{ ...th, textAlign: 'center' }}>Actions</th>
                </tr>
                <tr>
                  {['Date', 'Time', 'Centre', 'Customer', 'Mobile', 'Vehicle', 'Booking', 'Exp. Return', 'Start KM', 'Est. Rent ₹'].map(h => (
                    <th key={h} style={{ ...th, background: '#dbeafe' }}>{h}</th>
                  ))}
                  {['Status', 'Actual Return', 'End KM', 'KM Driven', 'Extra Hrs', 'Actual Rent ₹', 'Refund ₹', 'Helmet'].map(h => (
                    <th key={h} style={{ ...th, background: '#fef9c3' }}>{h}</th>
                  ))}
                  <th style={th}>Edit</th>
                  <th style={th}>Close</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                    <td style={tdStyle}>{b.booking_date}</td>
                    <td style={tdStyle}>{b.booking_time}</td>
                    <td style={tdStyle}>{b.centre || '—'}</td>
                    <td style={tdStyle}>{b.customer_name}</td>
                    <td style={tdStyle}>{b.mobile}</td>
                    <td style={tdStyle}>{b.vehicle} — {b.vehicle_number}</td>
                    <td style={tdStyle}>{b.booking_type}</td>
                    <td style={tdStyle}>{b.expected_return}</td>
                    <td style={tdStyle}>{b.start_km || '—'}</td>
                    <td style={tdStyle}>₹{b.rent_amount}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                        background: b.status === 'start' ? '#fef3c7' : '#d1fae5',
                        color: b.status === 'start' ? '#92400e' : '#065f46'
                      }}>
                        {b.status === 'start' ? 'Start' : 'End'}
                      </span>
                    </td>
                    <td style={tdStyle}>{b.actual_return || '—'}</td>
                    <td style={tdStyle}>{b.end_km || '—'}</td>
                    <td style={tdStyle}>{b.km_driven ? `${b.km_driven} km` : '—'}</td>
                    <td style={tdStyle}>{b.extra_hours ? `${b.extra_hours} hr` : '—'}</td>
                    <td style={tdStyle}>{b.final_rent ? `₹${b.final_rent}` : '—'}</td>
                    <td style={tdStyle}>{b.refund_amount ? `₹${b.refund_amount}` : '—'}</td>
                    <td style={tdStyle}>{b.helmet_returned || '—'}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => startEdit(b)}
                        style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px' }}
                      >
                        Edit
                      </button>
                    </td>
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
