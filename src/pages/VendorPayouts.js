import { useState, useEffect, Fragment } from 'react';
import { supabase } from '../supabaseClient';

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function formatINR(n) {
  return Math.round(n || 0).toLocaleString('en-IN');
}

const emptyVendorForm = { name: '', phone: '', notes: '' };
const emptyVVForm = { vendor_id: '', owner_share_pct: '', parking_charge: '', attached_date: '', active: 'true' };

export default function VendorPayouts({ profile, setActivePage }) {
  const [month, setMonth] = useState(getCurrentMonth());
  const [vendorFilter, setVendorFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [vendors, setVendors] = useState([]);
  const [vendorVehicles, setVendorVehicles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [showAddVendor, setShowAddVendor] = useState(false);
  const [addVendorForm, setAddVendorForm] = useState(emptyVendorForm);
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [editVendorForm, setEditVendorForm] = useState(emptyVendorForm);

  const [editingVVId, setEditingVVId] = useState(null);
  const [editVVForm, setEditVVForm] = useState(emptyVVForm);

  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true);
    setError('');
    const { start, end } = monthRange(month);

    const [{ data: vendorsData, error: vErr }, { data: vvData }, { data: bookingsData }, { data: expensesData }] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase.from('vendor_vehicles').select('*, vehicles(id, registration_number, vehicle_type_id, vehicle_types(name)), vendors(name)'),
      supabase.from('bookings').select('vehicle_number, final_rent, booking_date, status').eq('status', 'end').gte('booking_date', start).lte('booking_date', end),
      supabase.from('maintenance_expenses').select('vehicle_id, amount, expense_date').gte('expense_date', start).lte('expense_date', end),
    ]);

    if (vErr) setError('Failed to load vendor payouts: ' + vErr.message);
    setVendors(vendorsData || []);
    setVendorVehicles(vvData || []);
    setBookings(bookingsData || []);
    setExpenses(expensesData || []);
    setLoading(false);
  }

  // ── Statement calculation ──────────────────────────
  const creditByReg = {};
  bookings.forEach(b => { creditByReg[b.vehicle_number] = (creditByReg[b.vehicle_number] || 0) + (parseFloat(b.final_rent) || 0); });

  const maintenanceByVehicleId = {};
  expenses.forEach(e => { maintenanceByVehicleId[e.vehicle_id] = (maintenanceByVehicleId[e.vehicle_id] || 0) + (parseFloat(e.amount) || 0); });

  function computeRow(vv) {
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

  const activeVV = vendorVehicles.filter(vv => vv.active && vv.vehicles);
  const filteredVV = vendorFilter === 'all' ? activeVV : activeVV.filter(vv => String(vv.vendor_id) === vendorFilter);

  const vendorGroups = vendors
    .map(v => {
      const rows = filteredVV.filter(vv => vv.vendor_id === v.id).map(vv => ({ vv, calc: computeRow(vv) }));
      return {
        vendor: v,
        rows,
        subtotalOwner: rows.reduce((s, r) => s + r.calc.ownerAmt, 0),
        subtotalBJ: rows.reduce((s, r) => s + r.calc.bjEarn, 0),
      };
    })
    .filter(g => g.rows.length > 0);

  const grandTotalOwner = vendorGroups.reduce((s, g) => s + g.subtotalOwner, 0);
  const grandTotalBJ = vendorGroups.reduce((s, g) => s + g.subtotalBJ, 0);

  // ── Vendor management ───────────────────────────────
  function vehicleCountFor(vendorId) {
    return vendorVehicles.filter(vv => vv.vendor_id === vendorId && vv.active).length;
  }

  function startEditVendor(v) {
    setEditingVendorId(v.id);
    setEditVendorForm({ name: v.name, phone: v.phone || '', notes: v.notes || '' });
  }

  async function saveEditVendor(id) {
    if (!editVendorForm.name.trim()) { alert('Name is required'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('vendors').update({
      name: editVendorForm.name.trim(), phone: editVendorForm.phone || null, notes: editVendorForm.notes || null,
    }).eq('id', id);
    if (err) setError(err.message);
    else { setEditingVendorId(null); await loadAll(); }
    setSaving(false);
  }

  async function saveAddVendor() {
    if (!addVendorForm.name.trim()) { alert('Name is required'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('vendors').insert({
      name: addVendorForm.name.trim(), phone: addVendorForm.phone || null, notes: addVendorForm.notes || null,
    });
    if (err) setError(err.message);
    else { setShowAddVendor(false); setAddVendorForm(emptyVendorForm); await loadAll(); }
    setSaving(false);
  }

  // ── Vendor vehicle management ───────────────────────
  function startEditVV(vv) {
    setEditingVVId(vv.id);
    setEditVVForm({
      vendor_id: String(vv.vendor_id),
      owner_share_pct: String(Math.round((parseFloat(vv.owner_share_pct) || 0) * 100)),
      parking_charge: String(vv.parking_charge),
      attached_date: vv.attached_date || '',
      active: String(vv.active),
    });
  }

  async function saveEditVV(id) {
    const pctNum = parseFloat(editVVForm.owner_share_pct);
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) { alert('Owner share % must be between 0 and 100'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('vendor_vehicles').update({
      vendor_id: parseInt(editVVForm.vendor_id),
      owner_share_pct: pctNum / 100,
      parking_charge: parseFloat(editVVForm.parking_charge) || 0,
      attached_date: editVVForm.attached_date || null,
      active: editVVForm.active === 'true',
    }).eq('id', id);
    if (err) setError(err.message);
    else { setEditingVVId(null); await loadAll(); }
    setSaving(false);
  }

  const allVVSorted = [...vendorVehicles].sort((a, b) => {
    const na = a.vendors?.name || '', nb = b.vendors?.name || '';
    if (na !== nb) return na.localeCompare(nb);
    return (a.vehicles?.registration_number || '').localeCompare(b.vehicles?.registration_number || '');
  });

  return (
    <div className="br-page">

      {/* HEADER */}
      <div className="br-header">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a56a0' }}>Banjara Ride</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>Vendor Payouts</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => setActivePage('bookings')} style={btnSecondary}>← Bookings</button>
          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #e5e7eb', paddingLeft: '12px' }}>
              <span style={{ fontSize: '13px', color: '#555' }}><strong>{profile.display_name}</strong></span>
              <button onClick={() => supabase.auth.signOut()} style={{ ...btnSecondary, fontSize: '12px', padding: '6px 10px' }}>Log out</button>
            </div>
          )}
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: '700' }}>✕</button>
        </div>
      )}

      {/* FILTERS */}
      <div className="br-filter">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={input} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Vendor</label>
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} style={input}>
            <option value="all">All Vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <button onClick={loadAll} style={btnSecondary}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      {/* STATEMENT TABLE — desktop */}
      <div className="br-form-card">
        <h2 style={{ marginBottom: '16px', color: '#1a56a0', fontSize: '18px' }}>Revenue Sharing Statement</h2>
        <div className="desktop-table">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['Vehicle Name', 'Reg. No.', 'Attached By', 'Credit ₹', 'GST 6% ₹', 'Credit after GST ₹', 'Parking ₹', 'Maint. Debit ₹', 'Amount Left ₹', '% Owner', 'Owner Amt ₹', 'BJ Earn ₹'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendorGroups.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>{loading ? 'Loading...' : 'No vehicles for this filter.'}</td></tr>
              ) : vendorGroups.map(g => (
                <Fragment key={g.vendor.id}>
                  {g.rows.map(({ vv, calc }) => (
                    <tr key={vv.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={tdStyle}>{vv.vehicles.vehicle_types?.name || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: '600' }}>{vv.vehicles.registration_number}</td>
                      <td style={tdStyle}>{g.vendor.name}</td>
                      <td style={tdStyle}>₹{formatINR(calc.credit)}</td>
                      <td style={tdStyle}>₹{formatINR(calc.gst)}</td>
                      <td style={tdStyle}>₹{formatINR(calc.creditAfterGst)}</td>
                      <td style={tdStyle}>₹{formatINR(calc.parking)}</td>
                      <td style={tdStyle}>₹{formatINR(calc.maintenance)}</td>
                      <td style={tdStyle}>₹{formatINR(calc.amountLeft)}</td>
                      <td style={tdStyle}>{Math.round(calc.pct * 100)}%</td>
                      <td style={tdStyle}>₹{formatINR(calc.ownerAmt)}</td>
                      <td style={tdStyle}>₹{formatINR(calc.bjEarn)}</td>
                    </tr>
                  ))}
                  <tr key={`${g.vendor.id}-subtotal`} style={{ borderBottom: '2px solid #1a56a0', background: '#f0f4ff', fontWeight: '700' }}>
                    <td style={tdStyle} colSpan={10}>{g.vendor.name} — Subtotal</td>
                    <td style={tdStyle}>₹{formatINR(g.subtotalOwner)}</td>
                    <td style={tdStyle}>₹{formatINR(g.subtotalBJ)}</td>
                  </tr>
                </Fragment>
              ))}
              {vendorGroups.length > 0 && (
                <tr style={{ background: '#1a56a0', color: 'white', fontWeight: '700' }}>
                  <td style={tdStyle} colSpan={10}>Grand Total</td>
                  <td style={tdStyle}>₹{formatINR(grandTotalOwner)}</td>
                  <td style={tdStyle}>₹{formatINR(grandTotalBJ)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* STATEMENT — mobile cards */}
        <div className="mobile-cards">
          {vendorGroups.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>{loading ? 'Loading...' : 'No vehicles for this filter.'}</p>
          ) : vendorGroups.map(g => (
            <div key={g.vendor.id} style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', color: '#1a56a0', marginBottom: '8px' }}>{g.vendor.name}</h3>
              {g.rows.map(({ vv, calc }) => (
                <div key={vv.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', background: 'white' }}>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: '#1a56a0', marginBottom: '4px' }}>
                    {vv.vehicles.vehicle_types?.name || '—'} · {vv.vehicles.registration_number}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.8' }}>
                    Credit: ₹{formatINR(calc.credit)} &nbsp;·&nbsp; GST 6%: ₹{formatINR(calc.gst)}<br/>
                    Credit after GST: ₹{formatINR(calc.creditAfterGst)}<br/>
                    Parking: ₹{formatINR(calc.parking)} &nbsp;·&nbsp; Maint. Debit: ₹{formatINR(calc.maintenance)}<br/>
                    Amount Left: ₹{formatINR(calc.amountLeft)} &nbsp;·&nbsp; Owner %: {Math.round(calc.pct * 100)}%
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a56a0', marginTop: '6px' }}>
                    Owner Amt: ₹{formatINR(calc.ownerAmt)} &nbsp;·&nbsp; BJ Earn: ₹{formatINR(calc.bjEarn)}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a56a0', padding: '8px', background: '#f0f4ff', borderRadius: '8px' }}>
                Subtotal — Owner: ₹{formatINR(g.subtotalOwner)} · BJ: ₹{formatINR(g.subtotalBJ)}
              </div>
            </div>
          ))}
          {vendorGroups.length > 0 && (
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'white', background: '#1a56a0', padding: '10px', borderRadius: '8px' }}>
              Grand Total — Owner: ₹{formatINR(grandTotalOwner)} · BJ: ₹{formatINR(grandTotalBJ)}
            </div>
          )}
        </div>
      </div>

      {/* VENDOR MANAGEMENT */}
      <div className="br-form-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: '#1a56a0', fontSize: '18px' }}>Vendors ({vendors.length})</h2>
          <button onClick={() => { setShowAddVendor(v => !v); setEditingVendorId(null); }} style={btnPrimary}>
            {showAddVendor ? 'Cancel' : '+ Add Vendor'}
          </button>
        </div>

        {showAddVendor && (
          <div style={{ marginBottom: '20px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div className="br-grid-3" style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Name *</label>
                <input type="text" value={addVendorForm.name} onChange={e => setAddVendorForm(p => ({ ...p, name: e.target.value }))} style={input} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Phone</label>
                <input type="text" value={addVendorForm.phone} onChange={e => setAddVendorForm(p => ({ ...p, phone: e.target.value }))} style={input} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Notes</label>
                <input type="text" value={addVendorForm.notes} onChange={e => setAddVendorForm(p => ({ ...p, notes: e.target.value }))} style={input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAddVendor(false); setAddVendorForm(emptyVendorForm); }} style={btnSecondary}>Cancel</button>
              <button onClick={saveAddVendor} disabled={saving} style={{ ...btnPrimary, background: '#059669', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Add Vendor'}
              </button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>{['Name', 'Phone', 'Notes', 'Active Vehicles', 'Edit'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {vendors.map((v, i) => {
                const editing = editingVendorId === v.id;
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>
                      {editing ? <input type="text" value={editVendorForm.name} onChange={e => setEditVendorForm(p => ({ ...p, name: e.target.value }))} style={{ ...input, width: '160px' }} /> : v.name}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="text" value={editVendorForm.phone} onChange={e => setEditVendorForm(p => ({ ...p, phone: e.target.value }))} style={{ ...input, width: '130px' }} /> : (v.phone || '—')}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="text" value={editVendorForm.notes} onChange={e => setEditVendorForm(p => ({ ...p, notes: e.target.value }))} style={{ ...input, width: '180px' }} /> : (v.notes || '—')}
                    </td>
                    <td style={tdStyle}>{vehicleCountFor(v.id)}</td>
                    <td style={tdStyle}>
                      {editing ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => saveEditVendor(v.id)} disabled={saving} style={{ ...btnPrimary, padding: '5px 14px', fontSize: '12px', opacity: saving ? 0.7 : 1 }}>{saving ? '...' : 'Save'}</button>
                          <button onClick={() => setEditingVendorId(null)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEditVendor(v)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Edit</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* VENDOR VEHICLE MANAGEMENT */}
      <div className="br-form-card">
        <h2 style={{ marginBottom: '16px', color: '#1a56a0', fontSize: '18px' }}>Vendor Vehicles ({vendorVehicles.length})</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>{['Reg. No.', 'Vehicle Type', 'Vendor', 'Owner %', 'Parking ₹', 'Attached Date', 'Status', 'Edit'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {allVVSorted.map((vv, i) => {
                const editing = editingVVId === vv.id;
                return (
                  <tr key={vv.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>{vv.vehicles?.registration_number || '—'}</td>
                    <td style={tdStyle}>{vv.vehicles?.vehicle_types?.name || '—'}</td>
                    <td style={tdStyle}>
                      {editing ? (
                        <select value={editVVForm.vendor_id} onChange={e => setEditVVForm(p => ({ ...p, vendor_id: e.target.value }))} style={{ ...input, width: '150px' }}>
                          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      ) : (vv.vendors?.name || '—')}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="number" value={editVVForm.owner_share_pct} onChange={e => setEditVVForm(p => ({ ...p, owner_share_pct: e.target.value }))} style={{ ...input, width: '70px' }} /> : `${Math.round((parseFloat(vv.owner_share_pct) || 0) * 100)}%`}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="number" value={editVVForm.parking_charge} onChange={e => setEditVVForm(p => ({ ...p, parking_charge: e.target.value }))} style={{ ...input, width: '80px' }} /> : `₹${formatINR(vv.parking_charge)}`}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="date" value={editVVForm.attached_date} onChange={e => setEditVVForm(p => ({ ...p, attached_date: e.target.value }))} style={{ ...input, width: '140px' }} /> : (vv.attached_date || '—')}
                    </td>
                    <td style={tdStyle}>
                      {editing ? (
                        <select value={editVVForm.active} onChange={e => setEditVVForm(p => ({ ...p, active: e.target.value }))} style={{ ...input, width: '100px' }}>
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: vv.active ? '#d1fae5' : '#fee2e2', color: vv.active ? '#065f46' : '#991b1b' }}>
                          {vv.active ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {editing ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => saveEditVV(vv.id)} disabled={saving} style={{ ...btnPrimary, padding: '5px 14px', fontSize: '12px', opacity: saving ? 0.7 : 1 }}>{saving ? '...' : 'Save'}</button>
                          <button onClick={() => setEditingVVId(null)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEditVV(vv)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Edit</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: '12px', color: '#666', fontWeight: '500' };
const input = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', outline: 'none' };
const tdStyle = { padding: '10px 12px', color: '#333', whiteSpace: 'nowrap' };
const th = { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#1a56a0', whiteSpace: 'nowrap', borderBottom: '2px solid #1a56a0', background: '#f0f4ff' };
const btnPrimary = { background: '#1a56a0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' };
const btnSecondary = { padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '14px' };
