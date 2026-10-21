import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry } from '@/lib/audit';
import { Payment, PaymentAllocation, Party, CustomerBill, PaymentType } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination, StatusBadge, Badge } from '@/components/ui';
import { formatCurrency, formatDate, downloadCSV, todayISODate } from '@/lib/format';
import { Wallet, Plus, Search, Eye, Download, RotateCcw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PAGE_SIZE = 15;

export function PaymentsPage() {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<(Payment & { party?: Party })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState<Payment | null>(null);
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [totalReceived, setTotalReceived] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);

  const loadPayments = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('payments').select('*, party:parties(*)').eq('business_id', businessId).eq('is_reversed', false);
    if (search) query = query.or(`reference_number.ilike.%${search}%`);
    if (typeFilter) query = query.eq('payment_type', typeFilter);
    if (dateFrom) query = query.gte('payment_date', dateFrom);
    if (dateTo) query = query.lte('payment_date', dateTo);
    const { data, error, count } = await query.order('payment_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load payments', 'error'); setLoading(false); return; }
    setPayments((data ?? []) as any[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setTotalReceived((data ?? []).filter((p: any) => p.payment_type === 'customer_receipt').reduce((s: number, p: any) => s + Number(p.amount), 0));
    setTotalPaid((data ?? []).filter((p: any) => p.payment_type === 'supplier_payment').reduce((s: number, p: any) => s + Number(p.amount), 0));
    setLoading(false);
  }, [businessId, search, typeFilter, dateFrom, dateTo, page, showToast]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const handleReverse = async (payment: Payment) => {
    if (!businessId) { setLoading(false); return; }
    const { error } = await supabase.from('payments').update({ is_reversed: true }).eq('id', payment.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, 'payment_reverse', 'payment', payment.id, { amount: payment.amount });
    const { data: ledger } = await supabase.from('ledger_entries').select('*').eq('reference_id', payment.id).eq('is_reversed', false).maybeSingle();
    if (ledger) {
      await supabase.from('ledger_entries').update({ is_reversed: true }).eq('id', ledger.id);
      await supabase.from('ledger_entries').insert({ business_id: businessId, party_id: ledger.party_id, transaction_date: todayISODate(), transaction_type: 'reversal', debit: ledger.credit, credit: ledger.debit, description: `Reversal: Payment reversed`, reversal_of_entry_id: ledger.id, created_by: user?.id ?? null });
    }
    showToast('Payment reversed');
    setConfirmReverse(null); loadPayments();
  };

  const handleExport = () => {
    const rows: (string | number)[][] = [['Date', 'Party', 'Type', 'Amount', 'Method', 'Reference', 'Notes']];
    payments.forEach((p) => rows.push([formatDate(p.payment_date), p.party?.party_name ?? '—', p.payment_type, p.amount, p.payment_method ?? '—', p.reference_number ?? '—', p.notes ?? '—']));
    downloadCSV('payments.csv', rows);
  };

  return (
    <div>
      <PageHeader title="Payments & Receipts" subtitle="Customer receipts and supplier payments" actions={<div className="flex gap-2"><Button variant="outline" onClick={handleExport}><Download size={16} /> Export</Button><Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Payment</Button></div>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Card className="p-4"><p className="text-xs text-navy-400">Total Receipts (filtered)</p><p className="text-xl font-bold text-green-700">{formatCurrency(totalReceived)}</p></Card>
        <Card className="p-4"><p className="text-xs text-navy-400">Total Payments (filtered)</p><p className="text-xl font-bold text-red-700">{formatCurrency(totalPaid)}</p></Card>
      </div>
      <Card className="p-4 mb-4"><div className="flex flex-col lg:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-3 text-navy-400" /><input placeholder="Search by reference number..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" /></div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer"><option value="">All Types</option><option value="customer_receipt">Customer Receipt</option><option value="supplier_payment">Supplier Payment</option><option value="other">Other</option></select>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" /><input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
      </div></Card>
      {loading ? <LoadingSpinner /> : payments.length === 0 ? (
        <Card><EmptyState icon={<Wallet size={48} />} title="No payments found" message="Record customer receipts and supplier payments." action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Payment</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600"><tr><th className="text-left px-4 py-3 font-semibold">Date</th><th className="text-left px-4 py-3 font-semibold">Party</th><th className="text-left px-4 py-3 font-semibold">Type</th><th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Method</th><th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Reference</th><th className="text-right px-4 py-3 font-semibold">Amount</th><th className="text-right px-4 py-3 font-semibold">Actions</th></tr></thead>
          <tbody className="divide-y divide-navy-50">{payments.map((p) => (
            <tr key={p.id} className="hover:bg-navy-50/50 cursor-pointer" onClick={() => setDetailPayment(p)}>
              <td className="px-4 py-3 text-navy-600">{formatDate(p.payment_date)}</td><td className="px-4 py-3 font-medium text-navy-800">{p.party?.party_name ?? '—'}</td>
              <td className="px-4 py-3"><Badge color={p.payment_type === 'customer_receipt' ? 'green' : p.payment_type === 'supplier_payment' ? 'orange' : 'gray'}>{p.payment_type.replace(/_/g, ' ')}</Badge></td>
              <td className="px-4 py-3 hidden md:table-cell text-navy-600">{p.payment_method ?? '—'}</td><td className="px-4 py-3 hidden lg:table-cell text-navy-600">{p.reference_number ?? '—'}</td>
              <td className={`px-4 py-3 text-right font-semibold ${p.payment_type === 'customer_receipt' ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(p.amount)}</td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1"><button onClick={() => setDetailPayment(p)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Eye size={15} /></button>{isAdmin && <button onClick={() => setConfirmReverse(p)} className="p-1.5 rounded-lg hover:bg-navy-100 text-red-600"><RotateCcw size={15} /></button>}</div></td>
            </tr>
          ))}</tbody>
        </table></div><div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div></Card>
      )}
      <PaymentFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); loadPayments(); }} />
      <ConfirmDialog open={!!confirmReverse} onClose={() => setConfirmReverse(null)} onConfirm={() => confirmReverse && handleReverse(confirmReverse)} title="Reverse Payment" message={`Reverse payment of ${formatCurrency(confirmReverse?.amount ?? 0)}? This will reverse the ledger entry and any allocations.`} confirmText="Reverse" danger />
      {detailPayment && <PaymentDetailModal payment={detailPayment} onClose={() => setDetailPayment(null)} onUpdated={loadPayments} />}
    </div>
  );
}

function PaymentFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Partial<Payment>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [parties, setParties] = useState<Party[]>([]);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [showOnBehalf, setShowOnBehalf] = useState(false);

  useEffect(() => {
    if (!businessId || !open) return;
    supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).order('party_name').then(({ data }) => setParties(data as Party[] ?? []));
  }, [businessId, open]);

  useEffect(() => {
    if (open) {
      setFormData({ payment_date: todayISODate(), payment_type: 'customer_receipt', amount: 0 });
      setErrors({});
      setShowBankDetails(false);
      setShowOnBehalf(false);
    }
  }, [open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.party_id) errs.party_id = 'Party is required';
    if (!formData.payment_date) errs.payment_date = 'Date is required';
    if (!formData.amount || Number(formData.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    if (showOnBehalf && !formData.on_behalf_of_party_id) errs.on_behalf_of_party_id = 'Select the party whose outstanding is being cleared';
    if (showOnBehalf && formData.on_behalf_of_party_id === formData.party_id) errs.on_behalf_of_party_id = 'Paying party and original party cannot be the same';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !businessId) return;
    setSaving(true);
    try {
      const insertData: Record<string, unknown> = { ...formData, business_id: businessId, created_by: user?.id ?? null };
      if (!showOnBehalf) insertData.on_behalf_of_party_id = null;
      // For third-party collection, ledger goes to the original party (on_behalf_of), not the paying party
      const ledgerPartyId = showOnBehalf && formData.on_behalf_of_party_id ? formData.on_behalf_of_party_id : formData.party_id;
      const { data, error } = await supabase.from('payments').insert(insertData).select('*').maybeSingle();
      if (error) throw error;
      const isReceipt = formData.payment_type === 'customer_receipt';
      const isSupplier = formData.payment_type === 'supplier_payment';
      const ledgerDesc = showOnBehalf
        ? `${isReceipt ? 'Receipt' : 'Payment'} on behalf of party — ${formData.reference_number ? `Ref: ${formData.reference_number}` : ''}`
        : `${isReceipt ? 'Customer receipt' : isSupplier ? 'Supplier payment' : 'Adjustment'}${formData.reference_number ? ` — ${formData.reference_number}` : ''}`;
      await createLedgerEntry(businessId, ledgerPartyId!, formData.payment_date!, isReceipt ? 'customer_receipt' : isSupplier ? 'supplier_payment' : 'adjustment', isSupplier ? Number(formData.amount) : 0, isReceipt ? Number(formData.amount) : 0, ledgerDesc, 'payment', data.id, user?.id ?? null);
      await logAudit(businessId, user?.id ?? null, 'payment_create', 'payment', data.id, { amount: formData.amount, type: formData.payment_type, on_behalf_of: showOnBehalf ? formData.on_behalf_of_party_id : null });
      showToast(showOnBehalf ? 'Third-party collection recorded — only original party outstanding reduced' : 'Payment recorded successfully');
      onSaved();
    } catch (err: any) { showToast(err.message ?? 'Failed to save', 'error'); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="New Payment" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Payment Type" required value={formData.payment_type ?? 'customer_receipt'} onChange={(e) => setFormData({ ...formData, payment_type: e.target.value as PaymentType })}>
          <option value="customer_receipt">Customer Receipt</option>
          <option value="supplier_payment">Supplier Payment</option>
          <option value="other">Other</option>
        </Select>
        <Select label="Party (actual payer/payee)" required error={errors.party_id} value={formData.party_id ?? ''} onChange={(e) => setFormData({ ...formData, party_id: e.target.value })}>
          <option value="">Select party...</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name} ({p.party_type})</option>)}
        </Select>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="on_behalf" checked={showOnBehalf} onChange={(e) => { setShowOnBehalf(e.target.checked); if (!e.target.checked) setFormData({ ...formData, on_behalf_of_party_id: null }); }} className="w-4 h-4 rounded border-navy-300" />
          <label htmlFor="on_behalf" className="text-sm font-medium text-navy-700">Payment collected on behalf of another party</label>
        </div>
        {showOnBehalf && (
          <div className="space-y-2 pl-6 border-l-2 border-navy-100">
            <Select label="Original Party (whose outstanding reduces)" required error={errors.on_behalf_of_party_id} value={formData.on_behalf_of_party_id ?? ''} onChange={(e) => setFormData({ ...formData, on_behalf_of_party_id: e.target.value })}>
              <option value="">Select original party...</option>
              {parties.filter((p) => p.id !== formData.party_id).map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
            </Select>
            <p className="text-xs text-navy-400">Only the original party's outstanding will decrease. The paying party's ledger remains unchanged.</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Amount (₹)" type="number" step="0.01" required error={errors.amount} value={String(formData.amount ?? 0)} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} />
          <Input label="Payment Date" type="date" required error={errors.payment_date} value={formData.payment_date ?? ''} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} />
          <Input label="Payment Method" value={formData.payment_method ?? ''} onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })} placeholder="Cash, UPI, Bank, Cheque" />
          <Input label="Reference Number" value={formData.reference_number ?? ''} onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })} placeholder="Cheque no, UPI ref, etc." />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="bank_details" checked={showBankDetails} onChange={(e) => setShowBankDetails(e.target.checked)} className="w-4 h-4 rounded border-navy-300" />
          <label htmlFor="bank_details" className="text-sm font-medium text-navy-700">Add bank details (optional)</label>
        </div>
        {showBankDetails && (
          <div className="space-y-3 pl-6 border-l-2 border-navy-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Bank Name" value={formData.bank_name ?? ''} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} placeholder="SBI, HDFC, etc." />
              <Input label="Account Holder" value={formData.account_holder ?? ''} onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })} />
              <Input label="Account Number" value={formData.account_number ?? ''} onChange={(e) => setFormData({ ...formData, account_number: e.target.value })} />
              <Input label="IFSC Code" value={formData.ifsc_code ?? ''} onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value })} />
              <Input label="UPI ID" value={formData.upi_id ?? ''} onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })} placeholder="name@bank" />
            </div>
          </div>
        )}
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2"><Button variant="outline" onClick={onClose} type="button">Cancel</Button><Button type="submit" loading={saving}>Record Payment</Button></div>
      </form>
    </Modal>
  );
}

function PaymentDetailModal({ payment, onClose, onUpdated }: { payment: Payment; onClose: () => void; onUpdated: () => void }) {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [allocations, setAllocations] = useState<(PaymentAllocation & { bill?: CustomerBill })[]>([]);
  const [availableBills, setAvailableBills] = useState<(CustomerBill & { customer_party?: Party })[]>([]);
  const [selectedBill, setSelectedBill] = useState('');
  const [allocAmount, setAllocAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadAllocations = useCallback(async () => {
    setLoading(true);
    const { data: allocs } = await supabase.from('payment_allocations').select('*, bill:customer_bills(*)').eq('payment_id', payment.id);
    setAllocations(allocs as any[] ?? []);
    if (payment.payment_type === 'customer_receipt') {
      const { data: bills } = await supabase.from('customer_bills').select('*, customer_party:parties(*)').eq('business_id', payment.business_id).in('status', ['issued', 'partially_paid']).order('bill_date', { ascending: false });
      const available = [];
      for (const b of bills ?? []) {
        const { data: allocs } = await supabase.from('payment_allocations').select('allocated_amount').eq('bill_id', b.id);
        const allocated = (allocs ?? []).reduce((s, a) => s + Number(a.allocated_amount), 0);
        if (allocated < Number(b.total_amount)) available.push({ ...b, outstanding: Number(b.total_amount) - allocated });
      }
      setAvailableBills(available as any[]);
    }
    setLoading(false);
  }, [payment]);

  useEffect(() => { loadAllocations(); }, [loadAllocations]);

  const allocatedTotal = allocations.reduce((s, a) => s + Number(a.allocated_amount), 0);
  const unallocated = Number(payment.amount) - allocatedTotal;

  const handleAllocate = async () => {
    if (!selectedBill || allocAmount <= 0) { showToast('Select a bill and enter amount', 'error'); return; }
    if (allocAmount > unallocated) { showToast('Allocation exceeds unallocated amount', 'error'); return; }
    const bill = availableBills.find((b) => b.id === selectedBill);
    if (bill && allocAmount > (bill as any).outstanding) { showToast('Allocation exceeds bill outstanding', 'error'); return; }
    const { error } = await supabase.from('payment_allocations').insert({ business_id: payment.business_id, payment_id: payment.id, bill_id: selectedBill, allocated_amount: allocAmount });
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(payment.business_id, user?.id ?? null, 'payment_allocate', 'payment', payment.id, { bill_id: selectedBill, amount: allocAmount });
    // Update bill status
    const newAllocated = allocatedTotal + allocAmount;
    const newOutstanding = Number(bill?.total_amount) - newAllocated;
    const newStatus = newOutstanding <= 0 ? 'paid' : 'partially_paid';
    await supabase.from('customer_bills').update({ status: newStatus }).eq('id', selectedBill);
    showToast('Payment allocated to bill');
    setSelectedBill(''); setAllocAmount(0); loadAllocations(); onUpdated();
  };

  const handleRemoveAllocation = async (allocId: string, billId: string) => {
    const { error } = await supabase.from('payment_allocations').delete().eq('id', allocId);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Allocation removed'); loadAllocations(); onUpdated();
  };

  return (
    <Modal open={true} onClose={onClose} title={`Payment — ${formatCurrency(payment.amount)}`} size="lg">
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-navy-400">Date</p><p className="font-medium">{formatDate(payment.payment_date)}</p></div>
            <div><p className="text-navy-400">Type</p><p className="font-medium">{payment.payment_type.replace(/_/g, ' ')}</p></div>
            <div><p className="text-navy-400">Method</p><p className="font-medium">{payment.payment_method ?? '—'}</p></div>
            <div><p className="text-navy-400">Reference</p><p className="font-medium">{payment.reference_number ?? '—'}</p></div>
          </div>
          <div className="bg-navy-50 rounded-lg p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-navy-600">Payment Amount</span><span className="font-semibold">{formatCurrency(payment.amount)}</span></div>
            <div className="flex justify-between"><span className="text-navy-600">Allocated</span><span className="font-semibold text-green-700">{formatCurrency(allocatedTotal)}</span></div>
            <div className="flex justify-between border-t border-navy-200 pt-1"><span className="font-bold">Unallocated</span><span className="font-bold text-orange-700">{formatCurrency(unallocated)}</span></div>
          </div>
          {allocations.length > 0 && (
            <div><h3 className="text-sm font-semibold text-navy-700 mb-2">Allocations</h3><div className="space-y-2">{allocations.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 bg-navy-50 rounded-lg">
                <div><p className="text-sm font-medium text-navy-800">{a.bill?.bill_number ?? '—'}</p><p className="text-xs text-navy-400">{formatCurrency(a.allocated_amount)} allocated</p></div>
                {isAdmin && <button onClick={() => handleRemoveAllocation(a.id, a.bill_id)} className="text-red-600 p-1 rounded hover:bg-red-50"><X size={14} /></button>}
              </div>
            ))}</div></div>
          )}
          {isAdmin && unallocated > 0 && payment.payment_type === 'customer_receipt' && availableBills.length > 0 && (
            <div className="border-t border-navy-100 pt-4"><h3 className="text-sm font-semibold text-navy-700 mb-2">Allocate to Bill</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={selectedBill} onChange={(e) => setSelectedBill(e.target.value)} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none"><option value="">Select bill...</option>{availableBills.map((b) => <option key={b.id} value={b.id}>{b.bill_number} — Outstanding: {formatCurrency((b as any).outstanding)}</option>)}</select>
                <div className="flex gap-2"><input type="number" step="0.01" placeholder="Amount" value={String(allocAmount || '')} onChange={(e) => setAllocAmount(Number(e.target.value))} className="flex-1 px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" /><Button onClick={handleAllocate}>Allocate</Button></div>
              </div>
            </div>
          )}
          {payment.notes && <div><p className="text-navy-400 text-sm">Notes</p><p className="text-sm text-navy-600">{payment.notes}</p></div>}
        </div>
      )}
    </Modal>
  );
}
