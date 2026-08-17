import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const emptyAdd = {
  registration_number: '', vehicle_type_id: '', rate_group_id: '', centre_id: '', isNewType: false,
  newTypeName: '', newTypeDeposit: '', newTypeLateCharge: '',
  rate3hr: '', rate6hr: '', rate12hr: '', rate1day: '', rate2days: '', rate3days: '',
  rate4days: '', rate5days: '', rate6days: '', rate7days: '', rate15days: '', rate1month: '', rate3months: '',
};

const emptyRateCard = {
  vehicle_type_id: '', rate_group_id: '', security_deposit: '', late_charge_per_hour: '',
  rate3hr: '', rate6hr: '', rate12hr: '', rate1day: '', rate2days: '', rate3days: '',
  rate4days: '', rate5days: '', rate6days: '', rate7days: '', rate15days: '', rate1month: '', rate3months: '',
};

const rateLabels = [
  ['rate3hr','3 Hr'], ['rate6hr','6 Hr'], ['rate12hr','12 Hr'], ['rate1day','1 Day'],
  ['rate2days','2 Days'], ['rate3days','3 Days'], ['rate4days','4 Days'], ['rate5days','5 Days'],
  ['rate6days','6 Days'], ['rate7days','7 Days'], ['rate15days','15 Days'], ['rate1month','1 Month'],
  ['rate3months','3 Months'],
];

const RATE_FIELD_TO_COLUMN = Object.fromEntries(rateLabels.map(([field]) => [field, 'rate_' + field.slice(4)]));

function rateFormToPayload(form) {
  const payload = {
    security_deposit: parseInt(form.security_deposit) || 0,
    late_charge_per_hour: parseInt(form.late_charge_per_hour) || 0,
  };
  rateLabels.forEach(([field]) => {
    const col = RATE_FIELD_TO_COLUMN[field];
    payload[col] = form[field] === '' ? null : parseInt(form[field]);
  });
  return payload;
}

