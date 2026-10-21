import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button, Card, PageHeader, LoadingSpinner } from '@/components/ui';
import { formatCurrency, formatDate, downloadCSV, todayISODate, firstDayOfMonth } from '@/lib/format';
import { BarChart3, Download, Printer } from 'lucide-react';

const REPORT_TYPES = [
  { value: 'trip_register', label: 'Trip Register' },
  { value: 'customer_trips', label: 'Customer-wise Trips' },
  { value: 'vehicle_trips', label: 'Vehicle-wise Trips' },
  { value: 'driver_trips', label: 'Driver-wise Trips' },
  { value: 'route_trips', label: 'Route-wise Trips' },
  { value: 'fleet_comparison', label: 'Own vs Market Fleet' },
  { value: 'customer_freight', label: 'Customer Freight Report' },
  { value: 'customer_bills', label: 'Customer Billing Report' },
  { value: 'receipts', label: 'Customer Receipts Report' },
  { value: 'expenses', label: 'Trip Expense Report' },
  { value: 'expense_category', label: 'Expense Category Report' },
  { value: 'truck_owner_cost', label: 'Truck Owner Cost Report' },
  { value: 'settlements', label: 'Truck Owner Settlement Report' },
  { value: 'customer_outstanding', label: 'Customer Outstanding' },
  { value: 'truck_owner_payable', label: 'Truck Owner Payable' },
  { value: 'trip_margin', label: 'Recorded Trip Margin' },
  { value: 'monthly_summary', label: 'Monthly Business Summary' },
];

const CURRENCY_KEYWORDS = ['freight', 'amount', 'cost', 'margin', 'total', 'balance', 'value', 'agreed', 'paid', 'subtotal', 'adjustments', 'avg'];

function isCurrencyColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return CURRENCY_KEYWORDS.some((k) => lower.includes(k));
}

