import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry } from '@/lib/audit';
import { CustomerBill, CustomerBillItem, Trip, Party, BillStatus } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate, downloadCSV, todayISODate } from '@/lib/format';
import { CreditCard, Plus, Search, Eye, Printer, Download, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const PAGE_SIZE = 15;

export function CustomerBillingPage() {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [bills, setBills] = useState<(CustomerBill & { customer_party?: Party; allocated?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<CustomerBill | null>(null);

  const loadBills = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('customer_bills').select('*, customer_party:parties(*)').eq('business_id', businessId);
    if (search) query = query.or(`bill_number.ilike.%${search}%`);
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error, count } = await query.order('bill_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load bills', 'error'); setLoading(false); return; }
    const billsData = (data ?? []) as any[];
    const billsWithAlloc = [];
    for (const b of billsData) {
      const { data: allocs } = await supabase.from('payment_allocations').select('allocated_amount').eq('bill_id', b.id);
      const allocated = (allocs ?? []).reduce((s, a) => s + Number(a.allocated_amount), 0);
      billsWithAlloc.push({ ...b, allocated });
    }
    setBills(billsWithAlloc);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setLoading(false);
  }, [businessId, search, statusFilter, page, showToast]);

  useEffect(() => { loadBills(); }, [loadBills]);

  const handleCancel = async (bill: CustomerBill) => {
    if (!businessId) { setLoading(false); return; }
    if (bill.status === 'paid') { showToast('Cannot cancel a paid bill. Reverse payments first.', 'error'); setConfirmCancel(null); return; }
    const { error } = await supabase.from('customer_bills').update({ status: 'cancelled' }).eq('id', bill.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, 'bill_cancel', 'customer_bill', bill.id, { bill_number: bill.bill_number });
    const { data: ledger } = await supabase.from('ledger_entries').select('*').eq('reference_id', bill.id).eq('is_reversed', false).maybeSingle();
    if (ledger) {
      await supabase.from('ledger_entries').update({ is_reversed: true }).eq('id', ledger.id);
      await supabase.from('ledger_entries').insert({ business_id: businessId, party_id: ledger.party_id, transaction_date: todayISODate(), transaction_type: 'reversal', debit: ledger.credit, credit: ledger.debit, description: `Reversal: Bill ${bill.bill_number} cancelled`, reversal_of_entry_id: ledger.id, created_by: user?.id ?? null });
    }
    showToast('Bill cancelled');
    setConfirmCancel(null); loadBills();
  };

  const handleExport = () => {
    const rows: (string | number)[][] = [['Bill No', 'Date', 'Customer', 'Total', 'Allocated', 'Outstanding', 'Status']];
    bills.forEach((b) => rows.push([b.bill_number, formatDate(b.bill_date), b.customer_party?.party_name ?? '—', b.total_amount, b.allocated ?? 0, b.total_amount - (b.allocated ?? 0), b.status]));
    downloadCSV('customer-bills.csv', rows);
  };

  return (
    <div>
      <PageHeader title="Customer Billing" subtitle="Generate and manage customer bills" actions={
        <div className="flex gap-2"><Button variant="outline" onClick={handleExport}><Download size={16} /> Export</Button><Button onClick={() => setCreateOpen(true)}><Plus size={16} /> New Bill</Button></div>
      } />
      <Card className="p-4 mb-4">
        <div className="flex gap-3">
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-navy-400" /><input placeholder="Search by bill number..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" /></div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer"><option value="">All Status</option><option value="draft">Draft</option><option value="issued">Issued</option><option value="partially_paid">Partially Paid</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select>
        </div>
      </Card>
      {loading ? <LoadingSpinner /> : bills.length === 0 ? (
        <Card><EmptyState icon={<CreditCard size={48} />} title="No bills found" message="Create your first customer bill from completed trips." action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> New Bill</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-navy-50 text-navy-600"><tr><th className="text-left px-4 py-3 font-semibold">Bill No.</th><th className="text-left px-4 py-3 font-semibold">Date</th><th className="text-left px-4 py-3 font-semibold">Customer</th><th className="text-right px-4 py-3 font-semibold">Total</th><th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Allocated</th><th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Outstanding</th><th className="text-center px-4 py-3 font-semibold">Status</th><th className="text-right px-4 py-3 font-semibold">Actions</th></tr></thead>
            <tbody className="divide-y divide-navy-50">
              {bills.map((b) => (
                <tr key={b.id} className="hover:bg-navy-50/50 cursor-pointer" onClick={() => navigate(`/customer-billing/${b.id}`)}>
                  <td className="px-4 py-3 font-medium text-navy-800">{b.bill_number}</td>
                  <td className="px-4 py-3 text-navy-600">{formatDate(b.bill_date)}</td>
                  <td className="px-4 py-3 text-navy-700">{b.customer_party?.party_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-navy-800">{formatCurrency(b.total_amount)}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell text-green-700">{formatCurrency(b.allocated ?? 0)}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell font-semibold text-orange-700">{formatCurrency(b.total_amount - (b.allocated ?? 0))}</td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1"><button onClick={() => navigate(`/customer-billing/${b.id}`)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Eye size={15} /></button>{b.status === 'draft' || b.status === 'issued' ? <button onClick={() => setConfirmCancel(b)} className="p-1.5 rounded-lg hover:bg-navy-100 text-red-600"><X size={15} /></button> : null}</div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}
      <CreateBillModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); loadBills(); }} />
      <ConfirmDialog open={!!confirmCancel} onClose={() => setConfirmCancel(null)} onConfirm={() => confirmCancel && handleCancel(confirmCancel)} title="Cancel Bill" message={`Cancel bill ${confirmCancel?.bill_number}? This will reverse the ledger entry.`} confirmText="Cancel Bill" danger />
    </div>
  );
}

function CreateBillModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState('');
  const [eligibleTrips, setEligibleTrips] = useState<Trip[]>([]);
  const [selectedTrips, setSelectedTrips] = useState<Set<string>>(new Set());
  const [adjustments, setAdjustments] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [billDate, setBillDate] = useState(todayISODate());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId || !open) { setParties([]); return; }
    supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).in('party_type', ['customer', 'both']).order('party_name').then(({ data, error }) => {
      if (error) { showToast('Failed to load customers', 'error'); return; }
      setParties(data as Party[] ?? []);
    });
  }, [businessId, open, showToast]);

  const loadEligibleTrips = useCallback(async () => {
    if (!businessId || !selectedParty) { setEligibleTrips([]); setTripsError(null); return; }
    setLoadingTrips(true);
    setTripsError(null);
    const { data, error } = await supabase.from('trips').select('*').eq('business_id', businessId).eq('party_id', selectedParty).eq('status', 'completed').order('trip_date', { ascending: false });
    if (error) {
      setTripsError(error.message);
      setEligibleTrips([]);
      setLoadingTrips(false);
      return;
    }
    const allTrips = data as Trip[] ?? [];
    const unbilled: Trip[] = [];
    for (const t of allTrips) {
      const { data: billItem, error: billError } = await supabase.from('customer_bill_items').select('id').eq('trip_id', t.id).maybeSingle();
      if (billError) continue;
      if (!billItem) unbilled.push(t);
    }
    setEligibleTrips(unbilled);
    setLoadingTrips(false);
  }, [businessId, selectedParty]);

  useEffect(() => {
    if (!open) { setEligibleTrips([]); setTripsError(null); return; }
    loadEligibleTrips();
  }, [loadEligibleTrips, open]);

  const subtotal = eligibleTrips.filter((t) => selectedTrips.has(t.id)).reduce((s, t) => s + Number(t.customer_freight), 0);
  const total = subtotal + adjustments;

  const handleSave = async (issue: boolean) => {
    if (!businessId || !selectedParty || selectedTrips.size === 0) { showToast('Select at least one trip', 'error'); return; }
    if (adjustments !== 0 && !adjustmentReason.trim()) { showToast('Adjustment reason is required', 'error'); return; }
    setSaving(true);
    try {
      const { data: seqResult, error: seqError } = await supabase.rpc('get_next_document_number', { b_id: businessId, p_doc_type: 'bill' });
      if (seqError) throw seqError;
      const billNumber = seqResult as string;

      const { data: bill, error } = await supabase.from('customer_bills').insert({
        business_id: businessId, bill_number: billNumber, customer_party_id: selectedParty,
        bill_date: billDate, subtotal, adjustments, adjustment_reason: adjustmentReason || null,
        total_amount: total, status: issue ? 'issued' : 'draft', notes, created_by: user?.id ?? null,
      }).select('*').maybeSingle();
      if (error) throw error;

      const items = eligibleTrips.filter((t) => selectedTrips.has(t.id)).map((t) => ({
        business_id: businessId, bill_id: bill.id, trip_id: t.id,
        description: `Trip ${t.trip_number}: ${t.origin} → ${t.destination} (${formatDate(t.trip_date)})`,
        quantity: t.quantity, rate: t.applied_rate, amount: Number(t.customer_freight),
      }));
      const { error: itemsError } = await supabase.from('customer_bill_items').insert(items);
      if (itemsError) throw itemsError;

      await logAudit(businessId, user?.id ?? null, issue ? 'bill_issue' : 'bill_create', 'customer_bill', bill.id, { bill_number: billNumber });

      if (issue) {
        await createLedgerEntry(businessId, selectedParty, billDate, 'customer_bill', total, 0, `Bill ${billNumber}`, 'customer_bill', bill.id, user?.id ?? null);
        showToast(`Bill ${billNumber} issued successfully`);
      } else {
        showToast(`Bill ${billNumber} saved as draft`);
      }
      onSaved();
    } catch (err: any) { showToast(err.message ?? 'Failed to create bill', 'error'); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Customer Bill" size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Customer" value={selectedParty} onChange={(e) => { setSelectedParty(e.target.value); setSelectedTrips(new Set()); }}><option value="">Select customer...</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}</Select>
          <Input label="Bill Date" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </div>

        {selectedParty && (
          <div>
            <h3 className="text-sm font-semibold text-navy-700 mb-2">Eligible Unbilled Trips</h3>
            {loadingTrips ? <LoadingSpinner /> : tripsError ? (
              <div className="py-4 text-center">
                <p className="text-sm text-red-600 mb-2">Failed to load trips: {tripsError}</p>
                <Button variant="outline" size="sm" onClick={loadEligibleTrips}>Retry</Button>
              </div>
            ) : eligibleTrips.length === 0 ? <p className="text-sm text-navy-400 py-4 text-center">No eligible unbilled completed trips for this customer. Only completed trips that haven't been billed yet will appear here.</p> : (
              <div className="border border-navy-100 rounded-lg max-h-60 overflow-y-auto">
                {eligibleTrips.map((t) => (
                  <label key={t.id} className="flex items-center gap-3 p-3 hover:bg-navy-50 border-b border-navy-50 last:border-0 cursor-pointer">
                    <input type="checkbox" checked={selectedTrips.has(t.id)} onChange={() => { const s = new Set(selectedTrips); s.has(t.id) ? s.delete(t.id) : s.add(t.id); setSelectedTrips(s); }} className="w-4 h-4 accent-navy-700" />
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-navy-800">{t.trip_number} · {formatDate(t.trip_date)}</p><p className="text-xs text-navy-400">{t.origin} → {t.destination}</p></div>
                    <span className="text-sm font-semibold text-navy-700">{formatCurrency(t.customer_freight)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedTrips.size > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-navy-100 pt-4">
              <Input label="Adjustments (₹)" type="number" step="0.01" value={String(adjustments)} onChange={(e) => setAdjustments(Number(e.target.value))} placeholder="0" />
              <Input label="Adjustment Reason" value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} placeholder="Discount, correction, etc." />
            </div>
            <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="bg-navy-50 rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-navy-600">Subtotal</span><span className="font-semibold">{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-navy-600">Adjustments</span><span className="font-semibold">{formatCurrency(adjustments)}</span></div>
              <div className="flex justify-between border-t border-navy-200 pt-1"><span className="font-bold text-navy-800">Total</span><span className="font-bold text-navy-800">{formatCurrency(total)}</span></div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="secondary" loading={saving} onClick={() => handleSave(false)}>Save as Draft</Button>
              <Button loading={saving} onClick={() => handleSave(true)}>Issue Bill</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function BillDetailPage({ billId }: { billId: string }) {
  const { businessId, user, isAdmin, business, settings } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [bill, setBill] = useState<(CustomerBill & { customer_party?: Party; items?: CustomerBillItem[] }) | null>(null);
  const [allocated, setAllocated] = useState(0);
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState(false);

  const loadBill = useCallback(async () => {
    if (!billId) return;
    setLoading(true);
    const { data } = await supabase.from('customer_bills').select('*, customer_party:parties(*), items:customer_bill_items(*)').eq('id', billId).maybeSingle();
    setBill(data as any);
    const { data: allocs } = await supabase.from('payment_allocations').select('allocated_amount').eq('bill_id', billId);
    setAllocated((allocs ?? []).reduce((s, a) => s + Number(a.allocated_amount), 0));
    setLoading(false);
  }, [billId]);

  useEffect(() => { loadBill(); }, [loadBill]);

  const handleIssue = async () => {
    if (!bill || !businessId) return;
    const { error } = await supabase.from('customer_bills').update({ status: 'issued' }).eq('id', bill.id);
    if (error) { showToast(error.message, 'error'); return; }
    await createLedgerEntry(businessId, bill.customer_party_id, bill.bill_date, 'customer_bill', bill.total_amount, 0, `Bill ${bill.bill_number}`, 'customer_bill', bill.id, user?.id ?? null);
    await logAudit(businessId, user?.id ?? null, 'bill_issue', 'customer_bill', bill.id, { bill_number: bill.bill_number });
    showToast('Bill issued successfully');
    loadBill();
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!bill) return <Card><EmptyState title="Bill not found" /></Card>;
  const outstanding = bill.total_amount - allocated;

  if (printMode) {
    return (
      <div>
        <div className="print-container border border-navy-200 rounded-lg p-8 bg-white" id="print-area">
          <div className="flex items-start justify-between border-b-2 border-navy-800 pb-4 mb-6">
            <div><h1 className="text-2xl font-bold text-navy-800">{business?.business_name ?? settings?.business_name}</h1><p className="text-sm text-navy-600">{settings?.address ?? business?.address}</p><p className="text-sm text-navy-600">Phone: {settings?.phone ?? business?.phone}</p></div>
            <div className="text-right"><h2 className="text-xl font-bold text-navy-700">Freight Statement</h2><p className="text-sm font-semibold">Bill No: {bill.bill_number}</p><p className="text-sm">Date: {formatDate(bill.bill_date)}</p></div>
          </div>
          <div className="mb-6 text-sm"><p className="font-semibold text-navy-700">Bill To:</p><p className="font-medium">{bill.customer_party?.party_name}</p><p className="text-navy-500">{bill.customer_party?.address ?? ''}</p><p className="text-navy-500">{bill.customer_party?.phone ?? ''}</p></div>
          <table className="w-full text-sm border border-navy-200 mb-4"><thead className="bg-navy-50"><tr><th className="text-left p-2">Description</th><th className="text-right p-2">Amount</th></tr></thead><tbody>{bill.items?.map((item) => <tr key={item.id} className="border-t border-navy-100"><td className="p-2">{item.description}</td><td className="p-2 text-right">{formatCurrency(item.amount)}</td></tr>)}</tbody></table>
          <div className="flex justify-end mb-6"><div className="w-64 space-y-1 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(bill.subtotal)}</span></div><div className="flex justify-between"><span>Adjustments</span><span>{formatCurrency(bill.adjustments)}</span></div><div className="flex justify-between border-t border-navy-300 pt-1 font-bold"><span>Total</span><span>{formatCurrency(bill.total_amount)}</span></div></div></div>
          <div className="text-xs text-navy-400 mt-8"><p>This is a freight statement, not a GST tax invoice.</p></div>
        </div>
        <div className="flex justify-end gap-3 mt-4 no-print"><Button variant="outline" onClick={() => setPrintMode(false)}>Close</Button><Button onClick={() => window.print()}><Printer size={16} /> Print</Button></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`Bill ${bill.bill_number}`} subtitle={`${formatDate(bill.bill_date)} · ${bill.customer_party?.party_name ?? ''}`} actions={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/customer-billing')}>Back</Button><Button variant="outline" onClick={() => setPrintMode(true)}><Printer size={16} /> Print</Button>{bill.status === 'draft' && <Button onClick={handleIssue}>Issue Bill</Button>}</div>} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-5"><h3 className="text-sm font-semibold text-navy-700 mb-3">Bill Summary</h3><dl className="space-y-2 text-sm"><div className="flex justify-between"><dt className="text-navy-400">Subtotal</dt><dd className="font-medium">{formatCurrency(bill.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-navy-400">Adjustments</dt><dd className="font-medium">{formatCurrency(bill.adjustments)}</dd></div>{bill.adjustment_reason && <div className="text-xs text-navy-400">{bill.adjustment_reason}</div>}<div className="flex justify-between border-t pt-2"><dt className="font-bold">Total</dt><dd className="font-bold">{formatCurrency(bill.total_amount)}</dd></div><div className="flex justify-between"><dt className="text-navy-400">Allocated</dt><dd className="text-green-700">{formatCurrency(allocated)}</dd></div><div className="flex justify-between"><dt className="text-navy-400">Outstanding</dt><dd className="font-bold text-orange-700">{formatCurrency(outstanding)}</dd></div><div className="flex justify-between"><dt className="text-navy-400">Status</dt><dd><StatusBadge status={bill.status} /></dd></div></dl></Card>
        <Card className="p-5 lg:col-span-2"><h3 className="text-sm font-semibold text-navy-700 mb-3">Bill Items</h3><table className="w-full text-sm"><thead className="text-navy-400 border-b border-navy-100"><tr><th className="text-left py-2">Description</th><th className="text-right py-2">Amount</th></tr></thead><tbody className="divide-y divide-navy-50">{bill.items?.map((item) => <tr key={item.id}><td className="py-2 text-navy-700">{item.description}</td><td className="py-2 text-right font-medium">{formatCurrency(item.amount)}</td></tr>)}</tbody></table></Card>
      </div>
      {bill.notes && <Card className="p-5 mb-6"><h3 className="text-sm font-semibold text-navy-700 mb-2">Notes</h3><p className="text-sm text-navy-600">{bill.notes}</p></Card>}
    </div>
  );
}
