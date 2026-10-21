import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Party } from '@/types/database';
import { Button, Card, PageHeader, LoadingSpinner, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate, downloadCSV } from '@/lib/format';
import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';

export function OutstandingPage() {
  const { businessId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [receivables, setReceivables] = useState<{ party: Party; balance: number }[]>([]);
  const [payables, setPayables] = useState<{ party: Party; balance: number }[]>([]);
  const [outstandingBills, setOutstandingBills] = useState<any[]>([]);
  const [pendingSettlements, setPendingSettlements] = useState<any[]>([]);
  const [unallocatedAdvances, setUnallocatedAdvances] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    const { data: parties } = await supabase.from('parties').select('*').eq('business_id', businessId);
    const recv: { party: Party; balance: number }[] = [];
    const payb: { party: Party; balance: number }[] = [];
    for (const p of parties ?? []) {
      const { data: ledger } = await supabase.from('ledger_entries').select('debit, credit').eq('party_id', p.id).eq('is_reversed', false);
      const debit = (ledger ?? []).reduce((s, e) => s + Number(e.debit), 0);
      const credit = (ledger ?? []).reduce((s, e) => s + Number(e.credit), 0);
      const balance = debit - credit;
      if (balance > 0.01) recv.push({ party: p as Party, balance });
      else if (balance < -0.01) payb.push({ party: p as Party, balance: Math.abs(balance) });
    }
    recv.sort((a, b) => b.balance - a.balance);
    payb.sort((a, b) => b.balance - a.balance);
    setReceivables(recv);
    setPayables(payb);

    const { data: bills } = await supabase.from('customer_bills').select('*, customer_party:parties(*)').eq('business_id', businessId).in('status', ['issued', 'partially_paid']).order('bill_date', { ascending: false });
    const billsWithAlloc = [];
    for (const b of bills ?? []) {
      const { data: allocs } = await supabase.from('payment_allocations').select('allocated_amount').eq('bill_id', b.id);
      const allocated = (allocs ?? []).reduce((s, a) => s + Number(a.allocated_amount), 0);
      const outstanding = Number(b.total_amount) - allocated;
      if (outstanding > 0.01) billsWithAlloc.push({ ...b, outstanding });
    }
    setOutstandingBills(billsWithAlloc);

    const { data: settlements } = await supabase.from('truck_owner_settlements').select('*, truck_owner_party:parties!truck_owner_settlements_truck_owner_party_id_fkey(*), trip:trips(*)').eq('business_id', businessId).in('status', ['pending', 'partially_settled']).order('settlement_date', { ascending: false });
    setPendingSettlements((settlements ?? []) as any[]);

    const { data: payments } = await supabase.from('payments').select('*, party:parties(*)').eq('business_id', businessId).eq('payment_type', 'customer_receipt').eq('is_reversed', false);
    const advances = [];
    for (const pmt of payments ?? []) {
      const { data: allocs } = await supabase.from('payment_allocations').select('allocated_amount').eq('payment_id', pmt.id);
      const allocated = (allocs ?? []).reduce((s, a) => s + Number(a.allocated_amount), 0);
      const unalloc = Number(pmt.amount) - allocated;
      if (unalloc > 0.01) advances.push({ ...pmt, unallocated: unalloc });
    }
    setUnallocatedAdvances(advances);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    const rows: (string | number)[][] = [['Type', 'Party', 'Amount', 'Details']];
    receivables.forEach((r) => rows.push(['Receivable', r.party.party_name, r.balance, 'Customer outstanding']));
    payables.forEach((p) => rows.push(['Payable', p.party.party_name, p.balance, 'Supplier payable']));
    outstandingBills.forEach((b) => rows.push(['Bill Outstanding', b.customer_party?.party_name ?? '', b.outstanding, b.bill_number]));
    downloadCSV('outstanding-balances.csv', rows);
  };

  if (loading) return <LoadingSpinner size="lg" />;

  const totalRecv = receivables.reduce((s, r) => s + r.balance, 0);
  const totalPayb = payables.reduce((s, p) => s + p.balance, 0);

  return (
    <div>
      <PageHeader title="Outstanding Balances" subtitle="Customer receivables and supplier payables" actions={<Button variant="outline" onClick={handleExport}><Download size={16} /> Export</Button>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-5"><p className="text-xs text-navy-400">Total Receivables</p><p className="text-2xl font-bold text-green-700">{formatCurrency(totalRecv)}</p><p className="text-xs text-navy-400 mt-1">{receivables.length} parties</p></Card>
        <Card className="p-5"><p className="text-xs text-navy-400">Total Payables</p><p className="text-2xl font-bold text-red-700">{formatCurrency(totalPayb)}</p><p className="text-xs text-navy-400 mt-1">{payables.length} parties</p></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="overflow-hidden"><div className="px-5 py-3 border-b border-navy-100"><h3 className="text-sm font-semibold text-navy-700">Customer Receivables</h3></div>
          {receivables.length === 0 ? <p className="text-sm text-navy-400 text-center py-8">No outstanding receivables</p> : <div className="divide-y divide-navy-50">{receivables.map((r) => (
            <Link key={r.party.id} to={`/parties/${r.party.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-navy-50"><div><p className="text-sm font-medium text-navy-800">{r.party.party_name}</p><p className="text-xs text-navy-400">{r.party.phone ?? ''}</p></div><span className="text-sm font-bold text-green-700">{formatCurrency(r.balance)} Dr</span></Link>
          ))}</div>}
        </Card>
        <Card className="overflow-hidden"><div className="px-5 py-3 border-b border-navy-100"><h3 className="text-sm font-semibold text-navy-700">Supplier / Truck Owner Payables</h3></div>
          {payables.length === 0 ? <p className="text-sm text-navy-400 text-center py-8">No outstanding payables</p> : <div className="divide-y divide-navy-50">{payables.map((p) => (
            <Link key={p.party.id} to={`/parties/${p.party.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-navy-50"><div><p className="text-sm font-medium text-navy-800">{p.party.party_name}</p><p className="text-xs text-navy-400">{p.party.phone ?? ''}</p></div><span className="text-sm font-bold text-red-700">{formatCurrency(p.balance)} Cr</span></Link>
          ))}</div>}
        </Card>
      </div>

      <Card className="overflow-hidden mb-6"><div className="px-5 py-3 border-b border-navy-100"><h3 className="text-sm font-semibold text-navy-700">Outstanding Bills</h3></div>
        {outstandingBills.length === 0 ? <p className="text-sm text-navy-400 text-center py-8">No outstanding bills</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-navy-50 text-navy-600"><tr><th className="text-left px-4 py-2 font-semibold">Bill No</th><th className="text-left px-4 py-2 font-semibold">Customer</th><th className="text-left px-4 py-2 font-semibold">Date</th><th className="text-right px-4 py-2 font-semibold">Total</th><th className="text-right px-4 py-2 font-semibold">Outstanding</th><th className="text-center px-4 py-2 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-navy-50">{outstandingBills.map((b) => (
          <tr key={b.id} className="hover:bg-navy-50/50"><td className="px-4 py-2 font-medium text-navy-800">{b.bill_number}</td><td className="px-4 py-2 text-navy-700">{b.customer_party?.party_name ?? '—'}</td><td className="px-4 py-2 text-navy-600">{formatDate(b.bill_date)}</td><td className="px-4 py-2 text-right font-medium">{formatCurrency(b.total_amount)}</td><td className="px-4 py-2 text-right font-bold text-orange-700">{formatCurrency(b.outstanding)}</td><td className="px-4 py-2 text-center"><StatusBadge status={b.status} /></td></tr>
        ))}</tbody></table></div>}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden"><div className="px-5 py-3 border-b border-navy-100"><h3 className="text-sm font-semibold text-navy-700">Pending Settlements</h3></div>
          {pendingSettlements.length === 0 ? <p className="text-sm text-navy-400 text-center py-8">No pending settlements</p> : <div className="divide-y divide-navy-50">{pendingSettlements.map((s) => (
            <Link key={s.id} to="/settlements" className="flex items-center justify-between px-5 py-3 hover:bg-navy-50"><div><p className="text-sm font-medium text-navy-800">{s.truck_owner_party?.party_name ?? '—'}</p><p className="text-xs text-navy-400">{s.trip?.trip_number} · {formatDate(s.settlement_date)}</p></div><span className="text-sm font-bold text-red-700">{formatCurrency(s.balance_amount)}</span></Link>
          ))}</div>}
        </Card>
        <Card className="overflow-hidden"><div className="px-5 py-3 border-b border-navy-100"><h3 className="text-sm font-semibold text-navy-700">Unallocated Advances</h3></div>
          {unallocatedAdvances.length === 0 ? <p className="text-sm text-navy-400 text-center py-8">No unallocated advances</p> : <div className="divide-y divide-navy-50">{unallocatedAdvances.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3"><div><p className="text-sm font-medium text-navy-800">{a.party?.party_name ?? '—'}</p><p className="text-xs text-navy-400">{formatDate(a.payment_date)} · {a.reference_number ?? ''}</p></div><span className="text-sm font-bold text-blue-700">{formatCurrency(a.unallocated)}</span></div>
          ))}</div>}
        </Card>
      </div>
    </div>
  );
}
