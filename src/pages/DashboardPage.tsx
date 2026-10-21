import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card, LoadingSpinner, PageHeader, Badge, StatusBadge } from '@/components/ui';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate, todayISODate, firstDayOfMonth, lastDayOfMonth } from '@/lib/format';
import {
  Package, TrendingUp, TrendingDown, Wallet, Receipt, Truck, AlertCircle,
  ArrowRight, Calendar
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';

interface DashboardData {
  tripsToday: number;
  tripsThisMonth: number;
  tripsInProgress: number;
  completedTrips: number;
  customerFreightBilled: number;
  customerReceipts: number;
  customerOutstanding: number;
  truckOwnerPayable: number;
  tripExpenses: number;
  ownFleetMargin: number;
  attachedFleetMargin: number;
  recentTrips: any[];
  recentPayments: any[];
  outstandingBills: any[];
  pendingSettlements: any[];
  monthlyFreightTrend: any[];
  expenseTrend: any[];
  tripsByVehicle: any[];
}

export function DashboardPage() {
  const { businessId, settings } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(todayISODate());

  const loadDashboard = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);

    const today = todayISODate();
    const monthStart = firstDayOfMonth();
    const monthEnd = lastDayOfMonth();

    // Trips
    const { data: tripsToday } = await supabase
      .from('trips').select('*').eq('business_id', businessId).eq('trip_date', today).neq('status', 'cancelled');
    const { data: tripsMonth } = await supabase
      .from('trips').select('*').eq('business_id', businessId).gte('trip_date', monthStart).lte('trip_date', monthEnd).neq('status', 'cancelled');
    const { data: tripsInProgress } = await supabase
      .from('trips').select('*').eq('business_id', businessId).in('status', ['booked', 'in_transit']);
    const { data: completedTrips } = await supabase
      .from('trips').select('*').eq('business_id', businessId).eq('status', 'completed');

    // Financial totals from trips
    const { data: tripsInRange } = await supabase
      .from('trips').select('*').eq('business_id', businessId).gte('trip_date', dateFrom).lte('trip_date', dateTo).neq('status', 'cancelled');

    const customerFreight = (tripsInRange ?? []).reduce((sum, t) => sum + Number(t.customer_freight), 0);
    const ownTrips = (tripsInRange ?? []).filter((t: any) => t.ownership_type_snapshot === 'own');
    const attachedTrips = (tripsInRange ?? []).filter((t: any) => t.ownership_type_snapshot === 'attached');
    const ownFreight = ownTrips.reduce((s, t) => s + Number(t.customer_freight), 0);
    const attachedFreight = attachedTrips.reduce((s, t) => s + Number(t.customer_freight), 0);
    const truckOwnerCost = attachedTrips.reduce((s, t) => s + Number(t.truck_owner_cost), 0);

    // Trip expenses
    const { data: expenses } = await supabase
      .from('trip_expenses').select('*').eq('business_id', businessId).gte('expense_date', dateFrom).lte('expense_date', dateTo).eq('is_reversed', false);
    const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

    // Expenses by trip ownership
    const ownTripIds = new Set(ownTrips.map((t: any) => t.id));
    const attachedTripIds = new Set(attachedTrips.map((t: any) => t.id));
    const ownExpenses = (expenses ?? []).filter((e: any) => ownTripIds.has(e.trip_id)).reduce((s, e) => s + Number(e.amount), 0);
    const attachedExpenses = (expenses ?? []).filter((e: any) => attachedTripIds.has(e.trip_id)).reduce((s, e) => s + Number(e.amount), 0);

    const ownFleetMargin = ownFreight - ownExpenses;
    const attachedFleetMargin = attachedFreight - truckOwnerCost - attachedExpenses;

    // Customer bills
    const { data: bills } = await supabase
      .from('customer_bills').select('*').eq('business_id', businessId).in('status', ['issued', 'partially_paid']);
    const customerFreightBilled = (bills ?? []).reduce((s, b) => s + Number(b.total_amount), 0);

    // Payments
    const { data: receipts } = await supabase
      .from('payments').select('*').eq('business_id', businessId).eq('payment_type', 'customer_receipt').eq('is_reversed', false).gte('payment_date', dateFrom).lte('payment_date', dateTo);
    const customerReceipts = (receipts ?? []).reduce((s, p) => s + Number(p.amount), 0);

    // Outstanding from bills
    const outstandingBills = (bills ?? []).filter((b: any) => b.status !== 'paid' && b.status !== 'cancelled');
    let customerOutstanding = 0;
    for (const bill of outstandingBills) {
      const { data: allocs } = await supabase
        .from('payment_allocations').select('allocated_amount').eq('bill_id', bill.id);
      const allocated = (allocs ?? []).reduce((s, a) => s + Number(a.allocated_amount), 0);
      customerOutstanding += Number(bill.total_amount) - allocated;
    }

    // Truck owner payables from settlements
    const { data: settlements } = await supabase
      .from('truck_owner_settlements').select('*').eq('business_id', businessId).neq('status', 'cancelled');
    const truckOwnerPayable = (settlements ?? []).reduce((s, st) => s + Number(st.balance_amount), 0);

    // Recent trips
    const { data: recentTrips } = await supabase
      .from('trips').select('*, party:parties!trips_party_id_fkey(*)').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5);

    // Recent payments
    const { data: recentPayments } = await supabase
      .from('payments').select('*, party:parties(*)').eq('business_id', businessId).eq('is_reversed', false).order('created_at', { ascending: false }).limit(5);

    // Outstanding bills detail
    const { data: outstandingBillsDetail } = await supabase
      .from('customer_bills').select('*, customer_party:parties(*)').eq('business_id', businessId).in('status', ['issued', 'partially_paid']).order('bill_date', { ascending: false }).limit(5);

    // Pending settlements
    const { data: pendingSettlements } = await supabase
      .from('truck_owner_settlements').select('*, truck_owner_party:parties(*), trip:trips(*)').eq('business_id', businessId).in('status', ['pending', 'partially_settled']).order('settlement_date', { ascending: false }).limit(5);

    // Monthly freight trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    const { data: allTrips } = await supabase
      .from('trips').select('trip_date, customer_freight, ownership_type_snapshot, status').eq('business_id', businessId).gte('trip_date', sixMonthsAgo.toISOString().split('T')[0]).neq('status', 'cancelled');

    const monthMap: Record<string, { own: number; attached: number; total: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      monthMap[key] = { own: 0, attached: 0, total: 0 };
    }
    (allTrips ?? []).forEach((t: any) => {
      const d = new Date(t.trip_date);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (monthMap[key]) {
        const freight = Number(t.customer_freight);
        monthMap[key].total += freight;
        if (t.ownership_type_snapshot === 'own') monthMap[key].own += freight;
        else monthMap[key].attached += freight;
      }
    });
    const monthlyFreightTrend = Object.entries(monthMap).map(([month, v]) => ({ month, ...v }));

    // Expense trend by category
    const { data: allExpenses } = await supabase
      .from('trip_expenses').select('expense_category, amount, expense_date').eq('business_id', businessId).eq('is_reversed', false).gte('expense_date', sixMonthsAgo.toISOString().split('T')[0]);

    const expenseByMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      expenseByMonth[key] = 0;
    }
    (allExpenses ?? []).forEach((e: any) => {
      const d = new Date(e.expense_date);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (expenseByMonth[key] !== undefined) expenseByMonth[key] += Number(e.amount);
    });
    const expenseTrend = Object.entries(expenseByMonth).map(([month, amount]) => ({ month, expenses: amount }));

    // Trips by vehicle
    const { data: tripsByVehicleData } = await supabase
      .from('trips').select('vehicle_id, vehicle:vehicles(vehicle_number), market_vehicle_number').eq('business_id', businessId).gte('trip_date', dateFrom).lte('trip_date', dateTo).neq('status', 'cancelled');

    const vehicleCountMap: Record<string, number> = {};
    (tripsByVehicleData ?? []).forEach((t: any) => {
      const vnum = t.vehicle?.vehicle_number ?? t.market_vehicle_number ?? 'Unassigned';
      vehicleCountMap[vnum] = (vehicleCountMap[vnum] ?? 0) + 1;
    });
    const tripsByVehicle = Object.entries(vehicleCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    setData({
      tripsToday: tripsToday?.length ?? 0,
      tripsThisMonth: tripsMonth?.length ?? 0,
      tripsInProgress: tripsInProgress?.length ?? 0,
      completedTrips: completedTrips?.length ?? 0,
      customerFreightBilled,
      customerReceipts,
      customerOutstanding,
      truckOwnerPayable,
      tripExpenses: totalExpenses,
      ownFleetMargin,
      attachedFleetMargin,
      recentTrips: recentTrips ?? [],
      recentPayments: recentPayments ?? [],
      outstandingBills: outstandingBillsDetail ?? [],
      pendingSettlements: pendingSettlements ?? [],
      monthlyFreightTrend,
      expenseTrend,
      tripsByVehicle,
    });
    setLoading(false);
  }, [businessId, dateFrom, dateTo]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) return (
    <div>
      <PageHeader title="Dashboard" subtitle={settings?.business_name ?? 'Gokul Cargo Movers'} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 11 }).map((_, i) => (
          <Card key={i} className="p-4 animate-pulse"><div className="w-9 h-9 rounded-lg bg-navy-100 mb-2" /><div className="h-3 bg-navy-100 rounded mb-1" /><div className="h-5 bg-navy-100 rounded w-2/3" /></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5"><div className="h-4 bg-navy-100 rounded w-1/3 mb-4" /><div className="h-48 bg-navy-50 rounded" /></Card>
        <Card className="p-5"><div className="h-4 bg-navy-100 rounded w-1/3 mb-4" /><div className="h-48 bg-navy-50 rounded" /></Card>
      </div>
    </div>
  );

  const stats = [
    { label: 'Trips Today', value: String(data?.tripsToday ?? 0), icon: <Package size={18} />, color: 'bg-blue-50 text-blue-700' },
    { label: 'Trips This Month', value: String(data?.tripsThisMonth ?? 0), icon: <Package size={18} />, color: 'bg-navy-50 text-navy-700' },
    { label: 'In Progress', value: String(data?.tripsInProgress ?? 0), icon: <Truck size={18} />, color: 'bg-yellow-50 text-yellow-700' },
    { label: 'Completed', value: String(data?.completedTrips ?? 0), icon: <Package size={18} />, color: 'bg-green-50 text-green-700' },
    { label: 'Freight Billed', value: formatCurrency(data?.customerFreightBilled ?? 0), icon: <Receipt size={18} />, color: 'bg-blue-50 text-blue-700' },
    { label: 'Receipts Collected', value: formatCurrency(data?.customerReceipts ?? 0), icon: <Wallet size={18} />, color: 'bg-green-50 text-green-700' },
    { label: 'Customer Outstanding', value: formatCurrency(data?.customerOutstanding ?? 0), icon: <AlertCircle size={18} />, color: 'bg-orange-50 text-orange-700' },
    { label: 'Truck Owner Payable', value: formatCurrency(data?.truckOwnerPayable ?? 0), icon: <Wallet size={18} />, color: 'bg-red-50 text-red-700' },
    { label: 'Trip Expenses', value: formatCurrency(data?.tripExpenses ?? 0), icon: <Receipt size={18} />, color: 'bg-red-50 text-red-700' },
    { label: 'Own Fleet Margin', value: formatCurrency(data?.ownFleetMargin ?? 0), icon: <TrendingUp size={18} />, color: 'bg-green-50 text-green-700', note: 'Recorded margin' },
    { label: 'Attached Fleet Margin', value: formatCurrency(data?.attachedFleetMargin ?? 0), icon: <TrendingUp size={18} />, color: 'bg-green-50 text-green-700', note: 'Recorded margin' },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={settings?.business_name ?? 'Gokul Cargo Movers'}
        actions={
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-navy-400" />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-sm border border-navy-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-navy-300" />
            <span className="text-navy-400 text-sm">to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-sm border border-navy-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-navy-300" />
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
            </div>
            <p className="text-xs text-navy-400 font-medium mb-1">{stat.label}</p>
            <p className="text-lg font-bold text-navy-800">{stat.value}</p>
            {stat.note && <p className="text-[10px] text-navy-300 mt-0.5">{stat.note}</p>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-4">Monthly Freight Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data?.monthlyFreightTrend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="own" stroke="#102a43" strokeWidth={2} name="Own Fleet" />
              <Line type="monotone" dataKey="attached" stroke="#486581" strokeWidth={2} name="Attached" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-4">Expense Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.expenseTrend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Bar dataKey="expenses" fill="#486581" radius={[4, 4, 0, 0]} name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {data && data.tripsByVehicle.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="text-sm font-semibold text-navy-700 mb-4">Trips by Vehicle</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.tripsByVehicle} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#334e68" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-navy-700">Recent Trips</h3>
            <Link to="/trips" className="text-xs text-navy-500 hover:text-navy-700 flex items-center gap-1">View all <ArrowRight size={12} /></Link>
          </div>
          {data?.recentTrips.length === 0 ? (
            <p className="text-sm text-navy-400 text-center py-4">No trips yet</p>
          ) : (
            <div className="space-y-2">
              {data?.recentTrips.map((trip: any) => (
                <Link key={trip.id} to={`/trips/${trip.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-800 truncate">{trip.trip_number} · {trip.party?.party_name ?? '—'}</p>
                    <p className="text-xs text-navy-400">{formatDate(trip.trip_date)} · {trip.origin} → {trip.destination}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-navy-700">{formatCurrency(trip.customer_freight)}</span>
                    <StatusBadge status={trip.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-navy-700">Recent Payments</h3>
            <Link to="/payments" className="text-xs text-navy-500 hover:text-navy-700 flex items-center gap-1">View all <ArrowRight size={12} /></Link>
          </div>
          {data?.recentPayments.length === 0 ? (
            <p className="text-sm text-navy-400 text-center py-4">No payments yet</p>
          ) : (
            <div className="space-y-2">
              {data?.recentPayments.map((payment: any) => (
                <Link key={payment.id} to="/payments" className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-800 truncate">{payment.party?.party_name ?? '—'}</p>
                    <p className="text-xs text-navy-400">{formatDate(payment.payment_date)} · {payment.payment_type.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-700 flex-shrink-0">{formatCurrency(payment.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-navy-700">Outstanding Bills</h3>
            <Link to="/customer-billing" className="text-xs text-navy-500 hover:text-navy-700 flex items-center gap-1">View all <ArrowRight size={12} /></Link>
          </div>
          {data?.outstandingBills.length === 0 ? (
            <p className="text-sm text-navy-400 text-center py-4">No outstanding bills</p>
          ) : (
            <div className="space-y-2">
              {data?.outstandingBills.map((bill: any) => (
                <Link key={bill.id} to={`/customer-billing/${bill.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-800 truncate">{bill.bill_number} · {bill.customer_party?.party_name ?? '—'}</p>
                    <p className="text-xs text-navy-400">{formatDate(bill.bill_date)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-orange-700">{formatCurrency(bill.total_amount)}</span>
                    <StatusBadge status={bill.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-navy-700">Pending Settlements</h3>
            <Link to="/settlements" className="text-xs text-navy-500 hover:text-navy-700 flex items-center gap-1">View all <ArrowRight size={12} /></Link>
          </div>
          {data?.pendingSettlements.length === 0 ? (
            <p className="text-sm text-navy-400 text-center py-4">No pending settlements</p>
          ) : (
            <div className="space-y-2">
              {data?.pendingSettlements.map((st: any) => (
                <Link key={st.id} to="/settlements" className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-800 truncate">{st.truck_owner_party?.party_name ?? '—'}</p>
                    <p className="text-xs text-navy-400">{st.trip?.trip_number ?? '—'} · {formatDate(st.settlement_date)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-red-700">{formatCurrency(st.balance_amount)}</span>
                    <StatusBadge status={st.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
