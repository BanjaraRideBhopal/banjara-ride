import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { centreOptions } from '../data/options';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function toLocalDateStr(isoString) {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function localWeekday(dateStr) {
  const jsDay = new Date(`${dateStr}T00:00:00`).getDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7; // 0=Mon..6=Sun
}

function formatINR(n) {
  return (n || 0).toLocaleString('en-IN');
}

function groupTopN(entries, n = 8) {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const top = sorted.slice(0, n);
  const othersValue = sorted.slice(n).reduce((sum, e) => sum + e.value, 0);
  return [...top, { name: 'Others', value: othersValue }];
}

function insuranceRowColor(nextDue) {
  const today = getToday();
  if (nextDue < today) return { bg: '#fee2e2', color: '#991b1b' };
  if (nextDue <= addDays(today, 7)) return { bg: '#fef3c7', color: '#92400e' };
  return { bg: '#fef9c3', color: '#854d0e' };
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Dashboard({ profile, setActivePage }) {
  const [filterFrom, setFilterFrom] = useState(getToday());
  const [filterTo, setFilterTo] = useState(getToday());
  const [centreFilter, setCentreFilter] = useState('all');
  const [centreIdByName, setCentreIdByName] = useState({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [bookings, setBookings] = useState([]);
  const [activeBookingsCount, setActiveBookingsCount] = useState(0);
  const [pendingRefunds, setPendingRefunds] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [allExpenseDates, setAllExpenseDates] = useState([]);
  const [insuranceRecords, setInsuranceRecords] = useState([]);
  const [vehiclesList, setVehiclesList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [mobileBookingCounts, setMobileBookingCounts] = useState({});

  useEffect(() => {
    loadCentres();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Object.keys(centreIdByName).length === 0 && centreFilter !== 'all') return;
    loadAll();
  }, [filterFrom, filterTo, centreFilter, centreIdByName]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCentres() {
    const { data } = await supabase.from('centres').select('id, name');
    setCentreIdByName(Object.fromEntries((data || []).map(c => [c.name, c.id])));
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    const centreId = centreFilter === 'all' ? null : centreIdByName[centreFilter];

    let bookingsQuery = supabase.from('bookings')
      .select('id, booking_date, booking_type, vehicle, full_amount_received, final_rent, security_deposit, cash, paid_to, upi_amount, upi_paid_to, app_payment_amount, mobile, customer_name, centre, centre_id, status, refund_status, refund_amount')
      .gte('booking_date', filterFrom).lte('booking_date', filterTo);
    if (centreId) bookingsQuery = bookingsQuery.eq('centre_id', centreId);

    let activeQuery = supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'start');
    if (centreId) activeQuery = activeQuery.eq('centre_id', centreId);

    let refundsQuery = supabase.from('bookings')
      .select('id, booking_date, customer_name, vehicle, refund_amount, centre')
      .eq('status', 'end').eq('refund_status', 'Unprocessed')
      .order('booking_date', { ascending: true });
    if (centreId) refundsQuery = refundsQuery.eq('centre_id', centreId);

    let expensesQuery = supabase.from('maintenance_expenses')
      .select('expense_type, amount, vehicle_id, vehicles(registration_number, vehicle_types(name))')
      .gte('expense_date', filterFrom).lte('expense_date', filterTo);
    if (centreId) expensesQuery = expensesQuery.eq('centre_id', centreId);

    let allExpenseDatesQuery = supabase.from('maintenance_expenses').select('vehicle_id, expense_date');
    if (centreId) allExpenseDatesQuery = allExpenseDatesQuery.eq('centre_id', centreId);

    let insuranceQuery = supabase.from('insurance_records')
      .select('id, vehicle_id, next_due, created_at, vehicles(registration_number, vehicle_types(name))')
      .order('created_at', { ascending: false });
    if (centreId) insuranceQuery = insuranceQuery.eq('centre_id', centreId);

    let vehiclesQuery = supabase.from('vehicles').select('id, registration_number, centre_id, vehicle_types(name)').eq('active', true);
    if (centreId) vehiclesQuery = vehiclesQuery.eq('centre_id', centreId);

    const customersQuery = supabase.from('customers').select('id, mobile, created_at, centre_id');

    const [
      { data: bookingsData, error: bookingsErr },
      { count: activeCount },
      { data: refundsData },
      { data: expensesData },
      { data: allExpenseDatesData },
      { data: insuranceData },
      { data: vehiclesData },
      { data: customersData },
    ] = await Promise.all([
      bookingsQuery, activeQuery, refundsQuery, expensesQuery, allExpenseDatesQuery, insuranceQuery, vehiclesQuery, customersQuery,
    ]);

    if (bookingsErr) setError('Failed to load dashboard data: ' + bookingsErr.message);

    setBookings(bookingsData || []);
    setActiveBookingsCount(activeCount || 0);
    setPendingRefunds(refundsData || []);
    setExpenses(expensesData || []);
    setAllExpenseDates(allExpenseDatesData || []);
    setInsuranceRecords(insuranceData || []);
    setVehiclesList(vehiclesData || []);
    setCustomers(customersData || []);

    // New vs Repeat: needs all-time booking counts per mobile for whoever booked in this range
    const uniqueMobiles = Array.from(new Set((bookingsData || []).map(b => b.mobile).filter(Boolean)));
    if (uniqueMobiles.length > 0) {
      let allTimeQuery = supabase.from('bookings').select('mobile').in('mobile', uniqueMobiles);
      if (centreId) allTimeQuery = allTimeQuery.eq('centre_id', centreId);
      const { data: allTimeData } = await allTimeQuery;
      const counts = {};
      (allTimeData || []).forEach(b => { counts[b.mobile] = (counts[b.mobile] || 0) + 1; });
      setMobileBookingCounts(counts);
    } else {
      setMobileBookingCounts({});
    }

    setLoading(false);
  }

  // ── Summary cards ──────────────────────────────────
  const totalBookings = bookings.length;
  const rentRevenue = bookings.filter(b => b.status === 'end').reduce((sum, b) => sum + (parseFloat(b.final_rent) || 0), 0);
  const depositsHeld = bookings.reduce((sum, b) => sum + (parseFloat(b.security_deposit) || 0), 0);
  const maintenanceSpend = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const outstandingDeposits = pendingRefunds.length;

  const selectedCentreId = centreFilter === 'all' ? null : centreIdByName[centreFilter];
  const newCustomers = customers.filter(c => {
    const d = toLocalDateStr(c.created_at);
    return d >= filterFrom && d <= filterTo && (!selectedCentreId || c.centre_id === selectedCentreId);
  });

  // ── Vehicle performance ─────────────────────────────
  const bookingsByVehicleType = {};
  const revenueByVehicleType = {};
  bookings.forEach(b => {
    const v = b.vehicle || 'Unknown';
    bookingsByVehicleType[v] = (bookingsByVehicleType[v] || 0) + 1;
    revenueByVehicleType[v] = (revenueByVehicleType[v] || 0) + (parseFloat(b.final_rent) || 0);
  });
  const bookingsByVehiclePie = groupTopN(Object.entries(bookingsByVehicleType).map(([name, value]) => ({ name, value })));
  const revenueByVehiclePie = groupTopN(Object.entries(revenueByVehicleType).map(([name, value]) => ({ name, value })));
  const vehicleUtilisationBar = Object.entries(bookingsByVehicleType).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const revenueByDate = {};
  bookings.forEach(b => { revenueByDate[b.booking_date] = (revenueByDate[b.booking_date] || 0) + (parseFloat(b.final_rent) || 0); });
  const revenueTrend = Object.entries(revenueByDate).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  const showTrendNote = filterFrom === filterTo;

  // ── Financial breakdown ─────────────────────────────
  const paymentModeTotals = { Cash: 0, UPI: 0, 'App Payment': 0 };
  bookings.forEach(b => {
    paymentModeTotals.Cash += parseFloat(b.cash) || 0;
    paymentModeTotals.UPI += parseFloat(b.upi_amount) || 0;
    paymentModeTotals['App Payment'] += parseFloat(b.app_payment_amount) || 0;
  });
  const paymentModePie = Object.entries(paymentModeTotals).map(([name, value]) => ({ name, value })).filter(e => e.value > 0);

  const revenueByCentre = {};
  bookings.forEach(b => {
    const c = b.centre || 'Unknown';
    revenueByCentre[c] = (revenueByCentre[c] || 0) + (parseFloat(b.final_rent) || 0);
  });
  const revenueByCentreBar = Object.entries(revenueByCentre).map(([name, value]) => ({ name, value }));

  const pendingRefundsList = pendingRefunds.slice(0, 10);

  // ── Booking patterns ────────────────────────────────
  const durationCounts = {};
  bookings.forEach(b => { const t = b.booking_type || 'Unknown'; durationCounts[t] = (durationCounts[t] || 0) + 1; });
  const durationPie = Object.entries(durationCounts).map(([name, value]) => ({ name, value }));

  const dayCounts = DAY_NAMES.map(name => ({ name, value: 0 }));
  bookings.forEach(b => { if (b.booking_date) dayCounts[localWeekday(b.booking_date)].value += 1; });
  const rangeDays = Math.round((new Date(filterTo) - new Date(filterFrom)) / 86400000) + 1;
  const showDayOfWeekNote = rangeDays < 7;

  // ── Customer insights ───────────────────────────────
  const uniqueMobilesInRange = Array.from(new Set(bookings.map(b => b.mobile).filter(Boolean)));
  let newCount = 0, repeatCount = 0;
  uniqueMobilesInRange.forEach(mobile => {
    const count = mobileBookingCounts[mobile] || 1;
    if (count > 1) repeatCount++;
    else newCount++;
  });
  const newVsRepeatPie = [{ name: 'New', value: newCount }, { name: 'Repeat', value: repeatCount }].filter(e => e.value > 0);

  const customerStats = {};
  bookings.forEach(b => {
    if (!b.mobile) return;
    if (!customerStats[b.mobile]) customerStats[b.mobile] = { name: b.customer_name, mobile: b.mobile, bookings: 0, spent: 0 };
    customerStats[b.mobile].bookings += 1;
    customerStats[b.mobile].spent += parseFloat(b.full_amount_received) || 0;
  });
  const top10Customers = Object.values(customerStats).sort((a, b) => b.bookings - a.bookings).slice(0, 10);

  // ── Maintenance overview ─────────────────────────────
  const spendByType = {};
  expenses.forEach(e => { const t = e.expense_type || 'Other'; spendByType[t] = (spendByType[t] || 0) + (parseFloat(e.amount) || 0); });
  const spendByTypePie = Object.entries(spendByType).map(([name, value]) => ({ name, value }));

  const spendByVehicleType = {};
  expenses.forEach(e => {
    const name = e.vehicles?.vehicle_types?.name || 'Unknown';
    spendByVehicleType[name] = (spendByVehicleType[name] || 0) + (parseFloat(e.amount) || 0);
  });
  const spendByVehicleTypeBar = Object.entries(spendByVehicleType).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const latestInsuranceByVehicle = {};
  insuranceRecords.forEach(r => { if (!latestInsuranceByVehicle[r.vehicle_id]) latestInsuranceByVehicle[r.vehicle_id] = r; });
  const in30Days = addDays(getToday(), 30);
  const insuranceDueList = Object.values(latestInsuranceByVehicle)
    .filter(r => r.next_due <= in30Days)
    .map(r => ({ ...r, daysRemaining: Math.round((new Date(`${r.next_due}T00:00:00`) - new Date(`${getToday()}T00:00:00`)) / 86400000) }))
    .sort((a, b) => a.next_due.localeCompare(b.next_due));

  const lastMaintenanceByVehicle = {};
  allExpenseDates.forEach(e => {
    if (!lastMaintenanceByVehicle[e.vehicle_id] || e.expense_date > lastMaintenanceByVehicle[e.vehicle_id]) {
      lastMaintenanceByVehicle[e.vehicle_id] = e.expense_date;
    }
  });
  const thirtyDaysAgo = addDays(getToday(), -30);
  const noRecentMaintenance = vehiclesList
    .map(v => ({ ...v, lastDate: lastMaintenanceByVehicle[v.id] || null }))
    .filter(v => !v.lastDate || v.lastDate < thirtyDaysAgo)
    .sort((a, b) => {
      if (!a.lastDate && !b.lastDate) return 0;
      if (!a.lastDate) return -1;
      if (!b.lastDate) return 1;
      return a.lastDate.localeCompare(b.lastDate);
    });

  // ── Staff performance ────────────────────────────────
  const collectionsByStaff = {};
  bookings.forEach(b => {
    if (b.paid_to && b.cash) collectionsByStaff[b.paid_to] = (collectionsByStaff[b.paid_to] || 0) + (parseFloat(b.cash) || 0);
    if (b.upi_paid_to && b.upi_amount) collectionsByStaff[b.upi_paid_to] = (collectionsByStaff[b.upi_paid_to] || 0) + (parseFloat(b.upi_amount) || 0);
  });
  const collectionsBar = Object.entries(collectionsByStaff).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const bookingsByStaff = {};
  bookings.forEach(b => {
    const staffSet = new Set([b.paid_to, b.upi_paid_to].filter(Boolean));
    staffSet.forEach(name => { bookingsByStaff[name] = (bookingsByStaff[name] || 0) + 1; });
  });
  const bookingsByStaffBar = Object.entries(bookingsByStaff).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  return (
    <div className="br-page">

      {/* HEADER */}
      <div className="br-header">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a56a0' }}>Banjara Ride</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>Dashboard</p>
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
          <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>From</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={input} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>To</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={input} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Centre</label>
          <select value={centreFilter} onChange={e => setCentreFilter(e.target.value)} style={input}>
            <option value="all">All Centres</option>
            {centreOptions.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={loadAll} style={btnSecondary}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="br-grid-4">
        <SummaryCard label="Total Bookings" value={totalBookings} />
        <SummaryCard label="Rent Revenue" value={formatINR(rentRevenue)} prefix="₹" />
        <SummaryCard label="Deposits Held" value={formatINR(depositsHeld)} prefix="₹" />
        <SummaryCard label="Active Right Now" value={activeBookingsCount} />
      </div>
      <div className="br-grid-3">
        <SummaryCard label="Maintenance Spend" value={formatINR(maintenanceSpend)} prefix="₹" />
        <SummaryCard label="Outstanding Deposits" value={outstandingDeposits} />
        <SummaryCard label="New Customers" value={newCustomers.length} />
      </div>

      {/* VEHICLE PERFORMANCE */}
      <h2 style={sectionHeading}>Vehicle Performance</h2>
      <div className="br-grid-2">
        <ChartCard title="Bookings per Vehicle Type" data={bookingsByVehiclePie}>
          <PieChart>
            <Pie data={bookingsByVehiclePie} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
              {bookingsByVehiclePie.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ChartCard>
        <ChartCard title="Revenue per Vehicle Type" data={revenueByVehiclePie}>
          <PieChart>
            <Pie data={revenueByVehiclePie} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ₹${formatINR(value)}`}>
              {revenueByVehiclePie.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ChartCard>
        <ChartCard title="Vehicle Utilisation (Bookings)" data={vehicleUtilisationBar}>
          <BarChart data={vehicleUtilisationBar}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} interval={0} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value">
              {vehicleUtilisationBar.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
        <ChartCard title="Daily Revenue Trend" data={revenueTrend} note={showTrendNote ? 'Select a date range to see trend' : null}>
          <LineChart data={revenueTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke={COLORS[0]} />
          </LineChart>
        </ChartCard>
      </div>

      {/* FINANCIAL BREAKDOWN */}
      <h2 style={sectionHeading}>Financial Breakdown</h2>
      <div className="br-grid-2">
        <ChartCard title="Revenue by Payment Mode" data={paymentModePie}>
          <PieChart>
            <Pie data={paymentModePie} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ₹${formatINR(value)}`}>
              {paymentModePie.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ChartCard>
        {centreFilter === 'all' && (
          <ChartCard title="Revenue by Centre" data={revenueByCentreBar}>
            <BarChart data={revenueByCentreBar}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value">
                {revenueByCentreBar.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ChartCard>
        )}
      </div>
      <div className="br-form-card">
        <h3 style={{ fontSize: '15px', color: '#1a56a0', marginBottom: '12px' }}>Pending Refunds</h3>
        {pendingRefunds.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#6b7280' }}>No data for this period</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Customer</th>
                    <th style={th}>Vehicle</th>
                    <th style={th}>Refund Amount ₹</th>
                    <th style={th}>Centre</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRefundsList.map(r => (
                    <tr key={r.id}>
                      <td style={td}>{r.booking_date}</td>
                      <td style={td}>{r.customer_name}</td>
                      <td style={td}>{r.vehicle}</td>
                      <td style={td}>₹{formatINR(r.refund_amount)}</td>
                      <td style={td}>{r.centre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pendingRefunds.length > 10 && (
              <button onClick={() => setActivePage('bookings')} style={{ ...btnSecondary, marginTop: '12px', fontSize: '13px' }}>
                View all {pendingRefunds.length} in Booking Sheet
              </button>
            )}
          </>
        )}
      </div>

      {/* BOOKING PATTERNS */}
      <h2 style={sectionHeading}>Booking Patterns</h2>
      <div className="br-grid-2">
        <ChartCard title="Most Popular Booking Duration" data={durationPie}>
          <PieChart>
            <Pie data={durationPie} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
              {durationPie.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ChartCard>
        <ChartCard title="Bookings by Day of Week" data={dayCounts} note={showDayOfWeekNote ? 'Select a wider date range' : null}>
          <BarChart data={dayCounts}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value">
              {dayCounts.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      {/* CUSTOMER INSIGHTS */}
      <h2 style={sectionHeading}>Customer Insights</h2>
      <div className="br-grid-2">
        <ChartCard title="New vs Repeat Customers" data={newVsRepeatPie}>
          <PieChart>
            <Pie data={newVsRepeatPie} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
              {newVsRepeatPie.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ChartCard>
      </div>
      <div className="br-form-card">
        <h3 style={{ fontSize: '15px', color: '#1a56a0', marginBottom: '12px' }}>Top 10 Customers by Booking Count</h3>
        {top10Customers.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#6b7280' }}>No data for this period</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Rank</th>
                  <th style={th}>Customer Name</th>
                  <th style={th}>Mobile</th>
                  <th style={th}>Bookings</th>
                  <th style={th}>Total Spent ₹</th>
                </tr>
              </thead>
              <tbody>
                {top10Customers.map((c, i) => (
                  <tr key={c.mobile}>
                    <td style={td}>{i + 1}</td>
                    <td style={td}>{c.name}</td>
                    <td style={td}>{c.mobile}</td>
                    <td style={td}>{c.bookings}</td>
                    <td style={td}>₹{formatINR(c.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MAINTENANCE OVERVIEW */}
      <h2 style={sectionHeading}>Maintenance Overview</h2>
      <div className="br-grid-2">
        <ChartCard title="Spend by Expense Type" data={spendByTypePie}>
          <PieChart>
            <Pie data={spendByTypePie} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ₹${formatINR(value)}`}>
              {spendByTypePie.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ChartCard>
        <ChartCard title="Spend by Vehicle Type" data={spendByVehicleTypeBar}>
          <BarChart data={spendByVehicleTypeBar}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} interval={0} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value">
              {spendByVehicleTypeBar.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>
      <div className="br-grid-2">
        <div className="br-form-card">
          <h3 style={{ fontSize: '15px', color: '#1a56a0', marginBottom: '4px' }}>Insurance Due Within 30 Days</h3>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>Ignores date filter — always current</p>
          {insuranceDueList.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280' }}>No data for this period</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Vehicle Type</th>
                    <th style={th}>Registration</th>
                    <th style={th}>Next Due</th>
                    <th style={th}>Days Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {insuranceDueList.map(r => {
                    const rowColor = insuranceRowColor(r.next_due);
                    return (
                      <tr key={r.id} style={{ background: rowColor.bg }}>
                        <td style={{ ...td, color: rowColor.color, fontWeight: '600' }}>{r.vehicles?.vehicle_types?.name || '—'}</td>
                        <td style={{ ...td, color: rowColor.color }}>{r.vehicles?.registration_number || '—'}</td>
                        <td style={{ ...td, color: rowColor.color }}>{r.next_due}</td>
                        <td style={{ ...td, color: rowColor.color }}>{r.daysRemaining < 0 ? `${Math.abs(r.daysRemaining)}d overdue` : `${r.daysRemaining}d`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="br-form-card">
          <h3 style={{ fontSize: '15px', color: '#1a56a0', marginBottom: '4px' }}>Vehicles with No Recent Maintenance</h3>
          <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>No expense logged in the last 30 days — ignores date filter</p>
          {noRecentMaintenance.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6b7280' }}>No data for this period</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Vehicle Type</th>
                    <th style={th}>Registration</th>
                    <th style={th}>Last Maintenance</th>
                  </tr>
                </thead>
                <tbody>
                  {noRecentMaintenance.map(v => (
                    <tr key={v.id}>
                      <td style={td}>{v.vehicle_types?.name || '—'}</td>
                      <td style={td}>{v.registration_number}</td>
                      <td style={td}>{v.lastDate || 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* STAFF PERFORMANCE */}
      <h2 style={sectionHeading}>Staff Performance</h2>
      <div className="br-grid-2">
        <ChartCard title="Collections per Staff Member" data={collectionsBar}>
          <BarChart data={collectionsBar}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} interval={0} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value">
              {collectionsBar.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
        <ChartCard title="Bookings Credited per Staff Member" data={bookingsByStaffBar}>
          <BarChart data={bookingsByStaffBar}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} interval={0} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value">
              {bookingsByStaffBar.map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, prefix }) {
  return (
    <div className="br-form-card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a56a0' }}>{prefix}{value}</div>
    </div>
  );
}

function ChartCard({ title, data, note, children }) {
  const empty = !note && (!data || data.length === 0);
  return (
    <div className="br-form-card">
      <h3 style={{ fontSize: '15px', color: '#1a56a0', marginBottom: '12px' }}>{title}</h3>
      {note ? (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>{note}</p>
      ) : empty ? (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>No data for this period</p>
      ) : (
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const sectionHeading = { fontSize: '18px', fontWeight: '700', color: '#1a56a0', margin: '8px 0 16px' };
const input = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', outline: 'none' };
const th = { padding: '8px 10px', textAlign: 'left', fontWeight: '600', color: '#1a56a0', fontSize: '12px', borderBottom: '2px solid #e0e8f0', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '13px', color: '#333', borderBottom: '1px solid #f0f0f0' };
const btnSecondary = { padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '14px' };