export function ReportsPage() {
  const { businessId } = useAuth();
  const [reportType, setReportType] = useState('trip_register');
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(todayISODate());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);

  const loadReport = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    setData([]);
    setColumns([]);

    if (reportType === 'trip_register' || reportType === 'customer_trips' || reportType === 'vehicle_trips' || reportType === 'driver_trips' || reportType === 'route_trips' || reportType === 'customer_freight' || reportType === 'trip_margin' || reportType === 'fleet_comparison') {
      const { data: trips } = await supabase.from('trips').select('*, party:parties!trips_party_id_fkey(*), vehicle:vehicles(*), driver:drivers(*), route:routes(*)').eq('business_id', businessId).neq('status', 'cancelled').gte('trip_date', dateFrom).lte('trip_date', dateTo).order('trip_date', { ascending: false });

      if (reportType === 'trip_register') {
        setColumns(['Trip No', 'Date', 'Customer', 'Origin', 'Destination', 'Vehicle', 'Freight', 'Type', 'Status']);
        setData((trips ?? []).map((t: any) => [t.trip_number, formatDate(t.trip_date), t.party?.party_name, t.origin, t.destination, t.vehicle?.vehicle_number ?? t.market_vehicle_number, t.customer_freight, t.ownership_type_snapshot, t.status]));
      } else if (reportType === 'customer_trips') {
        setColumns(['Customer', 'Trips', 'Total Freight']);
        const grouped: Record<string, { count: number; freight: number }> = {};
        (trips ?? []).forEach((t: any) => { const k = t.party?.party_name ?? '—'; grouped[k] = grouped[k] ?? { count: 0, freight: 0 }; grouped[k].count++; grouped[k].freight += Number(t.customer_freight); });
        setData(Object.entries(grouped).map(([k, v]) => [k, v.count, v.freight]));
      } else if (reportType === 'vehicle_trips') {
        setColumns(['Vehicle', 'Trips', 'Total Freight']);
        const grouped: Record<string, { count: number; freight: number }> = {};
        (trips ?? []).forEach((t: any) => { const k = t.vehicle?.vehicle_number ?? t.market_vehicle_number ?? 'Unassigned'; grouped[k] = grouped[k] ?? { count: 0, freight: 0 }; grouped[k].count++; grouped[k].freight += Number(t.customer_freight); });
        setData(Object.entries(grouped).map(([k, v]) => [k, v.count, v.freight]));
      } else if (reportType === 'driver_trips') {
        setColumns(['Driver', 'Trips', 'Total Freight']);
        const grouped: Record<string, { count: number; freight: number }> = {};
        (trips ?? []).forEach((t: any) => { const k = t.driver?.driver_name ?? 'Unassigned'; grouped[k] = grouped[k] ?? { count: 0, freight: 0 }; grouped[k].count++; grouped[k].freight += Number(t.customer_freight); });
        setData(Object.entries(grouped).map(([k, v]) => [k, v.count, v.freight]));
      } else if (reportType === 'route_trips') {
        setColumns(['Route', 'Trips', 'Total Freight']);
        const grouped: Record<string, { count: number; freight: number }> = {};
        (trips ?? []).forEach((t: any) => { const k = `${t.origin} → ${t.destination}`; grouped[k] = grouped[k] ?? { count: 0, freight: 0 }; grouped[k].count++; grouped[k].freight += Number(t.customer_freight); });
        setData(Object.entries(grouped).map(([k, v]) => [k, v.count, v.freight]));
      } else if (reportType === 'customer_freight') {
        setColumns(['Trip No', 'Date', 'Customer', 'Freight', 'Rate Type', 'Applied Rate']);
        setData((trips ?? []).map((t: any) => [t.trip_number, formatDate(t.trip_date), t.party?.party_name, t.customer_freight, t.rate_type, t.applied_rate]));
      } else if (reportType === 'trip_margin') {
        const tripIds = (trips ?? []).map((t: any) => t.id);
        const { data: expenses } = await supabase.from('trip_expenses').select('trip_id, amount').eq('is_reversed', false).in('trip_id', tripIds);
        const expMap: Record<string, number> = {};
        (expenses ?? []).forEach((e: any) => { expMap[e.trip_id] = (expMap[e.trip_id] ?? 0) + Number(e.amount); });
        setColumns(['Trip No', 'Date', 'Customer', 'Freight', 'Truck Owner Cost', 'Type', 'Expenses', 'Margin']);
        setData((trips ?? []).map((t: any) => { const exp = expMap[t.id] ?? 0; const margin = Number(t.customer_freight) - Number(t.truck_owner_cost) - exp; return [t.trip_number, formatDate(t.trip_date), t.party?.party_name, t.customer_freight, t.truck_owner_cost, t.ownership_type_snapshot, exp, margin]; }));
      } else if (reportType === 'fleet_comparison') {
        setColumns(['Fleet Type', 'Trips', 'Total Freight', 'Truck Owner Cost', 'Avg Freight']);
        const own = (trips ?? []).filter((t: any) => t.ownership_type_snapshot === 'own');
        const attached = (trips ?? []).filter((t: any) => t.ownership_type_snapshot === 'attached');
        const ownFreight = own.reduce((s: number, t: any) => s + Number(t.customer_freight), 0);
        const attFreight = attached.reduce((s: number, t: any) => s + Number(t.customer_freight), 0);
        const attCost = attached.reduce((s: number, t: any) => s + Number(t.truck_owner_cost), 0);
        setData([['Own Fleet', own.length, ownFreight, 0, own.length ? ownFreight / own.length : 0], ['Attached/Market', attached.length, attFreight, attCost, attached.length ? attFreight / attached.length : 0]]);
      }
    } else if (reportType === 'customer_bills') {
      const { data: bills } = await supabase.from('customer_bills').select('*, customer_party:parties(*)').eq('business_id', businessId).gte('bill_date', dateFrom).lte('bill_date', dateTo).order('bill_date', { ascending: false });
      setColumns(['Bill No', 'Date', 'Customer', 'Subtotal', 'Adjustments', 'Total', 'Status']);
      setData((bills ?? []).map((b: any) => [b.bill_number, formatDate(b.bill_date), b.customer_party?.party_name, b.subtotal, b.adjustments, b.total_amount, b.status]));
    } else if (reportType === 'receipts') {
      const { data: payments } = await supabase.from('payments').select('*, party:parties(*)').eq('business_id', businessId).eq('payment_type', 'customer_receipt').eq('is_reversed', false).gte('payment_date', dateFrom).lte('payment_date', dateTo).order('payment_date', { ascending: false });
      setColumns(['Date', 'Party', 'Amount', 'Method', 'Reference']);
      setData((payments ?? []).map((p: any) => [formatDate(p.payment_date), p.party?.party_name, p.amount, p.payment_method, p.reference_number]));
    } else if (reportType === 'expenses' || reportType === 'expense_category') {
      const { data: expenses } = await supabase.from('trip_expenses').select('*, trip:trips(*)').eq('business_id', businessId).eq('is_reversed', false).gte('expense_date', dateFrom).lte('expense_date', dateTo);
      if (reportType === 'expenses') { setColumns(['Date', 'Trip', 'Category', 'Amount', 'Method']); setData((expenses ?? []).map((e: any) => [formatDate(e.expense_date), e.trip?.trip_number, e.expense_category, e.amount, e.payment_method])); }
      else { setColumns(['Category', 'Count', 'Total']); const grouped: Record<string, { count: number; total: number }> = {}; (expenses ?? []).forEach((e: any) => { grouped[e.expense_category] = grouped[e.expense_category] ?? { count: 0, total: 0 }; grouped[e.expense_category].count++; grouped[e.expense_category].total += Number(e.amount); }); setData(Object.entries(grouped).map(([k, v]) => [k, v.count, v.total])); }
    } else if (reportType === 'truck_owner_cost') {
      const { data: trips } = await supabase.from('trips').select('*, truck_owner_party:parties!trips_truck_owner_party_id_fkey(*)').eq('business_id', businessId).eq('ownership_type_snapshot', 'attached').neq('status', 'cancelled').gte('trip_date', dateFrom).lte('trip_date', dateTo);
      setColumns(['Trip No', 'Date', 'Truck Owner', 'Vehicle', 'Agreed Cost']);
      setData((trips ?? []).map((t: any) => [t.trip_number, formatDate(t.trip_date), t.truck_owner_party?.party_name, t.market_vehicle_number ?? '—', t.truck_owner_cost]));
    } else if (reportType === 'settlements') {
      const { data: setts } = await supabase.from('truck_owner_settlements').select('*, truck_owner_party:parties!truck_owner_settlements_truck_owner_party_id_fkey(*), trip:trips(*)').eq('business_id', businessId).gte('settlement_date', dateFrom).lte('settlement_date', dateTo);
      setColumns(['Date', 'Truck Owner', 'Trip', 'Vehicle', 'Agreed', 'Paid', 'Balance', 'Status']);
      setData((setts ?? []).map((s: any) => [formatDate(s.settlement_date), s.truck_owner_party?.party_name, s.trip?.trip_number, s.trip?.market_vehicle_number ?? '—', s.agreed_amount, s.paid_amount, s.balance_amount, s.status]));
    } else if (reportType === 'monthly_summary') {
      const { data: trips } = await supabase.from('trips').select('*').eq('business_id', businessId).neq('status', 'cancelled').gte('trip_date', dateFrom).lte('trip_date', dateTo);
      const { data: expenses } = await supabase.from('trip_expenses').select('amount').eq('business_id', businessId).eq('is_reversed', false).gte('expense_date', dateFrom).lte('expense_date', dateTo);
      const { data: receipts } = await supabase.from('payments').select('amount').eq('business_id', businessId).eq('payment_type', 'customer_receipt').eq('is_reversed', false).gte('payment_date', dateFrom).lte('payment_date', dateTo);
      const totalFreight = (trips ?? []).reduce((s: number, t: any) => s + Number(t.customer_freight), 0);
      const totalExpenses = (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
      const totalReceipts = (receipts ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
      const truckOwnerCost = (trips ?? []).reduce((s: number, t: any) => s + Number(t.truck_owner_cost), 0);
      setColumns(['Metric', 'Value']);
      setData([['Total Trips', trips?.length ?? 0], ['Total Customer Freight', totalFreight], ['Total Trip Expenses', totalExpenses], ['Total Truck Owner Cost', truckOwnerCost], ['Total Receipts Collected', totalReceipts], ['Recorded Margin', totalFreight - truckOwnerCost - totalExpenses]]);
    } else if (reportType === 'customer_outstanding' || reportType === 'truck_owner_payable') {
      const { data: parties } = await supabase.from('parties').select('*').eq('business_id', businessId);
      setColumns(['Party', 'Phone', 'Balance', 'Type']);
      const rows: any[] = [];
      for (const p of parties ?? []) {
        const { data: ledger } = await supabase.from('ledger_entries').select('debit, credit').eq('party_id', p.id).eq('is_reversed', false);
        const bal = (ledger ?? []).reduce((s: number, e: any) => s + Number(e.debit) - Number(e.credit), 0);
        if (reportType === 'customer_outstanding' && bal > 0.01) rows.push([p.party_name, p.phone ?? '—', bal, 'Dr']);
        if (reportType === 'truck_owner_payable' && bal < -0.01) rows.push([p.party_name, p.phone ?? '—', Math.abs(bal), 'Cr']);
      }
      setData(rows);
    }
    setLoading(false);
  }, [businessId, reportType, dateFrom, dateTo]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const handleExport = () => { if (columns.length > 0) downloadCSV(`report-${reportType}.csv`, [columns, ...data]); };

  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Business reports with date-range filtering" actions={<div className="flex gap-2"><Button variant="outline" onClick={handleExport} disabled={data.length === 0}><Download size={16} /> Export CSV</Button><Button variant="outline" onClick={() => window.print()} disabled={data.length === 0}><Printer size={16} /> Print</Button></div>} />
      <Card className="p-4 mb-4"><div className="flex flex-col lg:flex-row gap-3 flex-wrap">
        <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">{REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" /><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
      </div></Card>
      {loading ? <LoadingSpinner /> : data.length === 0 ? <Card><div className="py-16 text-center"><BarChart3 size={48} className="mx-auto text-navy-300 mb-3" /><p className="text-sm text-navy-400">No data for the selected filters</p></div></Card> : (
        <Card className="overflow-hidden print-container" id="print-area"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600"><tr>{columns.map((c, i) => <th key={i} className="text-left px-4 py-3 font-semibold">{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy-50">{data.map((row, i) => (<tr key={i} className="hover:bg-navy-50/50">{row.map((cell: any, j: number) => <td key={j} className="px-4 py-3 text-navy-700">{typeof cell === 'number' && isCurrencyColumn(columns[j]) ? formatCurrency(cell) : String(cell)}</td>)}</tr>))}</tbody>
        </table></div></Card>
      )}
    </div>
  );
}
