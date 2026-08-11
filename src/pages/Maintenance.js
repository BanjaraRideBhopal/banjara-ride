import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

function getToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

const expenseTypeOptions = ['Fuel', 'Parts', 'Labour', 'Insurance', 'Battery', 'Other'];

const emptyExpenseForm = { expense_date: getToday(), expense_type: '', amount: '', description: '' };
const emptyInsuranceForm = { last_renewed: '', next_due: '', notes: '' };
const emptyBatteryForm = { replaced_date: getToday(), next_due: '', notes: '' };

export default function Maintenance({ profile, setActivePage }) {
  const isOwner = profile?.role === 'super_admin';

  const [vehicles, setVehicles] = useState([]);
  const [centres, setCentres] = useState([]);
  const [centreFilter, setCentreFilter] = useState('all');
  const [insuranceByVehicle, setInsuranceByVehicle] = useState({});
  const [selectedVehicleType, setSelectedVehicleType] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  const [expenses, setExpenses] = useState([]);
  const [insuranceHistory, setInsuranceHistory] = useState([]);
  const [batteryHistory, setBatteryHistory] = useState([]);

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [insuranceForm, setInsuranceForm] = useState(emptyInsuranceForm);
  const [showBatteryForm, setShowBatteryForm] = useState(false);
  const [batteryForm, setBatteryForm] = useState(emptyBatteryForm);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const companyCentreIds = centres.filter(c => !c.is_franchise).map(c => c.id);
  const franchiseCentres = centres.filter(c => c.is_franchise);
  const vehicleTypeNames = Array.from(new Set(vehicles.map(v => v.vehicle_types?.name).filter(Boolean))).sort();
  const vehiclesOfSelectedType = vehicles.filter(v => v.vehicle_types?.name === selectedVehicleType);

  useEffect(() => {
    loadCentres();
    loadVehicles();
    loadInsuranceStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCentres() {
    const { data } = await supabase.from('centres').select('id, name, is_franchise');
    setCentres(data || []);
  }

  async function loadVehicles(cf = centreFilter) {
    let query = supabase.from('vehicles').select('*, vehicle_types(name)').eq('active', true).order('registration_number');
    if (isOwner && cf === 'company') query = query.in('centre_id', companyCentreIds);
    else if (isOwner && cf !== 'all') query = query.eq('centre_id', cf);
    const { data } = await query;
    setVehicles(data || []);
  }

  async function loadInsuranceStatus() {
    const { data } = await supabase.from('insurance_records').select('*').order('created_at', { ascending: false });
    const map = {};
    (data || []).forEach(r => { if (!map[r.vehicle_id]) map[r.vehicle_id] = r; });
    setInsuranceByVehicle(map);
  }

  async function loadVehicleRecords(vehicleId) {
    const [{ data: exp }, { data: ins }, { data: bat }] = await Promise.all([
      supabase.from('maintenance_expenses').select('*').eq('vehicle_id', vehicleId).order('expense_date', { ascending: false }),
      supabase.from('insurance_records').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
      supabase.from('battery_records').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    ]);
    setExpenses(exp || []);
    setInsuranceHistory(ins || []);
    setBatteryHistory(bat || []);
  }

  function selectVehicle(v) {
    setSelectedVehicleId(v.id);
    setShowExpenseForm(false);
    setShowInsuranceForm(false);
    setShowBatteryForm(false);
    setError('');
    loadVehicleRecords(v.id);
  }

  function insuranceBadge(vehicleId) {
    const rec = insuranceByVehicle[vehicleId];
    if (!rec) return { label: 'No Record', bg: '#f3f4f6', color: '#6b7280' };
    const today = getToday();
    if (rec.next_due < today) return { label: 'Overdue', bg: '#fee2e2', color: '#991b1b' };
    if (rec.next_due <= addDays(today, 7)) return { label: 'Due Soon', bg: '#fef3c7', color: '#92400e' };
    return { label: 'Valid', bg: '#d1fae5', color: '#065f46' };
  }

  async function handleDeleteExpense(id) {
    if (!window.confirm('Delete this maintenance entry? This cannot be undone.')) return;
    const { error: err } = await supabase.from('maintenance_expenses').delete().eq('id', id);
    if (err) { alert('Delete failed: ' + err.message); return; }
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  async function handleDeleteInsurance(id) {
    if (!window.confirm('Delete this insurance record? This cannot be undone.')) return;
    const { error: err } = await supabase.from('insurance_records').delete().eq('id', id);
    if (err) { alert('Delete failed: ' + err.message); return; }
    setInsuranceHistory(prev => prev.filter(r => r.id !== id));
    loadInsuranceStatus();
  }

  async function handleDeleteBattery(id) {
    if (!window.confirm('Delete this battery record? This cannot be undone.')) return;
    const { error: err } = await supabase.from('battery_records').delete().eq('id', id);
    if (err) { alert('Delete failed: ' + err.message); return; }
    setBatteryHistory(prev => prev.filter(r => r.id !== id));
  }

  async function saveExpense() {
    if (!expenseForm.expense_date || !expenseForm.expense_type || !expenseForm.amount) {
      alert('Please fill Date, Type, and Amount');
      return;
    }
    setSaving(true);
    setError('');
    const centre_id = selectedVehicle.centre_id;
    const { error: err } = await supabase.from('maintenance_expenses').insert({
      vehicle_id: selectedVehicle.id,
      centre_id,
      expense_date: expenseForm.expense_date,
      expense_type: expenseForm.expense_type,
      amount: parseFloat(expenseForm.amount),
      description: expenseForm.description || null,
    });
    if (err) setError('Failed to save expense: ' + err.message);
    else {
      setExpenseForm(emptyExpenseForm);
      setShowExpenseForm(false);
      loadVehicleRecords(selectedVehicle.id);
    }
    setSaving(false);
  }

  async function saveInsurance() {
    if (!insuranceForm.last_renewed || !insuranceForm.next_due) {
      alert('Please fill Last Renewed and Next Due dates');
      return;
    }
    setSaving(true);
    setError('');
    const centre_id = selectedVehicle.centre_id;
    const { error: err } = await supabase.from('insurance_records').insert({
      vehicle_id: selectedVehicle.id,
      centre_id,
      last_renewed: insuranceForm.last_renewed,
      next_due: insuranceForm.next_due,
      notes: insuranceForm.notes || null,
    });
    if (err) setError('Failed to save insurance record: ' + err.message);
    else {
      setInsuranceForm(emptyInsuranceForm);
      setShowInsuranceForm(false);
      await Promise.all([loadVehicleRecords(selectedVehicle.id), loadInsuranceStatus()]);
    }
    setSaving(false);
  }

  async function saveBattery() {
    if (!batteryForm.replaced_date) {
      alert('Please fill Replaced Date');
      return;
    }
    setSaving(true);
    setError('');
    const centre_id = selectedVehicle.centre_id;
    const { error: err } = await supabase.from('battery_records').insert({
      vehicle_id: selectedVehicle.id,
      centre_id,
      replaced_date: batteryForm.replaced_date,
      next_due: batteryForm.next_due || null,
      notes: batteryForm.notes || null,
    });
    if (err) setError('Failed to save battery record: ' + err.message);
    else {
      setBatteryForm(emptyBatteryForm);
      setShowBatteryForm(false);
      loadVehicleRecords(selectedVehicle.id);
    }
    setSaving(false);
  }

  return (
    <div className="br-page">

      {/* HEADER */}
      <div className="br-header">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a56a0' }}>Banjara Ride</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>Vehicle Maintenance</p>
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

      {/* CENTRE SWITCHER (super_admin only) */}
      {isOwner && (
        <div className="br-filter">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Centre</label>
            <div className="br-centre-tabs">
              <button
                className={`br-centre-tab${centreFilter === 'all' ? ' active' : ''}`}
                onClick={() => { setCentreFilter('all'); loadVehicles('all'); setSelectedVehicleType(''); setSelectedVehicleId(null); }}
              >
                All Centres
              </button>
              {companyCentreIds.length > 0 && (
                <button
                  className={`br-centre-tab${centreFilter === 'company' ? ' active' : ''}`}
                  onClick={() => { setCentreFilter('company'); loadVehicles('company'); setSelectedVehicleType(''); setSelectedVehicleId(null); }}
                >
                  Company Owned
                </button>
              )}
              {franchiseCentres.map(c => (
                <button
                  key={c.id}
                  className={`br-centre-tab${centreFilter === c.id ? ' active' : ''}`}
                  onClick={() => { setCentreFilter(c.id); loadVehicles(c.id); setSelectedVehicleType(''); setSelectedVehicleId(null); }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VEHICLE LIST — Type then Number, to avoid listing all vehicles at once */}
      <div className="br-form-card">
        <h2 style={{ marginBottom: '16px', color: '#1a56a0', fontSize: '18px' }}>Vehicles ({vehicles.length})</h2>
        {vehicles.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>No vehicles at this centre yet.</p>
        ) : (
          <div className="br-grid-2">
            <Field label="Vehicle Type">
              <select
                value={selectedVehicleType}
                onChange={e => { setSelectedVehicleType(e.target.value); setSelectedVehicleId(null); }}
                style={input}
              >
                <option value="">Select...</option>
                {vehicleTypeNames.map(name => <option key={name}>{name}</option>)}
              </select>
            </Field>
            {selectedVehicleType && (
              <Field label="Vehicle Number">
                <select
                  value={selectedVehicleId || ''}
                  onChange={e => {
                    const v = vehiclesOfSelectedType.find(x => String(x.id) === e.target.value);
                    if (v) selectVehicle(v);
                    else setSelectedVehicleId(null);
                  }}
                  style={input}
                >
                  <option value="">Select...</option>
                  {vehiclesOfSelectedType.map(v => (
                    <option key={v.id} value={v.id}>{v.registration_number}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}
      </div>

      {/* VEHICLE DETAIL */}
      {selectedVehicle && (
        <div className="br-form-card">
          <h2 style={{ marginBottom: '4px', color: '#1a56a0', fontSize: '18px' }}>
            {selectedVehicle.registration_number} — {selectedVehicle.vehicle_types?.name || '—'}
          </h2>
          <p style={{ color: '#999', fontSize: '13px', marginBottom: '20px' }}>Maintenance history and status</p>

          {/* A — MAINTENANCE EXPENSES */}
          <SectionTitle title="Maintenance Expenses" />
          {expenses.length === 0 ? (
            <p style={{ color: '#999', fontSize: '13px', marginBottom: '12px' }}>No expenses logged yet.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Type</th>
                    <th style={th}>Amount ₹</th>
                    <th style={th}>Description</th>
                    {isOwner && <th style={th}></th>}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id}>
                      <td style={td}>{e.expense_date}</td>
                      <td style={td}>{e.expense_type}</td>
                      <td style={td}>₹{e.amount}</td>
                      <td style={td}>{e.description || '—'}</td>
                      {isOwner && <td style={td}><button onClick={() => handleDeleteExpense(e.id)} style={deleteBtn}>Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showExpenseForm && (
            <div className="br-grid-4" style={{ marginBottom: '12px' }}>
              <Field label="Expense Date">
                <input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(p => ({ ...p, expense_date: e.target.value }))} style={input} />
              </Field>
              <Field label="Type">
                <select value={expenseForm.expense_type} onChange={e => setExpenseForm(p => ({ ...p, expense_type: e.target.value }))} style={input}>
                  <option value="">Select...</option>
                  {expenseTypeOptions.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Amount ₹">
                <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} style={input} placeholder="0" />
              </Field>
              <Field label="Description">
                <input type="text" value={expenseForm.description} onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))} style={input} placeholder="Optional" />
              </Field>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            {showExpenseForm ? (
              <>
                <button onClick={saveExpense} disabled={saving} style={{ ...btnPrimary, padding: '8px 16px', fontSize: '13px', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => { setShowExpenseForm(false); setExpenseForm(emptyExpenseForm); }} style={{ ...btnSecondary, padding: '8px 16px', fontSize: '13px' }}>Cancel</button>
              </>
            ) : (
              <button onClick={() => setShowExpenseForm(true)} style={{ ...btnSecondary, padding: '8px 16px', fontSize: '13px' }}>+ Add Expense</button>
            )}
          </div>

          {/* B — INSURANCE STATUS */}
          <SectionTitle title="Insurance Status" />
          {insuranceHistory.length > 0 ? (
            <div style={{ ...rowStyle, marginBottom: '8px', fontWeight: '600' }}>
              <span>Last Renewed: {insuranceHistory[0].last_renewed}</span>
              <span>Next Due: {insuranceHistory[0].next_due}</span>
              {(() => {
                const badge = insuranceBadge(selectedVehicle.id);
                return <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: badge.bg, color: badge.color }}>{badge.label}</span>;
              })()}
            </div>
          ) : (
            <p style={{ color: '#999', fontSize: '13px', marginBottom: '12px' }}>No insurance record yet.</p>
          )}
          {insuranceHistory.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Last Renewed</th>
                    <th style={th}>Next Due</th>
                    <th style={th}>Notes</th>
                    {isOwner && <th style={th}></th>}
                  </tr>
                </thead>
                <tbody>
                  {insuranceHistory.map(r => (
                    <tr key={r.id}>
                      <td style={td}>{r.last_renewed}</td>
                      <td style={td}>{r.next_due}</td>
                      <td style={td}>{r.notes || '—'}</td>
                      {isOwner && <td style={td}><button onClick={() => handleDeleteInsurance(r.id)} style={deleteBtn}>Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showInsuranceForm && (
            <div className="br-grid-3" style={{ marginBottom: '12px' }}>
              <Field label="Last Renewed">
                <input type="date" value={insuranceForm.last_renewed} onChange={e => setInsuranceForm(p => ({ ...p, last_renewed: e.target.value }))} style={input} />
              </Field>
              <Field label="Next Due">
                <input type="date" value={insuranceForm.next_due} onChange={e => setInsuranceForm(p => ({ ...p, next_due: e.target.value }))} style={input} />
              </Field>
              <Field label="Notes">
                <input type="text" value={insuranceForm.notes} onChange={e => setInsuranceForm(p => ({ ...p, notes: e.target.value }))} style={input} placeholder="Optional" />
              </Field>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            {showInsuranceForm ? (
              <>
                <button onClick={saveInsurance} disabled={saving} style={{ ...btnPrimary, padding: '8px 16px', fontSize: '13px', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => { setShowInsuranceForm(false); setInsuranceForm(emptyInsuranceForm); }} style={{ ...btnSecondary, padding: '8px 16px', fontSize: '13px' }}>Cancel</button>
              </>
            ) : (
              <button onClick={() => setShowInsuranceForm(true)} style={{ ...btnSecondary, padding: '8px 16px', fontSize: '13px' }}>+ Update Insurance</button>
            )}
          </div>

          {/* C — BATTERY STATUS */}
          <SectionTitle title="Battery Status" />
          {batteryHistory.length === 0 ? (
            <p style={{ color: '#999', fontSize: '13px', marginBottom: '12px' }}>No battery record yet.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Replaced Date</th>
                    <th style={th}>Next Due</th>
                    <th style={th}>Notes</th>
                    {isOwner && <th style={th}></th>}
                  </tr>
                </thead>
                <tbody>
                  {batteryHistory.map(r => (
                    <tr key={r.id}>
                      <td style={td}>{r.replaced_date}</td>
                      <td style={td}>{r.next_due || '—'}</td>
                      <td style={td}>{r.notes || '—'}</td>
                      {isOwner && <td style={td}><button onClick={() => handleDeleteBattery(r.id)} style={deleteBtn}>Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showBatteryForm && (
            <div className="br-grid-3" style={{ marginBottom: '12px' }}>
              <Field label="Replaced Date">
                <input type="date" value={batteryForm.replaced_date} onChange={e => setBatteryForm(p => ({ ...p, replaced_date: e.target.value }))} style={input} />
              </Field>
              <Field label="Next Due">
                <input type="date" value={batteryForm.next_due} onChange={e => setBatteryForm(p => ({ ...p, next_due: e.target.value }))} style={input} />
              </Field>
              <Field label="Notes">
                <input type="text" value={batteryForm.notes} onChange={e => setBatteryForm(p => ({ ...p, notes: e.target.value }))} style={input} placeholder="Optional" />
              </Field>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            {showBatteryForm ? (
              <>
                <button onClick={saveBattery} disabled={saving} style={{ ...btnPrimary, padding: '8px 16px', fontSize: '13px', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => { setShowBatteryForm(false); setBatteryForm(emptyBatteryForm); }} style={{ ...btnSecondary, padding: '8px 16px', fontSize: '13px' }}>Cancel</button>
              </>
            ) : (
              <button onClick={() => setShowBatteryForm(true)} style={{ ...btnSecondary, padding: '8px 16px', fontSize: '13px' }}>+ Log Battery Replacement</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#1a56a0', borderBottom: '1px solid #e0e8f0', paddingBottom: '6px', marginBottom: '14px', marginTop: '4px' }}>
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
const rowStyle = { display: 'flex', gap: '16px', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: '13px', color: '#333', flexWrap: 'wrap' };
const th = { padding: '8px 10px', textAlign: 'left', fontWeight: '600', color: '#1a56a0', fontSize: '12px', borderBottom: '2px solid #e0e8f0', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '13px', color: '#333', borderBottom: '1px solid #f0f0f0' };
const btnPrimary = { background: '#1a56a0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' };
const btnSecondary = { padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '14px' };
const deleteBtn = { padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontWeight: '600' };
