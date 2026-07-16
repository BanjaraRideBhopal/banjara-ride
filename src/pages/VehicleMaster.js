import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function VehicleMaster({ profile, setActivePage }) {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [centres, setCentres] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ centre_id: '', active: 'true' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ registration_number: '', vehicle_type_id: '', centre_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const [{ data: veh }, { data: types }, { data: ctrs }] = await Promise.all([
      supabase.from('vehicles').select('*, vehicle_types(name), centres(name)'),
      supabase.from('vehicle_types').select('id, name').order('name'),
      supabase.from('centres').select('id, name').order('name'),
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
    setEditingId(v.id);
    setEditForm({ centre_id: v.centre_id ? String(v.centre_id) : '', active: String(v.active) });
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
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('vehicles').insert({
      registration_number: addForm.registration_number.trim().toUpperCase(),
      vehicle_type_id: parseInt(addForm.vehicle_type_id),
      centre_id: parseInt(addForm.centre_id),
      active: true,
    });
    if (err) setError(err.message);
    else {
      setShowAddForm(false);
      setAddForm({ registration_number: '', vehicle_type_id: '', centre_id: '' });
      await loadData();
    }
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
              <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Registration Number *</label>
              <input
                type="text"
                value={addForm.registration_number}
                onChange={e => setAddForm(p => ({ ...p, registration_number: e.target.value }))}
                style={input}
                placeholder="e.g. MP04XX9999"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Vehicle Type *</label>
              <select value={addForm.vehicle_type_id} onChange={e => setAddForm(p => ({ ...p, vehicle_type_id: e.target.value }))} style={input}>
                <option value="">Select...</option>
                {vehicleTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Centre *</label>
              <select value={addForm.centre_id} onChange={e => setAddForm(p => ({ ...p, centre_id: e.target.value }))} style={input}>
                <option value="">Select...</option>
                {centres.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button onClick={() => { setShowAddForm(false); setAddForm({ registration_number: '', vehicle_type_id: '', centre_id: '' }); }} style={btnSecondary}>Cancel</button>
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
                {['Registration No.', 'Vehicle Type', 'Centre', 'Status', 'Edit'].map(h => (
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
                        style={{ ...input, width: '200px' }}
                      >
                        <option value="">— Unassigned —</option>
                        {centres.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                      </select>
                    ) : (
                      v.centres?.name || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Unassigned</span>
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

const input = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', outline: 'none' };
const tdStyle = { padding: '10px 12px', color: '#333', whiteSpace: 'nowrap' };
const th = { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#1a56a0', whiteSpace: 'nowrap', borderBottom: '2px solid #1a56a0', background: '#f0f4ff' };
const btnPrimary = { background: '#1a56a0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' };
const btnSecondary = { padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '14px' };