export default function VehicleMaster({ profile, setActivePage }) {
  const isOwner = profile?.role === 'super_admin';

  const [vehicles, setVehicles] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [centres, setCentres] = useState([]);
  const [rateGroups, setRateGroups] = useState([]);
  const [vehicleTypeRates, setVehicleTypeRates] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ registration_number: '', vehicle_type_id: '', rate_group_id: '', centre_id: '', active: 'true' });
  const [editError, setEditError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd);
  const [showAddRateCard, setShowAddRateCard] = useState(false);
  const [addRateCardForm, setAddRateCardForm] = useState(emptyRateCard);
  const [editingRateCardId, setEditingRateCardId] = useState(null);
  const [editRateCardForm, setEditRateCardForm] = useState(emptyRateCard);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const [{ data: veh }, { data: types }, { data: ctrs }, { data: rgs }, { data: vtr }] = await Promise.all([
      supabase.from('vehicles').select('*, vehicle_types(name), centres(name, is_franchise), rate_groups(name)'),
      supabase.from('vehicle_types').select('id, name').order('name'),
      supabase.from('centres').select('id, name, is_franchise').order('name'),
      supabase.from('rate_groups').select('id, name').order('name'),
      supabase.from('vehicle_type_rates').select('*'),
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
    setRateGroups(rgs || []);
    setVehicleTypeRates(vtr || []);
  }

  function defaultRateGroupForCentre(centreIdStr) {
    const centre = centres.find(c => String(c.id) === centreIdStr);
    if (!centre) return '';
    const wantName = centre.is_franchise ? 'IISER' : 'Company Owned';
    const rg = rateGroups.find(r => r.name === wantName);
    return rg ? String(rg.id) : '';
  }

  function startEdit(v) {
    const companyCentreId = centres.find(c => !c.is_franchise)?.id;
    const isCompany = v.centres && !v.centres.is_franchise;
    const normalisedId = isCompany && companyCentreId ? String(companyCentreId) : (v.centre_id ? String(v.centre_id) : '');
    setEditingId(v.id);
    setEditForm({
      registration_number: v.registration_number,
      vehicle_type_id: String(v.vehicle_type_id),
      rate_group_id: v.rate_group_id ? String(v.rate_group_id) : '',
      centre_id: normalisedId,
      active: String(v.active),
    });
    setEditError('');
  }

  async function saveEdit(id) {
    const reg = editForm.registration_number.trim().toUpperCase();
    if (!reg) { setEditError('Registration number cannot be blank'); return; }
    const duplicate = vehicles.some(v => v.id !== id && v.registration_number.toUpperCase() === reg);
    if (duplicate) { setEditError('This registration number is already in use'); return; }

    setSaving(true);
    setEditError('');
    const payload = {
      registration_number: reg,
      active: editForm.active === 'true',
    };
    if (isOwner) {
      payload.vehicle_type_id = parseInt(editForm.vehicle_type_id);
      payload.rate_group_id = editForm.rate_group_id ? parseInt(editForm.rate_group_id) : null;
      payload.centre_id = editForm.centre_id ? parseInt(editForm.centre_id) : null;
    }
    const { error: err } = await supabase.from('vehicles').update(payload).eq('id', id);
    if (err) setEditError(err.message);
    else { setEditingId(null); await loadData(); }
    setSaving(false);
  }

  async function saveAdd() {
    if (!addForm.registration_number.trim() || !addForm.vehicle_type_id || !addForm.centre_id || !addForm.rate_group_id) {
      alert('Please fill Registration Number, Vehicle Type, Rate Group, and Centre');
      return;
    }
    if (addForm.isNewType) {
      const rateFields = rateLabels.map(([f]) => f);
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
      }).select('id').single();
      if (typeErr) { setError(typeErr.message); setSaving(false); return; }
      vehicleTypeId = newType.id;

      const { error: rateErr } = await supabase.from('vehicle_type_rates').insert({
        vehicle_type_id: vehicleTypeId,
        rate_group_id: parseInt(addForm.rate_group_id),
        ...rateFormToPayload({ ...addForm, security_deposit: addForm.newTypeDeposit, late_charge_per_hour: addForm.newTypeLateCharge }),
      });
      if (rateErr) { setError(rateErr.message); setSaving(false); return; }
    }

    const { error: err } = await supabase.from('vehicles').insert({
      registration_number: addForm.registration_number.trim().toUpperCase(),
      vehicle_type_id: vehicleTypeId,
      rate_group_id: parseInt(addForm.rate_group_id),
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

  async function saveAddRateCard() {
    if (!addRateCardForm.vehicle_type_id || !addRateCardForm.rate_group_id) {
      alert('Please select Vehicle Type and Rate Group');
      return;
    }
    const rateFields = rateLabels.map(([f]) => f);
    if (!addRateCardForm.security_deposit || !addRateCardForm.late_charge_per_hour || rateFields.some(f => addRateCardForm[f] === '')) {
      alert('Please fill deposit, late charge, and all 13 rates');
      return;
    }
    const dup = vehicleTypeRates.some(r =>
      String(r.vehicle_type_id) === addRateCardForm.vehicle_type_id && String(r.rate_group_id) === addRateCardForm.rate_group_id
    );
    if (dup) { alert('A rate card for this Vehicle Type + Rate Group combination already exists'); return; }

    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('vehicle_type_rates').insert({
      vehicle_type_id: parseInt(addRateCardForm.vehicle_type_id),
      rate_group_id: parseInt(addRateCardForm.rate_group_id),
      ...rateFormToPayload(addRateCardForm),
    });
    if (err) setError(err.message);
    else { setShowAddRateCard(false); setAddRateCardForm(emptyRateCard); await loadData(); }
    setSaving(false);
  }

  function startEditRateCard(r) {
    setEditingRateCardId(r.id);
    const form = { security_deposit: String(r.security_deposit ?? ''), late_charge_per_hour: String(r.late_charge_per_hour ?? '') };
    rateLabels.forEach(([field]) => {
      const col = RATE_FIELD_TO_COLUMN[field];
      form[field] = r[col] === null || r[col] === undefined ? '' : String(r[col]);
    });
    setEditRateCardForm(form);
  }

  async function saveEditRateCard(id) {
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('vehicle_type_rates').update(rateFormToPayload(editRateCardForm)).eq('id', id);
    if (err) setError(err.message);
    else { setEditingRateCardId(null); await loadData(); }
    setSaving(false);
  }

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
          {isOwner && (
            <button
              onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
              style={btnPrimary}
            >
              {showAddForm ? 'Cancel' : '+ Add Vehicle'}
            </button>
          )}
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
      {isOwner && showAddForm && (
        <div className="br-form-card" style={{ borderLeft: '4px solid #059669' }}>
          <h2 style={{ marginBottom: '20px', color: '#1a56a0', fontSize: '18px' }}>Add New Vehicle</h2>
          <div className="br-grid-4">
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
              <select value={addForm.centre_id} onChange={e => {
                const val = e.target.value;
                setAddForm(p => ({ ...p, centre_id: val, rate_group_id: defaultRateGroupForCentre(val) }));
              }} style={input}>
                <option value="">Select...</option>
                {centres.filter(c => !c.is_franchise).length > 0 && (
                  <option value={String(centres.find(c => !c.is_franchise).id)}>Company Owned</option>
                )}
                {centres.filter(c => c.is_franchise).map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Rate Group *</label>
              <select value={addForm.rate_group_id} onChange={e => setAddForm(p => ({ ...p, rate_group_id: e.target.value }))} style={input}>
                <option value="">Select...</option>
                {rateGroups.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          {/* NEW VEHICLE TYPE SUB-SECTION */}
          {addForm.isNewType && (
            <div style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#065f46', marginBottom: '14px' }}>New Vehicle Type Details</p>
              <p style={{ fontSize: '12px', color: '#065f46', marginBottom: '14px' }}>
                Rates below are saved for the <strong>{rateGroups.find(r => String(r.id) === addForm.rate_group_id)?.name || 'selected'}</strong> rate group only. Add another rate card later for other groups.
              </p>
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
                {['Registration No.', 'Vehicle Type', 'Group', 'Rate Group', 'Status', 'Edit'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading vehicles...</td></tr>
              ) : vehicles.map((v, i) => {
                const editing = editingId === v.id;
                return (
                <tr key={v.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.registration_number}
                        onChange={e => setEditForm(p => ({ ...p, registration_number: e.target.value }))}
                        style={{ ...input, width: '150px' }}
                      />
                    ) : v.registration_number}
                  </td>
                  <td style={tdStyle}>
                    {editing && isOwner ? (
                      <select
                        value={editForm.vehicle_type_id}
                        onChange={e => setEditForm(p => ({ ...p, vehicle_type_id: e.target.value }))}
                        style={{ ...input, width: '160px' }}
                      >
                        {vehicleTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (v.vehicle_types?.name || '—')}
                  </td>
                  <td style={tdStyle}>
                    {editing && isOwner ? (
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
                    {editing && isOwner ? (
                      <select
                        value={editForm.rate_group_id}
                        onChange={e => setEditForm(p => ({ ...p, rate_group_id: e.target.value }))}
                        style={{ ...input, width: '150px' }}
                      >
                        <option value="">— None —</option>
                        {rateGroups.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    ) : (v.rate_groups?.name || <span style={{ color: '#aaa', fontStyle: 'italic' }}>None</span>)}
                  </td>
                  <td style={tdStyle}>
                    {editing ? (
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
                    {editing ? (
                      <div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => saveEdit(v.id)} disabled={saving} style={{ ...btnPrimary, padding: '5px 14px', fontSize: '12px', opacity: saving ? 0.7 : 1 }}>
                            {saving ? '...' : 'Save'}
                          </button>
                          <button onClick={() => { setEditingId(null); setEditError(''); }} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Cancel</button>
                        </div>
                        {editError && <div style={{ color: '#991b1b', fontSize: '11px', marginTop: '4px' }}>{editError}</div>}
                      </div>
                    ) : (
                      <button onClick={() => startEdit(v)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Edit</button>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RATE CARDS (super_admin only) */}
      {isOwner && (
        <div className="br-form-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ color: '#1a56a0', fontSize: '18px' }}>Rate Cards ({vehicleTypeRates.length})</h2>
            <button onClick={() => { setShowAddRateCard(v => !v); setEditingRateCardId(null); }} style={btnPrimary}>
              {showAddRateCard ? 'Cancel' : '+ Add Rate Card'}
            </button>
          </div>

          {showAddRateCard && (
            <div style={{ marginBottom: '20px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div className="br-grid-4" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>Vehicle Type *</label>
                  <select value={addRateCardForm.vehicle_type_id} onChange={e => setAddRateCardForm(p => ({ ...p, vehicle_type_id: e.target.value }))} style={input}>
                    <option value="">Select...</option>
                    {vehicleTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>Rate Group *</label>
                  <select value={addRateCardForm.rate_group_id} onChange={e => setAddRateCardForm(p => ({ ...p, rate_group_id: e.target.value }))} style={input}>
                    <option value="">Select...</option>
                    {rateGroups.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>Security Deposit ₹ *</label>
                  <input type="number" value={addRateCardForm.security_deposit} onChange={e => setAddRateCardForm(p => ({ ...p, security_deposit: e.target.value }))} style={input} placeholder="e.g. 800" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>Late Charge / Hr ₹ *</label>
                  <input type="number" value={addRateCardForm.late_charge_per_hour} onChange={e => setAddRateCardForm(p => ({ ...p, late_charge_per_hour: e.target.value }))} style={input} placeholder="e.g. 65" />
                </div>
              </div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rates ₹ (all required)</p>
              <div className="br-grid-4" style={{ marginBottom: '14px' }}>
                {rateLabels.map(([field, label]) => (
                  <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={labelStyle}>{label}</label>
                    <input type="number" value={addRateCardForm[field]} onChange={e => setAddRateCardForm(p => ({ ...p, [field]: e.target.value }))} style={input} placeholder="₹" />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowAddRateCard(false); setAddRateCardForm(emptyRateCard); }} style={btnSecondary}>Cancel</button>
                <button onClick={saveAddRateCard} disabled={saving} style={{ ...btnPrimary, background: '#059669', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : 'Add Rate Card'}
                </button>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Vehicle Type', 'Rate Group', 'Deposit ₹', 'Late/hr ₹', ...rateLabels.map(([, l]) => l), 'Edit'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicleTypeRates.length === 0 ? (
                  <tr><td colSpan={17} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No rate cards yet.</td></tr>
                ) : vehicleTypeRates.map((r, i) => {
                  const editing = editingRateCardId === r.id;
                  const typeName = vehicleTypes.find(t => t.id === r.vehicle_type_id)?.name || '—';
                  const groupName = rateGroups.find(g => g.id === r.rate_group_id)?.name || '—';
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                      <td style={{ ...tdStyle, fontWeight: '600' }}>{typeName}</td>
                      <td style={tdStyle}>{groupName}</td>
                      <td style={tdStyle}>
                        {editing ? <input type="number" value={editRateCardForm.security_deposit} onChange={e => setEditRateCardForm(p => ({ ...p, security_deposit: e.target.value }))} style={{ ...input, width: '80px' }} /> : `₹${r.security_deposit}`}
                      </td>
                      <td style={tdStyle}>
                        {editing ? <input type="number" value={editRateCardForm.late_charge_per_hour} onChange={e => setEditRateCardForm(p => ({ ...p, late_charge_per_hour: e.target.value }))} style={{ ...input, width: '80px' }} /> : `₹${r.late_charge_per_hour}`}
                      </td>
                      {rateLabels.map(([field]) => {
                        const col = RATE_FIELD_TO_COLUMN[field];
                        return (
                          <td key={field} style={tdStyle}>
                            {editing ? (
                              <input type="number" value={editRateCardForm[field]} onChange={e => setEditRateCardForm(p => ({ ...p, [field]: e.target.value }))} style={{ ...input, width: '70px' }} />
                            ) : (r[col] === null || r[col] === undefined ? '—' : `₹${r[col]}`)}
                          </td>
                        );
                      })}
                      <td style={tdStyle}>
                        {editing ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => saveEditRateCard(r.id)} disabled={saving} style={{ ...btnPrimary, padding: '5px 14px', fontSize: '12px', opacity: saving ? 0.7 : 1 }}>
                              {saving ? '...' : 'Save'}
                            </button>
                            <button onClick={() => setEditingRateCardId(null)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => startEditRateCard(r)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Edit</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = { fontSize: '12px', color: '#666', fontWeight: '500' };
const input = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', outline: 'none' };
const tdStyle = { padding: '10px 12px', color: '#333', whiteSpace: 'nowrap' };
const th = { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#1a56a0', whiteSpace: 'nowrap', borderBottom: '2px solid #1a56a0', background: '#f0f4ff' };
const btnPrimary = { background: '#1a56a0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' };
const btnSecondary = { padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '14px' };
