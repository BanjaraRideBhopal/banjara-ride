import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const emptyAdd = {
  registration_number: '', vehicle_type_id: '', centre_id: '', isNewType: false,
  newTypeName: '', newTypeDeposit: '', newTypeLateCharge: '',
  rate3hr: '', rate6hr: '', rate12hr: '', rate1day: '', rate2days: '', rate3days: '',
  rate4days: '', rate5days: '', rate6days: '', rate7days: '', rate15days: '', rate1month: '', rate3months: '',
};

export default function VehicleMaster({ profile, setActivePage }) {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [centres, setCentres] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ centre_id: '', active: 'true' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const [{ data: veh }, { data: types }, { data: ctrs }] = await Promise.all([
      supabase.from('vehicles').select('*, vehicle_types(name), centres(name, is_franchise)'),
      supabase.from('vehicle_types').select('id, name').order('name'),
      supabase.from('centres').select('id, name, is_franchise').order('name'),
    ]);
    const sorted = (veh || []).sort((a, b) => {
      const ta = a.vehicle_types?.name || '';
      const tb = b.vehicle_types?.name || '';
      if (ta !== tb) return ta.localeCompare(tb);
      return (a.registration_number || '').localeCompare(b.registration_number || '');
    });
    setVehicles(sorted);
    setVehicleTypes(types || []);
    setCentres(ctrs || []);
  }

  function startEdit(v) {
    const companyCentreId = centres.find(c => !c.is_franchise)?.id;
    const isCompany = v.centres && !v.centres.is_franchise;
    const normalisedId = isCompany && companyCentreId ? String(companyCentreId) : (v.centre_id ? String(v.centre_id) : '');
    setEditingId(v.id);
    setEditForm({ centre_id: normalisedId, active: String(v.active) });
  }

  async function saveEdit(id) {
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('vehicles').update({
      centre_id: editForm.centre_id ? parseInt(editForm.centre_id) : null,
      active: editForm.active === 'true',
    }).eq('id', id);
    if (err) setError(err.message);
    else { setEditingId(null); await loadData(); }
    setSaving(false);
  }

  async function saveAdd() {
    if (!addForm.registration_number.trim() || !addForm.vehicle_type_id || !addForm.centre_id) {
      alert('Please fill Registration Number, Vehicle Type, and Centre');
      return;
    }
    if (addForm.isNewType) {
      const rateFields = ['rate3hr','rate6hr','rate12hr','rate1day','rate2days','rate3days','rate4days','rate5days','rate6days','rate7days','rate15days','rate1month','rate3months'];
      if (!addForm.newTypeName.trim() || !addForm.newTypeDeposit || !addForm.newTypeLateCharge || rateFields.some(f => addForm[f] === '')) {
        alert('Please fill all vehicle type fields including all 13 rates');
        return;
      }
    }
    setSaving(true);
    setError('');

    let vehicleTypeId = parseInt(addForm.vehicle_type_id);

    if (addForm.isNewType) {
      const { data: newType, error: typeErr } = await supabase.from('vehicle_types').insert({
        name: addForm.newTypeName.trim(),
        security_deposit: parseInt(addForm.newTypeDeposit),
        late_charge_per_hour: parseInt(addForm.newTypeLateCharge),
        rate_3hr: parseInt(addForm.rate3hr),
        rate_6hr: parseInt(addForm.rate6hr),
        rate_12hr: parseInt(addForm.rate12hr),
        rate_1day: parseInt(addForm.rate1day),
        rate_2days: parseInt(addForm.rate2days),
        rate_3days: parseInt(addForm.rate3days),
        rate_4days: parseInt(addForm.rate4days),
        rate_5days: parseInt(addForm.rate5days),
        rate_6days: parseInt(addForm.rate6days),
        rate_7days: parseInt(addForm.rate7days),
        rate_15days: parseInt(addForm.rate15days),
        rate_1month: parseInt(addForm.rate1month),
        rate_3months: parseInt(addForm.rate3months),
      }).select('id').single();
      if (typeErr) { setError(typeErr.message); setSaving(false); return; }
      vehicleTypeId = newType.id;
    }

    const { error: err } = await supabase.from('vehicles').insert({
      registration_number: addForm.registration_number.trim().toUpperCase(),
      vehicle_type_id: vehicleTypeId,
      centre_id: parseInt(addForm.centre_id),
      active: true,
    });
    if (err) setError(err.message);
    else {
      setShowAddForm(false);
      setAddForm(emptyAdd);
      await loadData();
    }
    setSaving(false);
  }

  function handleTypeChange(val) {
    setAddForm(p => ({
      ...p,
      vehicle_type_id: val,
      isNewType: val === '__new__',
      ...(val !== '__new__' ? {
        newTypeName: '', newTypeDeposit: '', newTypeLateCharge: '',
        rate3hr: '', rate6hr: '', rate12hr: '', rate1day: '', rate2days: '', rate3days: '',
        rate4days: '', rate5days: '', rate6days: '', rate7days: '', rate15days: '', rate1month: '', rate3months: '',
      } : {}),
    }));
  }

  const rateLabels = [
    ['rate3hr','3 Hr'], ['rate6hr','6 Hr'], ['rate12hr','12 Hr'], ['rate1day','1 Day'],
    ['rate2days','2 Days'], ['rate3days','3 Days'], ['rate4days','4 Days'], ['rate5days','5 Days'],
    ['rate6days','6 Days'], ['rate7days','7 Days'], ['rate15days','15 Days'], ['rate1month','1 Month'],
    ['rate3months','3 Months'],
  ];

  return (
    <div className="br-page">

      {/* HEADER */}
      <div className="br-header">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a56a0' }}>Banjara Ride</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>Vehicle Master</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => setActivePage('bookings')} style={btnSecondary}>
            ← Bookings
          </button>
          <button
            onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
            style={btnPrimary}
          >
            {showAddForm ? 'Cancel' : '+ Add Vehicle'}
          </button>
          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #e5e7eb', paddingLeft: '12px' }}>
              <span style={{ fontSize: '13px', color: '#555' }}>
                <strong>{profile.display_name}</strong>
              </span>
              <button onClick={() => supabase.auth.signOut()} style={{ ...btnSecondary, fontSize: '12px', padding: '6px 10px' }}>
                Log out
              </button>
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

      {/* ADD FORM */}
      {showAddForm && (
        <div className="br-form-card" style={{ borderLeft: '4px solid #059669' }}>
          <h2 style={{ marginBottom: '20px', color: '#1a56a0', fontSize: '18px' }}>Add New Vehicle</h2>
          <div className="br-grid-3">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Registration Number *</label>
              <input
                type="text"
                value={addForm.registration_number}
                onChange={e => setAddForm(p => ({ ...p, registration_number: e.target.value }))}
                style={input}
                placeholder="e.g. MP04XX9999"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Vehicle Type *</label>
              <select value={addForm.vehicle_type_id} onChange={e => handleTypeChange(e.target.value)} style={input}>
                <option value="">Select...</option>
                <option value="__new__">+ Add new type...</option>
                {vehicleTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Group *</label>
              <select value={addForm.centre_id} onChange={e => setAddForm(p => ({ ...p, centre_id: e.target.value }))} style={input}>
                <option value="">Select...</option>
                {centres.filter(c => !c.is_franchise).length > 0 && (
                  <option value={String(centres.find(c => !c.is_franchise).id)}>Company Owned</option>
                )}
                {centres.filter(c => c.is_franchise).map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* NEW VEHICLE TYPE SUB-SECTION */}
          {addForm.isNewType && (
            <div style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#065f46', marginBottom: '14px' }}>New Vehicle Type Details</p>
              <div className="br-grid-3" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>Type Name *</label>
                  <input
                    type="text"
                    value={addForm.newTypeName}
                    onChange={e => setAddForm(p => ({ ...p, newTypeName: e.target.value }))}
                    style={input}
                    placeholder="e.g. Pulsar NS 125"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>Security Deposit ₹ *</label>
                  <input
                    type="number"
                    value={addForm.newTypeDeposit}
                    onChange={e => setAddForm(p => ({ ...p, newTypeDeposit: e.target.value }))}
                    style={input}
                    placeholder="e.g. 800"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>Late Charge / Hr ₹ *</label>
                  <input
                    type="number"
                    value={addForm.newTypeLateCharge}
                    onChange={e => setAddForm(p => ({ ...p, newTypeLateCharge: e.target.value }))}
                    style={input}
                    placeholder="e.g. 65"
                  />
                </div>
              </div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rates ₹ (all required)</p>
              <div className="br-grid-4">
                {rateLabels.map(([field, label]) => (
                  <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={labelStyle}>{label}</label>
                    <input
                      type="number"
                      value={addForm[field]}
                      onChange={e => setAddForm(p => ({ ...p, [field]: e.target.value }))}
                      style={input}
                      placeholder="₹"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button onClick={() => { setShowAddForm(false); setAddForm(emptyAdd); }} style={btnSecondary}>Cancel</button>
            <button onClick={saveAdd} disabled={saving} style={{ ...btnPrimary, background: '#059669', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Add Vehicle'}
            </button>
          </div>
        </div>
      )}

      {/* VEHICLE TABLE */}
      <div className="br-form-card">
        <h2 style={{ marginBottom: '16px', color: '#1a56a0', fontSize: '18px' }}>
          All Vehicles ({vehicles.length})
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['Registration No.', 'Vehicle Type', 'Group', 'Status', 'Edit'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading vehicles...</td></tr>
              ) : vehicles.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{v.registration_number}</td>
                  <td style={tdStyle}>{v.vehicle_types?.name || '—'}</td>
                  <td style={tdStyle}>
                    {editingId === v.id ? (
                      <select
                        value={editForm.centre_id}
                        onChange={e => setEditForm(p => ({ ...p, centre_id: e.target.value }))}
                        style={{ ...input, width: '180px' }}
                      >
                        <option value="">— Unassigned —</option>
                        {centres.filter(c => !c.is_franchise).length > 0 && (
                          <option value={String(centres.find(c => !c.is_franchise).id)}>Company Owned</option>
                        )}
                        {centres.filter(c => c.is_franchise).map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      v.centres
                        ? (v.centres.is_franchise ? v.centres.name : 'Company Owned')
                        : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Unassigned</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingId === v.id ? (
                      <select
                        value={editForm.active}
                        onChange={e => setEditForm(p => ({ ...p, active: e.target.value }))}
                        style={{ ...input, width: '100px' }}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    ) : (
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                        background: v.active ? '#d1fae5' : '#fee2e2',
                        color: v.active ? '#065f46' : '#991b1b',
                      }}>
                        {v.active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingId === v.id ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => saveEdit(v.id)} disabled={saving} style={{ ...btnPrimary, padding: '5px 14px', fontSize: '12px', opacity: saving ? 0.7 : 1 }}>
                          {saving ? '...' : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(v)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
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
