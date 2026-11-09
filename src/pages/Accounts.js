import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { buildCreditByReg, buildMaintenanceByVehicleId, computeVendorRow } from '../utils/vendorRevenue';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';

const TREND_MONTHS = 6;
const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

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

function monthsWindow(endMonthStr, n) {
  const [y, m] = endMonthStr.split('-').map(Number);
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    months.push(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
  }
  return months;
}

function dateToMonth(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : '';
}

function formatINR(n) {
  return Math.round(n || 0).toLocaleString('en-IN');
}

const emptyExpenseForm = { category_id: '', isNewCategory: false, newCategoryName: '', amount: '', expense_date: getCurrentDate(), description: '' };
const emptyIncomeForm = { income_type: 'subsidy', amount: '', income_date: getCurrentDate(), description: '' };

function getCurrentDate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

export default function Accounts({ profile, setActivePage }) {
  const [month, setMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState([]);
  const [expensesMonth, setExpensesMonth] = useState([]);
  const [incomeWindow, setIncomeWindow] = useState([]);
  const [vendorVehicles, setVendorVehicles] = useState([]);
  const [bookingsWindow, setBookingsWindow] = useState([]);
  const [maintenanceWindow, setMaintenanceWindow] = useState([]);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [addExpenseForm, setAddExpenseForm] = useState(emptyExpenseForm);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editExpenseForm, setEditExpenseForm] = useState(emptyExpenseForm);

  const [showAddIncome, setShowAddIncome] = useState(false);
  const [addIncomeForm, setAddIncomeForm] = useState(emptyIncomeForm);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [editIncomeForm, setEditIncomeForm] = useState(emptyIncomeForm);

  useEffect(() => { loadAll(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true);
    setError('');
    const { start, end } = monthRange(month);
    const months = monthsWindow(month, TREND_MONTHS);
    const windowStart = monthRange(months[0]).start;
    const windowEnd = monthRange(months[months.length - 1]).end;

    const [
      { data: catData, error: catErr },
      { data: expData },
      { data: incData },
      { data: vvData },
      { data: bkData },
      { data: maintData },
    ] = await Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('expenses').select('*, expense_categories(name)').gte('expense_date', start).lte('expense_date', end),
      supabase.from('income_records').select('*').gte('income_date', windowStart).lte('income_date', windowEnd),
      supabase.from('vendor_vehicles').select('*, vehicles(id, registration_number, vehicle_type_id, vehicle_types(name)), vendors(name)').eq('active', true),
      supabase.from('bookings').select('vehicle_number, final_rent, booking_date, status').eq('status', 'end').gte('booking_date', windowStart).lte('booking_date', windowEnd),
      supabase.from('maintenance_expenses').select('vehicle_id, amount, expense_date').gte('expense_date', windowStart).lte('expense_date', windowEnd),
    ]);

    if (catErr) setError('Failed to load accounts data: ' + catErr.message);
    setCategories(catData || []);
    setExpensesMonth(expData || []);
    setIncomeWindow(incData || []);
    setVendorVehicles((vvData || []).filter(vv => vv.vehicles));
    setBookingsWindow(bkData || []);
    setMaintenanceWindow(maintData || []);
    setLoading(false);
  }

  const months = monthsWindow(month, TREND_MONTHS);
  const { start: monthStart, end: monthEnd } = monthRange(month);

  // ── Per-vehicle BJ Earn for the selected month (profit panel + item 5) ──
  const bookingsThisMonth = bookingsWindow.filter(b => b.booking_date >= monthStart && b.booking_date <= monthEnd);
  const maintenanceThisMonth = maintenanceWindow.filter(m => m.expense_date >= monthStart && m.expense_date <= monthEnd);
  const creditByRegThisMonth = buildCreditByReg(bookingsThisMonth);
  const maintenanceByVehicleIdThisMonth = buildMaintenanceByVehicleId(maintenanceThisMonth);
  const perVehicleRows = vendorVehicles.map(vv => ({
    vv,
    calc: computeVendorRow(vv, creditByRegThisMonth, maintenanceByVehicleIdThisMonth),
  })).sort((a, b) => b.calc.bjEarn - a.calc.bjEarn);

  // ── Income split for the selected month ──
  const incomeThisMonth = incomeWindow.filter(i => i.income_date >= monthStart && i.income_date <= monthEnd);
  const subsidySumThisMonth = incomeThisMonth.filter(i => i.income_type === 'subsidy').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const otherSumThisMonth = incomeThisMonth.filter(i => i.income_type === 'other').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  // ── Profit summary ──
  const bjEarnSum = perVehicleRows.reduce((s, r) => s + r.calc.bjEarn, 0);
  const expensesSum = expensesMonth.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const profit = bjEarnSum + subsidySumThisMonth + otherSumThisMonth - expensesSum;

  // ── Item 1: maintenance per month (trend) ──
  const maintenanceTrend = months.map(mo => ({
    month: mo,
    value: maintenanceWindow.filter(m => dateToMonth(m.expense_date) === mo).reduce((s, m) => s + (parseFloat(m.amount) || 0), 0),
  }));

  // ── Item 2: rent paid to vendor per month (trend) ──
  const vendorRentTrend = months.map(mo => {
    const { start: mStart, end: mEnd } = monthRange(mo);
    const bk = bookingsWindow.filter(b => b.booking_date >= mStart && b.booking_date <= mEnd);
    const mt = maintenanceWindow.filter(m => m.expense_date >= mStart && m.expense_date <= mEnd);
    const credit = buildCreditByReg(bk);
    const maint = buildMaintenanceByVehicleId(mt);
    const value = vendorVehicles.reduce((s, vv) => s + computeVendorRow(vv, credit, maint).ownerAmt, 0);
    return { month: mo, value };
  });

  // ── Item 3: expense by category for the selected month ──
  const expenseByCategory = categories.map(c => ({
    name: c.name,
    value: expensesMonth.filter(e => e.category_id === c.id).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
  })).filter(c => c.value > 0);

  // ── Item 4: govt subsidy per month (trend) ──
  const subsidyTrend = months.map(mo => ({
    month: mo,
    value: incomeWindow.filter(i => i.income_type === 'subsidy' && dateToMonth(i.income_date) === mo).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
  }));

  // ── Expense form ──
  function handleExpenseCategoryChange(val, setForm) {
    setForm(p => ({ ...p, category_id: val, isNewCategory: val === '__new__', newCategoryName: val === '__new__' ? p.newCategoryName : '' }));
  }

  async function saveAddExpense() {
    if (addExpenseForm.isNewCategory ? !addExpenseForm.newCategoryName.trim() : !addExpenseForm.category_id) {
      alert('Please select or name a category');
      return;
    }
    if (!addExpenseForm.amount || !addExpenseForm.expense_date) {
      alert('Please fill Amount and Date');
      return;
    }
    if (addExpenseForm.isNewCategory) {
      const dup = categories.some(c => c.name.toLowerCase() === addExpenseForm.newCategoryName.trim().toLowerCase());
      if (dup) { alert('A category with this name already exists'); return; }
    }

    setSaving(true);
    setError('');
    let categoryId = parseInt(addExpenseForm.category_id);
    if (addExpenseForm.isNewCategory) {
      const { data: newCat, error: catErr } = await supabase.from('expense_categories').insert({ name: addExpenseForm.newCategoryName.trim() }).select('id').single();
      if (catErr) { setError(catErr.message); setSaving(false); return; }
      categoryId = newCat.id;
    }
    const { error: err } = await supabase.from('expenses').insert({
      category_id: categoryId,
      amount: parseFloat(addExpenseForm.amount),
      expense_date: addExpenseForm.expense_date,
      description: addExpenseForm.description || null,
    });
    if (err) setError(err.message);
    else { setShowAddExpense(false); setAddExpenseForm(emptyExpenseForm); await loadAll(); }
    setSaving(false);
  }

  function startEditExpense(e) {
    setEditingExpenseId(e.id);
    setEditExpenseForm({ category_id: String(e.category_id), amount: String(e.amount), expense_date: e.expense_date, description: e.description || '' });
  }

  async function saveEditExpense(id) {
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('expenses').update({
      category_id: parseInt(editExpenseForm.category_id),
      amount: parseFloat(editExpenseForm.amount) || 0,
      expense_date: editExpenseForm.expense_date,
      description: editExpenseForm.description || null,
    }).eq('id', id);
    if (err) setError(err.message);
    else { setEditingExpenseId(null); await loadAll(); }
    setSaving(false);
  }

  async function deleteExpense(id) {
    if (!window.confirm('Delete this expense entry?')) return;
    const { error: err } = await supabase.from('expenses').delete().eq('id', id);
    if (err) setError(err.message);
    else setExpensesMonth(prev => prev.filter(e => e.id !== id));
  }

  // ── Income form ──
  async function saveAddIncome() {
    if (!addIncomeForm.amount || !addIncomeForm.income_date) {
      alert('Please fill Amount and Date');
      return;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('income_records').insert({
      income_type: addIncomeForm.income_type,
      amount: parseFloat(addIncomeForm.amount),
      income_date: addIncomeForm.income_date,
      description: addIncomeForm.description || null,
    });
    if (err) setError(err.message);
    else { setShowAddIncome(false); setAddIncomeForm(emptyIncomeForm); await loadAll(); }
    setSaving(false);
  }

  function startEditIncome(i) {
    setEditingIncomeId(i.id);
    setEditIncomeForm({ income_type: i.income_type, amount: String(i.amount), income_date: i.income_date, description: i.description || '' });
  }

  async function saveEditIncome(id) {
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('income_records').update({
      income_type: editIncomeForm.income_type,
      amount: parseFloat(editIncomeForm.amount) || 0,
      income_date: editIncomeForm.income_date,
      description: editIncomeForm.description || null,
    }).eq('id', id);
    if (err) setError(err.message);
    else { setEditingIncomeId(null); await loadAll(); }
    setSaving(false);
  }

  async function deleteIncome(id) {
    if (!window.confirm('Delete this income entry?')) return;
    const { error: err } = await supabase.from('income_records').delete().eq('id', id);
    if (err) setError(err.message);
    else setIncomeWindow(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className="br-page">

      {/* HEADER */}
      <div className="br-header">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a56a0' }}>Banjara Ride</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>Accounts</p>
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
        <button onClick={loadAll} style={btnSecondary}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      {/* PROFIT SUMMARY */}
      <div className="br-form-card">
        <h2 style={{ marginBottom: '16px', color: '#1a56a0', fontSize: '18px' }}>Profit Summary — {month}</h2>
        <div className="br-grid-4">
          <SummaryCard label="BJ Earn" value={formatINR(bjEarnSum)} prefix="₹" />
          <SummaryCard label="Govt Subsidy" value={formatINR(subsidySumThisMonth)} prefix="₹" />
          <SummaryCard label="Other Income" value={formatINR(otherSumThisMonth)} prefix="₹" />
          <SummaryCard label="Total Expenses" value={formatINR(expensesSum)} prefix="₹" />
        </div>
        <div style={{ marginTop: '16px', padding: '16px', background: profit >= 0 ? '#f0fdf4' : '#fee2e2', borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: profit >= 0 ? '#065f46' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profit</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: profit >= 0 ? '#065f46' : '#991b1b' }}>₹{formatINR(profit)}</div>
        </div>
      </div>

      {/* EXPENSES */}
      <div className="br-form-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: '#1a56a0', fontSize: '18px' }}>Expenses ({expensesMonth.length})</h2>
          <button onClick={() => { setShowAddExpense(v => !v); setEditingExpenseId(null); }} style={btnPrimary}>
            {showAddExpense ? 'Cancel' : '+ Add Expense'}
          </button>
        </div>

        {showAddExpense && (
          <div style={{ marginBottom: '20px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div className="br-grid-4" style={{ marginBottom: addExpenseForm.isNewCategory ? '14px' : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Category *</label>
                <select value={addExpenseForm.category_id} onChange={e => handleExpenseCategoryChange(e.target.value, setAddExpenseForm)} style={input}>
                  <option value="">Select...</option>
                  <option value="__new__">+ Add new category...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {addExpenseForm.isNewCategory && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>New Category Name *</label>
                  <input type="text" value={addExpenseForm.newCategoryName} onChange={e => setAddExpenseForm(p => ({ ...p, newCategoryName: e.target.value }))} style={input} placeholder="e.g. Office Supplies" />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Amount ₹ *</label>
                <input type="number" value={addExpenseForm.amount} onChange={e => setAddExpenseForm(p => ({ ...p, amount: e.target.value }))} style={input} placeholder="e.g. 5000" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Date *</label>
                <input type="date" value={addExpenseForm.expense_date} onChange={e => setAddExpenseForm(p => ({ ...p, expense_date: e.target.value }))} style={input} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Description</label>
                <input type="text" value={addExpenseForm.description} onChange={e => setAddExpenseForm(p => ({ ...p, description: e.target.value }))} style={input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => { setShowAddExpense(false); setAddExpenseForm(emptyExpenseForm); }} style={btnSecondary}>Cancel</button>
              <button onClick={saveAddExpense} disabled={saving} style={{ ...btnPrimary, background: '#059669', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Add Expense'}
              </button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>{['Date', 'Category', 'Amount ₹', 'Description', 'Edit', 'Delete'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {expensesMonth.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#999' }}>No expenses logged for this month.</td></tr>
              ) : expensesMonth.map((e, i) => {
                const editing = editingExpenseId === e.id;
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                    <td style={tdStyle}>
                      {editing ? <input type="date" value={editExpenseForm.expense_date} onChange={ev => setEditExpenseForm(p => ({ ...p, expense_date: ev.target.value }))} style={{ ...input, width: '140px' }} /> : e.expense_date}
                    </td>
                    <td style={tdStyle}>
                      {editing ? (
                        <select value={editExpenseForm.category_id} onChange={ev => setEditExpenseForm(p => ({ ...p, category_id: ev.target.value }))} style={{ ...input, width: '160px' }}>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (e.expense_categories?.name || '—')}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="number" value={editExpenseForm.amount} onChange={ev => setEditExpenseForm(p => ({ ...p, amount: ev.target.value }))} style={{ ...input, width: '90px' }} /> : `₹${formatINR(e.amount)}`}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="text" value={editExpenseForm.description} onChange={ev => setEditExpenseForm(p => ({ ...p, description: ev.target.value }))} style={{ ...input, width: '180px' }} /> : (e.description || '—')}
                    </td>
                    <td style={tdStyle}>
                      {editing ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => saveEditExpense(e.id)} disabled={saving} style={{ ...btnPrimary, padding: '5px 14px', fontSize: '12px', opacity: saving ? 0.7 : 1 }}>{saving ? '...' : 'Save'}</button>
                          <button onClick={() => setEditingExpenseId(null)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEditExpense(e)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Edit</button>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => deleteExpense(e.id)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px', color: '#991b1b', borderColor: '#fca5a5' }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* INCOME */}
      <div className="br-form-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: '#1a56a0', fontSize: '18px' }}>Income ({incomeThisMonth.length})</h2>
          <button onClick={() => { setShowAddIncome(v => !v); setEditingIncomeId(null); }} style={btnPrimary}>
            {showAddIncome ? 'Cancel' : '+ Add Income'}
          </button>
        </div>

        {showAddIncome && (
          <div style={{ marginBottom: '20px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div className="br-grid-4">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Type *</label>
                <select value={addIncomeForm.income_type} onChange={e => setAddIncomeForm(p => ({ ...p, income_type: e.target.value }))} style={input}>
                  <option value="subsidy">Govt Subsidy</option>
                  <option value="other">Other Income</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Amount ₹ *</label>
                <input type="number" value={addIncomeForm.amount} onChange={e => setAddIncomeForm(p => ({ ...p, amount: e.target.value }))} style={input} placeholder="e.g. 10000" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Date *</label>
                <input type="date" value={addIncomeForm.income_date} onChange={e => setAddIncomeForm(p => ({ ...p, income_date: e.target.value }))} style={input} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Description</label>
                <input type="text" value={addIncomeForm.description} onChange={e => setAddIncomeForm(p => ({ ...p, description: e.target.value }))} style={input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => { setShowAddIncome(false); setAddIncomeForm(emptyIncomeForm); }} style={btnSecondary}>Cancel</button>
              <button onClick={saveAddIncome} disabled={saving} style={{ ...btnPrimary, background: '#059669', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Add Income'}
              </button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>{['Date', 'Type', 'Amount ₹', 'Description', 'Edit', 'Delete'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {incomeThisMonth.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#999' }}>No income logged for this month.</td></tr>
              ) : incomeThisMonth.map((inc, i) => {
                const editing = editingIncomeId === inc.id;
                return (
                  <tr key={inc.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f9f9f9' }}>
                    <td style={tdStyle}>
                      {editing ? <input type="date" value={editIncomeForm.income_date} onChange={ev => setEditIncomeForm(p => ({ ...p, income_date: ev.target.value }))} style={{ ...input, width: '140px' }} /> : inc.income_date}
                    </td>
                    <td style={tdStyle}>
                      {editing ? (
                        <select value={editIncomeForm.income_type} onChange={ev => setEditIncomeForm(p => ({ ...p, income_type: ev.target.value }))} style={{ ...input, width: '140px' }}>
                          <option value="subsidy">Govt Subsidy</option>
                          <option value="other">Other Income</option>
                        </select>
                      ) : (inc.income_type === 'subsidy' ? 'Govt Subsidy' : 'Other Income')}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="number" value={editIncomeForm.amount} onChange={ev => setEditIncomeForm(p => ({ ...p, amount: ev.target.value }))} style={{ ...input, width: '90px' }} /> : `₹${formatINR(inc.amount)}`}
                    </td>
                    <td style={tdStyle}>
                      {editing ? <input type="text" value={editIncomeForm.description} onChange={ev => setEditIncomeForm(p => ({ ...p, description: ev.target.value }))} style={{ ...input, width: '180px' }} /> : (inc.description || '—')}
                    </td>
                    <td style={tdStyle}>
                      {editing ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => saveEditIncome(inc.id)} disabled={saving} style={{ ...btnPrimary, padding: '5px 14px', fontSize: '12px', opacity: saving ? 0.7 : 1 }}>{saving ? '...' : 'Save'}</button>
                          <button onClick={() => setEditingIncomeId(null)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEditIncome(inc)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px' }}>Edit</button>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => deleteIncome(inc.id)} style={{ ...btnSecondary, padding: '5px 14px', fontSize: '12px', color: '#991b1b', borderColor: '#fca5a5' }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHARTS */}
      <h2 style={sectionHeading}>Trends & Breakdown</h2>
      <div className="br-grid-2">
        <ChartCard title={`Maintenance per Month (trailing ${TREND_MONTHS})`} data={maintenanceTrend.filter(d => d.value > 0)}>
          <LineChart data={maintenanceTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip formatter={v => `₹${formatINR(v)}`} />
            <Line type="monotone" dataKey="value" stroke={COLORS[0]} />
          </LineChart>
        </ChartCard>
        <ChartCard title={`Rent Paid to Vendor per Month (trailing ${TREND_MONTHS})`} data={vendorRentTrend.filter(d => d.value > 0)}>
          <LineChart data={vendorRentTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip formatter={v => `₹${formatINR(v)}`} />
            <Line type="monotone" dataKey="value" stroke={COLORS[1]} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Expenses by Category (this month)" data={expenseByCategory}>
          <BarChart data={expenseByCategory}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} interval={0} />
            <YAxis />
            <Tooltip formatter={v => `₹${formatINR(v)}`} />
            <Bar dataKey="value">
              {expenseByCategory.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
        <ChartCard title={`Govt Subsidy per Month (trailing ${TREND_MONTHS})`} data={subsidyTrend.filter(d => d.value > 0)}>
          <LineChart data={subsidyTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip formatter={v => `₹${formatINR(v)}`} />
            <Line type="monotone" dataKey="value" stroke={COLORS[2]} />
          </LineChart>
        </ChartCard>
      </div>

      {/* PER VEHICLE EARN */}
      <div className="br-form-card">
        <h2 style={{ marginBottom: '16px', color: '#1a56a0', fontSize: '18px' }}>Per Vehicle Earn — {month}</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>{['Vehicle Type', 'Reg. No.', 'Vendor', 'BJ Earn ₹'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {perVehicleRows.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#999' }}>{loading ? 'Loading...' : 'No active vendor vehicles.'}</td></tr>
              ) : perVehicleRows.map(({ vv, calc }) => (
                <tr key={vv.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>{vv.vehicles.vehicle_types?.name || '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{vv.vehicles.registration_number}</td>
                  <td style={tdStyle}>{vv.vendors?.name || '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: '600', color: '#1a56a0' }}>₹{formatINR(calc.bjEarn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, prefix }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px', background: '#f9fafb', borderRadius: '10px' }}>
      <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a56a0' }}>{prefix}{value}</div>
    </div>
  );
}

function ChartCard({ title, data, children }) {
  const empty = !data || data.length === 0;
  return (
    <div className="br-form-card">
      <h3 style={{ fontSize: '15px', color: '#1a56a0', marginBottom: '12px' }}>{title}</h3>
      {empty ? (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>No data for this period</p>
      ) : (
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const sectionHeading = { fontSize: '18px', fontWeight: '700', color: '#1a56a0', margin: '8px 0 16px' };
const labelStyle = { fontSize: '12px', color: '#666', fontWeight: '500' };
const input = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', outline: 'none' };
const tdStyle = { padding: '10px 12px', color: '#333', whiteSpace: 'nowrap' };
const th = { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#1a56a0', whiteSpace: 'nowrap', borderBottom: '2px solid #1a56a0', background: '#f0f4ff' };
const btnPrimary = { background: '#1a56a0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' };
const btnSecondary = { padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '14px' };
