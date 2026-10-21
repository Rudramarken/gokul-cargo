import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry } from '@/lib/audit';
import { Payment, Party, LrBilty } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination } from '@/components/ui';
import { formatCurrency, formatDate, downloadCSV, todayISODate } from '@/lib/format';
import { Users, Plus, Search, Eye, Download, RotateCcw, X } from 'lucide-react';

const PAGE_SIZE = 15;

export function ThirdPartyPaymentsPage() {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [payments, setPayments] = useState<(Payment & { party?: Party; on_behalf_of_party?: Party })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState<Payment | null>(null);
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [totalReceived, setTotalReceived] = useState(0);

  const loadPayments = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase
      .from('payments')
      .select('*, party:parties!payments_party_id_fkey(*), on_behalf_of_party:parties!payments_on_behalf_of_party_id_fkey(*)', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('is_reversed', false)
      .not('on_behalf_of_party_id', 'is', null);
    if (search) query = query.or(`reference_number.ilike.%${search}%`);
    if (dateFrom) query = query.gte('payment_date', dateFrom);
    if (dateTo) query = query.lte('payment_date', dateTo);
    if (partyFilter) query = query.eq('on_behalf_of_party_id', partyFilter);
    const { data, error, count } = await query.order('payment_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load third-party payments', 'error'); setLoading(false); return; }
    setPayments((data ?? []) as any[]);
    setTotalPages(Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)));
    setTotalReceived((data ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0));
    setLoading(false);
  }, [businessId, search, dateFrom, dateTo, partyFilter, page, showToast]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const handleReverse = async (payment: Payment) => {
    if (!businessId) return;
    const { error } = await supabase.from('payments').update({ is_reversed: true }).eq('id', payment.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, 'third_party_payment_reverse', 'payment', payment.id, { amount: payment.amount });
    // Reverse the ledger entry on the original party (on_behalf_of)
    const { data: ledger } = await supabase.from('ledger_entries').select('*').eq('reference_id', payment.id).eq('is_reversed', false).maybeSingle();
    if (ledger) {
      await supabase.from('ledger_entries').update({ is_reversed: true }).eq('id', ledger.id);
      await supabase.from('ledger_entries').insert({
        business_id: businessId,
        party_id: ledger.party_id,
        transaction_date: todayISODate(),
        transaction_type: 'reversal',
        debit: ledger.credit,
        credit: ledger.debit,
        description: `Reversal: Third-party payment reversed`,
        reversal_of_entry_id: ledger.id,
        created_by: user?.id ?? null,
      });
    }
    showToast('Third-party payment reversed');
    setConfirmReverse(null); loadPayments();
  };

  const handleExport = () => {
    const rows: (string | number)[][] = [['Date', 'Original Party', 'Actual Payer', 'Amount', 'Method', 'Reference', 'Notes']];
    payments.forEach((p) => rows.push([
      formatDate(p.payment_date),
      p.on_behalf_of_party?.party_name ?? '—',
      p.payer_name_manual ?? p.party?.party_name ?? '—',
      p.amount,
      p.payment_method ?? '—',
      p.reference_number ?? '—',
      p.notes ?? '—',
    ]));
    downloadCSV('third-party-payments.csv', rows);
  };

  return (
    <div>
      <PageHeader
        title="Third-Party Payments"
        subtitle="Payments collected on behalf of another party — only the original party's outstanding reduces"
        actions={<div className="flex gap-2"><Button variant="outline" onClick={handleExport}><Download size={16} /> Export</Button><Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Third-Party Payment</Button></div>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-1 gap-4 mb-4">
        <Card className="p-4"><p className="text-xs text-navy-400">Total Collected (filtered)</p><p className="text-xl font-bold text-green-700">{formatCurrency(totalReceived)}</p></Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder="Search by reference number..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>
          <PartyFilterSelect businessId={businessId} value={partyFilter} onChange={(v) => { setPartyFilter(v); setPage(1); }} />
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
          {(search || dateFrom || dateTo || partyFilter) && (
            <Button variant="ghost" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setPartyFilter(''); setPage(1); }}><X size={16} /> Clear</Button>
          )}
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : payments.length === 0 ? (
        <Card><EmptyState icon={<Users size={48} />} title="No third-party payments found" message="Record a payment collected by someone else on behalf of an original party." action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Third-Party Payment</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Original Party</th>
                  <th className="text-left px-4 py-3 font-semibold">Actual Payer</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Method</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Reference</th>
                  <th className="text-right px-4 py-3 font-semibold">Amount</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-navy-50/50 cursor-pointer" onClick={() => setDetailPayment(p)}>
                    <td className="px-4 py-3 text-navy-600">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3 font-medium text-navy-800">{p.on_behalf_of_party?.party_name ?? '—'}</td>
                    <td className="px-4 py-3 text-navy-600">{p.payer_name_manual ?? p.party?.party_name ?? '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-navy-600">{p.payment_method ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{p.reference_number ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setDetailPayment(p)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Eye size={15} /></button>
                        {isAdmin && <button onClick={() => setConfirmReverse(p)} className="p-1.5 rounded-lg hover:bg-navy-100 text-red-600"><RotateCcw size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}

      <ThirdPartyPaymentFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); loadPayments(); }} />
      <ConfirmDialog open={!!confirmReverse} onClose={() => setConfirmReverse(null)} onConfirm={() => confirmReverse && handleReverse(confirmReverse)} title="Reverse Third-Party Payment" message={`Reverse payment of ${formatCurrency(confirmReverse?.amount ?? 0)}? This will reverse the ledger entry on the original party.`} confirmText="Reverse" danger />
      {detailPayment && <PaymentDetailModal payment={detailPayment} onClose={() => setDetailPayment(null)} />}
    </div>
  );
}

function PartyFilterSelect({ businessId, value, onChange }: { businessId: string | null; value: string; onChange: (v: string) => void }) {
  const [parties, setParties] = useState<Party[]>([]);
  useEffect(() => {
    if (!businessId) return;
    supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).order('party_name').then(({ data }) => setParties((data as Party[]) ?? []));
  }, [businessId]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
      <option value="">All Original Parties</option>
      {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
    </select>
  );
}

function ThirdPartyPaymentFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Partial<Payment>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [parties, setParties] = useState<Party[]>([]);
  const [bilties, setBilties] = useState<LrBilty[]>([]);

  useEffect(() => {
    if (!businessId || !open) return;
    Promise.all([
      supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).order('party_name'),
      supabase.from('lr_bilties').select('id, lr_number, bilty_date').eq('business_id', businessId).eq('document_status', 'active').order('bilty_date', { ascending: false }).limit(100),
    ]).then(([pRes, lRes]) => {
      setParties((pRes.data as Party[]) ?? []);
      setBilties((lRes.data as LrBilty[]) ?? []);
    });
  }, [businessId, open]);

  useEffect(() => {
    if (open) {
      setFormData({ payment_date: todayISODate(), payment_type: 'customer_receipt', amount: 0 });
      setErrors({});
    }
  }, [open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.party_id && !formData.payer_name_manual?.trim()) errs.payer_name_manual = 'Enter the actual payer name (or select a party)';
    if (!formData.on_behalf_of_party_id) errs.on_behalf_of_party_id = 'Original party (whose outstanding reduces) is required';
    if (!formData.payment_date) errs.payment_date = 'Date is required';
    if (!formData.amount || Number(formData.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    if (formData.on_behalf_of_party_id === formData.party_id) errs.on_behalf_of_party_id = 'Actual payer and original party cannot be the same';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !businessId) return;
    setSaving(true);
    try {
      const insertData: Record<string, unknown> = {
        business_id: businessId,
        party_id: formData.party_id ?? null,
        payer_name_manual: formData.payer_name_manual ?? null,
        on_behalf_of_party_id: formData.on_behalf_of_party_id,
        payment_date: formData.payment_date,
        payment_type: formData.payment_type ?? 'customer_receipt',
        amount: Number(formData.amount),
        payment_method: formData.payment_method ?? null,
        reference_number: formData.reference_number ?? null,
        notes: formData.notes ?? null,
        created_by: user?.id ?? null,
      };
      const { data, error } = await supabase.from('payments').insert(insertData).select('*').maybeSingle();
      if (error) throw error;
      // Ledger goes to the ORIGINAL party (on_behalf_of) — only their outstanding reduces
      const isReceipt = (formData.payment_type ?? 'customer_receipt') === 'customer_receipt';
      const payerName = formData.payer_name_manual ?? parties.find((p) => p.id === formData.party_id)?.party_name ?? '—';
      const ledgerDesc = `Third-party payment from ${payerName}${formData.reference_number ? ` — Ref: ${formData.reference_number}` : ''}`;
      await createLedgerEntry(
        businessId,
        formData.on_behalf_of_party_id!,
        formData.payment_date!,
        isReceipt ? 'customer_receipt' : 'adjustment',
        0,
        Number(formData.amount),
        ledgerDesc,
        'payment',
        data.id,
        user?.id ?? null
      );
      await logAudit(businessId, user?.id ?? null, 'third_party_payment_create', 'payment', data.id, {
        amount: formData.amount,
        original_party: formData.on_behalf_of_party_id,
        actual_payer: formData.party_id,
        actual_payer_name: payerName,
      });
      showToast('Third-party payment recorded — only original party outstanding reduced');
      onSaved();
    } catch (err: any) { showToast(err.message ?? 'Failed to save', 'error'); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="New Third-Party Payment" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-navy-50 rounded-lg p-3 text-xs text-navy-500">
          Use this when someone other than the original party pays on their behalf. Only the <strong>original party's</strong> outstanding balance will decrease. The actual payer's ledger is not affected.
        </div>
        <Select label="Original Party (whose outstanding reduces)" required error={errors.on_behalf_of_party_id} value={formData.on_behalf_of_party_id ?? ''} onChange={(e) => setFormData({ ...formData, on_behalf_of_party_id: e.target.value })}>
          <option value="">Select original party...</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name} ({p.party_type})</option>)}
        </Select>
        <div className="space-y-2">
          <Input label="Actual Person/Company Making Payment (type manually)" error={errors.payer_name_manual} value={formData.payer_name_manual ?? ''} onChange={(e) => setFormData({ ...formData, payer_name_manual: e.target.value || undefined, party_id: e.target.value ? null : formData.party_id })} placeholder="Type the actual payer's name — no need to add them as a party" />
          <p className="text-xs text-navy-400 text-center">— or select an existing party —</p>
          <Select label="Or Select Existing Party" value={formData.party_id ?? ''} onChange={(e) => setFormData({ ...formData, party_id: e.target.value || null, payer_name_manual: e.target.value ? undefined : formData.payer_name_manual })}>
            <option value="">— Enter manually above —</option>
            {parties.filter((p) => p.id !== formData.on_behalf_of_party_id).map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Amount (₹)" type="number" step="0.01" required error={errors.amount} value={String(formData.amount ?? 0)} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} />
          <Input label="Payment Date" type="date" required error={errors.payment_date} value={formData.payment_date ?? ''} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} />
          <Input label="Payment Method" value={formData.payment_method ?? ''} onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })} placeholder="Cash, UPI, Bank, Cheque" />
          <Input label="Reference Number" value={formData.reference_number ?? ''} onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })} placeholder="Cheque no, UPI ref, etc." />
        </div>
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>Record Third-Party Payment</Button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentDetailModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const [onBehalfParty, setOnBehalfParty] = useState<Party | null>(null);
  const [payerParty, setPayerParty] = useState<Party | null>(null);

  useEffect(() => {
    if (payment.on_behalf_of_party_id) supabase.from('parties').select('*').eq('id', payment.on_behalf_of_party_id).maybeSingle().then(({ data }) => setOnBehalfParty(data as Party | null));
    if (payment.party_id) supabase.from('parties').select('*').eq('id', payment.party_id).maybeSingle().then(({ data }) => setPayerParty(data as Party | null));
  }, [payment]);

  const payerDisplay = payment.payer_name_manual ?? payerParty?.party_name ?? '—';

  return (
    <Modal open={true} onClose={onClose} title={`Third-Party Payment — ${formatCurrency(payment.amount)}`} size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-navy-400">Date</p><p className="font-medium">{formatDate(payment.payment_date)}</p></div>
          <div><p className="text-navy-400">Method</p><p className="font-medium">{payment.payment_method ?? '—'}</p></div>
          <div><p className="text-navy-400">Reference</p><p className="font-medium">{payment.reference_number ?? '—'}</p></div>
          <div><p className="text-navy-400">Amount</p><p className="font-bold text-green-700">{formatCurrency(payment.amount)}</p></div>
        </div>
        <div className="bg-navy-50 rounded-lg p-4 space-y-2 text-sm">
          <div><p className="text-navy-400 text-xs">Original Party (outstanding reduced)</p><p className="font-semibold text-navy-800">{onBehalfParty?.party_name ?? '—'}</p></div>
          <div><p className="text-navy-400 text-xs">Actual Payer</p><p className="font-medium text-navy-700">{payerDisplay}</p></div>
        </div>
        {payment.notes && <div><p className="text-navy-400 text-xs">Notes</p><p className="text-sm text-navy-600">{payment.notes}</p></div>}
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
