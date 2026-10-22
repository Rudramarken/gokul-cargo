import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry, reverseLedgerEntry } from '@/lib/audit';
import { TripExpense, TripAdvance, Trip, Party, Driver, ExpenseCategory, PaidByType, RecoveryStatus, RecipientType } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination } from '@/components/ui';
import { formatCurrency, formatDate, downloadCSV, todayISODate } from '@/lib/format';
import { Receipt, Plus, Search, CreditCard as Edit2, Download, RotateCcw, Wallet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useBankAccounts, updateAccountBalance } from '@/hooks/useBankAccounts';

const PAGE_SIZE = 15;
const EXPENSE_CATEGORIES: ExpenseCategory[] = ['fuel', 'toll', 'loading', 'unloading', 'driver', 'maintenance', 'food', 'repairs', 'other'];
const PAID_BY_OPTIONS: { value: PaidByType; label: string }[] = [
  { value: 'gokul', label: 'Gokul Cargo Movers' },
  { value: 'consignor', label: 'Consignor' },
  { value: 'consignee', label: 'Consignee' },
  { value: 'other', label: 'Other' },
];
const RECOVERY_STATUS_OPTIONS: { value: RecoveryStatus; label: string }[] = [
  { value: 'n/a', label: 'N/A' },
  { value: 'pending', label: 'Pending' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'written_off', label: 'Written Off' },
];
const RECIPIENT_TYPES: { value: RecipientType; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: 'transporter', label: 'Transporter' },
  { value: 'truck_owner', label: 'Truck Owner' },
  { value: 'other', label: 'Other' },
];

export function TripExpensesPage() {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'advances' ? 'advances' : 'expenses';
  const [activeTab, setActiveTab] = useState<'expenses' | 'advances'>(initialTab as 'expenses' | 'advances');
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [advances, setAdvances] = useState<TripAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tripFilter, setTripFilter] = useState(searchParams.get('trip') ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<TripExpense | null>(null);
  const [editingAdvance, setEditingAdvance] = useState<TripAdvance | null>(null);
  const [confirmReverse, setConfirmReverse] = useState<TripExpense | null>(null);
  const [confirmReverseAdvance, setConfirmReverseAdvance] = useState<TripAdvance | null>(null);
  const [totalAmount, setTotalAmount] = useState(0);

  const loadExpenses = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('trip_expenses').select('*, trip:trips(*), paid_to_party:parties(*)').eq('business_id', businessId).eq('is_reversed', false);
    if (search) query = query.or(`description.ilike.%${search}%`);
    if (categoryFilter) query = query.eq('expense_category', categoryFilter);
    if (tripFilter) query = query.eq('trip_id', tripFilter);
    if (dateFrom) query = query.gte('expense_date', dateFrom);
    if (dateTo) query = query.lte('expense_date', dateTo);
    const { data, error, count } = await query.order('expense_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load expenses', 'error'); setLoading(false); return; }
    setExpenses((data ?? []) as TripExpense[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setTotalAmount((data ?? []).reduce((s, e) => s + Number(e.amount), 0));
    setLoading(false);
  }, [businessId, search, categoryFilter, tripFilter, dateFrom, dateTo, page, showToast]);

  const loadAdvances = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('trip_advances').select('*, trip:trips(*)').eq('business_id', businessId);
    if (search) query = query.or(`recipient_name.ilike.%${search}%,reference_number.ilike.%${search}%`);
    if (tripFilter) query = query.eq('trip_id', tripFilter);
    if (dateFrom) query = query.gte('advance_date', dateFrom);
    if (dateTo) query = query.lte('advance_date', dateTo);
    const { data, error, count } = await query.order('advance_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load advances', 'error'); setLoading(false); return; }
    setAdvances((data ?? []) as TripAdvance[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setTotalAmount((data ?? []).reduce((s, a) => s + Number(a.amount), 0));
    setLoading(false);
  }, [businessId, search, tripFilter, dateFrom, dateTo, page, showToast]);

  useEffect(() => {
    if (activeTab === 'expenses') loadExpenses();
    else loadAdvances();
  }, [activeTab, loadExpenses, loadAdvances]);

  const handleReverse = async (expense: TripExpense) => {
    if (!businessId) return;
    const { error } = await supabase.from('trip_expenses').update({ is_reversed: true }).eq('id', expense.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, 'expense_reverse', 'trip_expense', expense.id, { amount: expense.amount });
    showToast('Expense reversed');
    setConfirmReverse(null); loadExpenses();
  };

  const handleReverseAdvance = async (advance: TripAdvance) => {
    if (!businessId) return;
    const { error } = await supabase.from('trip_advances').delete().eq('id', advance.id);
    if (error) { showToast(error.message, 'error'); return; }
    if (advance.ledger_entry_id) {
      await reverseLedgerEntry(advance.ledger_entry_id, businessId, user?.id ?? null, `Advance reversed for trip ${advance.trip?.trip_number ?? ''}`);
    }
    await logAudit(businessId, user?.id ?? null, 'advance_reverse', 'trip_advance', advance.id, { amount: advance.amount });
    showToast('Advance reversed — ledger entry also reversed');
    setConfirmReverseAdvance(null); loadAdvances();
  };

  const handleExport = () => {
    if (activeTab === 'expenses') {
      const rows: (string | number)[][] = [['Date', 'Trip', 'Category', 'Amount', 'Payment Method', 'Description']];
      expenses.forEach((e) => rows.push([formatDate(e.expense_date), e.trip?.trip_number ?? '—', e.expense_category, e.amount, e.payment_method ?? '—', e.description ?? '—']));
      rows.push(['', '', '', 'Total:', totalAmount, '']);
      downloadCSV('trip-expenses.csv', rows);
    } else {
      const rows: (string | number)[][] = [['Date', 'Trip', 'Recipient', 'Amount', 'Method', 'Reference']];
      advances.forEach((a) => rows.push([formatDate(a.advance_date), a.trip?.trip_number ?? '—', a.recipient_name ?? a.recipient_type, a.amount, a.payment_method ?? '—', a.reference_number ?? '—']));
      rows.push(['', '', '', 'Total:', totalAmount, '']);
      downloadCSV('trip-advances.csv', rows);
    }
  };

  return (
    <div>
      <PageHeader title="Trip Expenses & Advances" subtitle="Record trip-linked expenses and driver advances" actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}><Download size={16} /> Export CSV</Button>
          <Button onClick={() => {
            if (activeTab === 'expenses') { setEditingExpense(null); setModalOpen(true); }
            else { setEditingAdvance(null); setModalOpen(true); }
          }}><Plus size={16} /> {activeTab === 'expenses' ? 'Add Expense' : 'Add Advance'}</Button>
        </div>
      } />

      <div className="flex gap-2 mb-4">
        <button onClick={() => { setActiveTab('expenses'); setPage(1); setSearch(''); setCategoryFilter(''); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'expenses' ? 'bg-navy-600 text-white' : 'bg-white text-navy-600 border border-navy-200 hover:bg-navy-50'}`}>
          <Receipt size={14} className="inline mr-1.5" /> Expenses
        </button>
        <button onClick={() => { setActiveTab('advances'); setPage(1); setSearch(''); setCategoryFilter(''); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'advances' ? 'bg-navy-600 text-white' : 'bg-white text-navy-600 border border-navy-200 hover:bg-navy-50'}`}>
          <Wallet size={14} className="inline mr-1.5" /> Driver Advances
        </button>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder={activeTab === 'expenses' ? 'Search by description...' : 'Search by recipient name or reference...'} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>
          {activeTab === 'expenses' && (
            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
              <option value="">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : activeTab === 'expenses' ? (
        expenses.length === 0 ? (
          <Card><EmptyState icon={<Receipt size={48} />} title="No expenses found" message="Record fuel, toll, loading, and other trip expenses." action={<Button onClick={() => { setEditingExpense(null); setModalOpen(true); }}><Plus size={16} /> Add Expense</Button>} /></Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-navy-50 text-navy-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Trip</th>
                    <th className="text-left px-4 py-3 font-semibold">Category</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Payment Method</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Description</th>
                    <th className="text-right px-4 py-3 font-semibold">Amount</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-navy-50/50">
                      <td className="px-4 py-3 text-navy-600">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-3 font-medium text-navy-800">{e.trip?.trip_number ?? '—'}</td>
                      <td className="px-4 py-3"><Badge color="gray">{e.expense_category}</Badge></td>
                      <td className="px-4 py-3 hidden md:table-cell text-navy-600">{e.payment_method ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{e.description ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy-800">{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1">
                        <button onClick={() => { setEditingExpense(e); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button>
                        {isAdmin && <button onClick={() => setConfirmReverse(e)} className="p-1.5 rounded-lg hover:bg-navy-100 text-red-600"><RotateCcw size={15} /></button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-navy-100 bg-navy-50"><td colSpan={5} className="px-4 py-3 text-right font-semibold text-navy-700">Total:</td><td className="px-4 py-3 text-right font-bold text-navy-800">{formatCurrency(totalAmount)}</td><td></td></tr></tfoot>
              </table>
            </div>
            <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
          </Card>
        )
      ) : (
        advances.length === 0 ? (
          <Card><EmptyState icon={<Wallet size={48} />} title="No advances found" message="Record driver advances linked to trips. Each advance appears in the driver's ledger exactly once." action={<Button onClick={() => { setEditingAdvance(null); setModalOpen(true); }}><Plus size={16} /> Add Advance</Button>} /></Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-navy-50 text-navy-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Trip</th>
                    <th className="text-left px-4 py-3 font-semibold">Recipient</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Method</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Reference</th>
                    <th className="text-center px-4 py-3 font-semibold hidden md:table-cell">Ledger</th>
                    <th className="text-right px-4 py-3 font-semibold">Amount</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {advances.map((a) => (
                    <tr key={a.id} className="hover:bg-navy-50/50">
                      <td className="px-4 py-3 text-navy-600">{formatDate(a.advance_date)}</td>
                      <td className="px-4 py-3 font-medium text-navy-800">{a.trip?.trip_number ?? '—'}</td>
                      <td className="px-4 py-3 text-navy-700">{a.recipient_name ?? a.recipient_type}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-navy-600">{a.payment_method ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{a.reference_number ?? '—'}</td>
                      <td className="px-4 py-3 text-center hidden md:table-cell"><Badge color={a.ledger_entry_id ? 'green' : 'gray'}>{a.ledger_entry_id ? 'Posted' : 'No'}</Badge></td>
                      <td className="px-4 py-3 text-right font-semibold text-navy-800">{formatCurrency(a.amount)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1">
                        <button onClick={() => { setEditingAdvance(a); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button>
                        {isAdmin && <button onClick={() => setConfirmReverseAdvance(a)} className="p-1.5 rounded-lg hover:bg-navy-100 text-red-600"><RotateCcw size={15} /></button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-navy-100 bg-navy-50"><td colSpan={6} className="px-4 py-3 text-right font-semibold text-navy-700">Total Advances:</td><td className="px-4 py-3 text-right font-bold text-navy-800">{formatCurrency(totalAmount)}</td><td></td></tr></tfoot>
              </table>
            </div>
            <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
          </Card>
        )
      )}

      {activeTab === 'expenses' ? (
        <ExpenseFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingExpense(null); }} expense={editingExpense} presetTripId={tripFilter || undefined} onSave={() => { setModalOpen(false); setEditingExpense(null); loadExpenses(); }} />
      ) : (
        <AdvanceFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingAdvance(null); }} advance={editingAdvance} presetTripId={tripFilter || undefined} onSave={() => { setModalOpen(false); setEditingAdvance(null); loadAdvances(); }} />
      )}
      <ConfirmDialog open={!!confirmReverse} onClose={() => setConfirmReverse(null)} onConfirm={() => confirmReverse && handleReverse(confirmReverse)} title="Reverse Expense" message={`Reverse expense of ${formatCurrency(confirmReverse?.amount ?? 0)}? This will exclude it from all calculations but keep the record for audit.`} confirmText="Reverse" danger />
      <ConfirmDialog open={!!confirmReverseAdvance} onClose={() => setConfirmReverseAdvance(null)} onConfirm={() => confirmReverseAdvance && handleReverseAdvance(confirmReverseAdvance)} title="Reverse Advance" message={`Reverse advance of ${formatCurrency(confirmReverseAdvance?.amount ?? 0)}? This will also reverse the linked ledger entry — no duplicate will be created.`} confirmText="Reverse" danger />
    </div>
  );
}

function ExpenseFormModal({ open, onClose, expense, presetTripId, onSave }: { open: boolean; onClose: () => void; expense: TripExpense | null; presetTripId?: string; onSave: () => void }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Partial<TripExpense> & { account_id?: string }>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<Trip[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [bilties, setBilties] = useState<any[]>([]);
  const { accounts } = useBankAccounts(true);

  useEffect(() => {
    if (!businessId || !open) return;
    supabase.from('trips').select('*').eq('business_id', businessId).neq('status', 'cancelled').order('trip_date', { ascending: false }).limit(100).then(({ data }) => setTrips(data as Trip[] ?? []));
    supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).order('party_name').then(({ data }) => setParties(data as Party[] ?? []));
    supabase.from('lr_bilties').select('id, lr_number').eq('business_id', businessId).eq('document_status', 'active').order('bilty_date', { ascending: false }).limit(100).then(({ data }) => setBilties(data ?? []));
  }, [businessId, open]);

  useEffect(() => {
    if (expense) setFormData({ ...expense, account_id: (expense as any).account_id ?? '' });
    else setFormData({ expense_date: todayISODate(), expense_category: 'fuel', amount: 0, trip_id: presetTripId ?? '', paid_by: 'gokul', recovery_status: 'n/a', account_id: '' });
    setErrors({});
  }, [expense, open, presetTripId]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.trip_id) errs.trip_id = 'Trip is required';
    if (!formData.expense_date) errs.expense_date = 'Date is required';
    if (!formData.amount || Number(formData.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !businessId) return;
    setSaving(true);
    try {
      const accountId = formData.account_id || undefined;
      const { account_id, ...expenseData } = formData;
      if (expense) {
        const { error } = await supabase.from('trip_expenses').update(expenseData).eq('id', expense.id);
        if (error) throw error;
        await logAudit(businessId, user?.id ?? null, 'expense_update', 'trip_expense', expense.id, { amount: formData.amount });
        showToast('Expense updated');
      } else {
        const { error } = await supabase.from('trip_expenses').insert({ ...expenseData, business_id: businessId, created_by: user?.id ?? null });
        if (error) throw error;
        if (accountId) { await updateAccountBalance(accountId, -Number(formData.amount)); }
        await logAudit(businessId, user?.id ?? null, 'expense_create', 'trip_expense', null, { amount: formData.amount });
        showToast('Expense added');
      }
      onSave();
    } catch (err: any) { showToast(err.message ?? 'Failed to save', 'error'); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={expense ? 'Edit Expense' : 'Add Expense'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Trip" required error={errors.trip_id} value={formData.trip_id ?? ''} onChange={(e) => setFormData({ ...formData, trip_id: e.target.value })}>
          <option value="">Select trip...</option>
          {trips.map((t) => <option key={t.id} value={t.id}>{t.trip_number} — {formatDate(t.trip_date)} ({t.origin} → {t.destination})</option>)}
        </Select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Expense Date" type="date" required error={errors.expense_date} value={formData.expense_date ?? ''} onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} />
          <Select label="Category" required value={formData.expense_category ?? 'fuel'} onChange={(e) => setFormData({ ...formData, expense_category: e.target.value as ExpenseCategory })}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="Amount (₹)" type="number" step="0.01" required error={errors.amount} value={String(formData.amount ?? 0)} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} />
          <Input label="Payment Method" value={formData.payment_method ?? ''} onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })} placeholder="Cash, UPI, Bank, etc." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Paid By" value={formData.paid_by ?? 'gokul'} onChange={(e) => setFormData({ ...formData, paid_by: e.target.value as PaidByType })}>
            {PAID_BY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select label="Recovery Status" value={formData.recovery_status ?? 'n/a'} onChange={(e) => setFormData({ ...formData, recovery_status: e.target.value as RecoveryStatus })}>
            {RECOVERY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <Select label="Responsible Party (optional)" value={formData.responsible_party_id ?? ''} onChange={(e) => setFormData({ ...formData, responsible_party_id: e.target.value || null })}>
          <option value="">Select party...</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
        </Select>
        <Select label="Paid To (optional)" value={formData.paid_to_party_id ?? ''} onChange={(e) => setFormData({ ...formData, paid_to_party_id: e.target.value || null })}>
          <option value="">Select party...</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
        </Select>
        <Select label="Linked LR/Bilty (optional)" value={formData.lr_bilty_id ?? ''} onChange={(e) => setFormData({ ...formData, lr_bilty_id: e.target.value || null })}>
          <option value="">None</option>
          {bilties.map((b) => <option key={b.id} value={b.id}>{b.lr_number}</option>)}
        </Select>
        <Select label="Cash / Bank Account" value={formData.account_id ?? ''} onChange={(e) => setFormData({ ...formData, account_id: e.target.value || null })}>
          <option value="">— No specific account —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name} ({a.account_type})</option>)}
        </Select>
        <Textarea label="Description" value={formData.description ?? ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{expense ? 'Update' : 'Add Expense'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AdvanceFormModal({ open, onClose, advance, presetTripId, onSave }: { open: boolean; onClose: () => void; advance: TripAdvance | null; presetTripId?: string; onSave: () => void }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Partial<TripAdvance>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const { accounts } = useBankAccounts(true);
  const [parties, setParties] = useState<Party[]>([]);

  useEffect(() => {
    if (!businessId || !open) return;
    Promise.all([
      supabase.from('trips').select('*').eq('business_id', businessId).neq('status', 'cancelled').order('trip_date', { ascending: false }).limit(100),
      supabase.from('drivers').select('*').eq('business_id', businessId).eq('is_active', true).order('driver_name'),
      supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).order('party_name'),
    ]).then(([tRes, dRes, pRes]) => {
      setTrips((tRes.data as Trip[]) ?? []);
      setDrivers((dRes.data as Driver[]) ?? []);
      setParties((pRes.data as Party[]) ?? []);
    });
  }, [businessId, open]);

  useEffect(() => {
    if (advance) {
      setFormData(advance);
    } else {
      setFormData({
        advance_date: todayISODate(),
        recipient_type: 'driver',
        amount: 0,
        trip_id: presetTripId ?? '',
      });
    }
    setErrors({});
  }, [advance, open, presetTripId]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.trip_id) errs.trip_id = 'Trip is required';
    if (!formData.advance_date) errs.advance_date = 'Date is required';
    if (!formData.amount || Number(formData.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    if (formData.recipient_type === 'driver' && !formData.recipient_name?.trim() && !formData.recipient_party_id) errs.recipient_name = 'Select a driver or enter name';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !businessId) return;
    setSaving(true);
    try {
      if (advance) {
        // Editing: update the advance and the existing ledger entry (no duplicate)
        const { error } = await supabase.from('trip_advances').update({
          advance_date: formData.advance_date,
          recipient_type: formData.recipient_type,
          recipient_party_id: formData.recipient_party_id ?? null,
          recipient_name: formData.recipient_name ?? null,
          amount: Number(formData.amount),
          payment_method: formData.payment_method ?? null,
          reference_number: formData.reference_number ?? null,
          notes: formData.notes ?? null,
        }).eq('id', advance.id);
        if (error) throw error;
        // Update the existing ledger entry if it exists (no new entry created)
        if (advance.ledger_entry_id && formData.recipient_party_id) {
          await supabase.from('ledger_entries').update({
            debit: Number(formData.amount),
            transaction_date: formData.advance_date,
            description: `Driver advance for trip ${trips.find((t) => t.id === formData.trip_id)?.trip_number ?? ''}`,
          }).eq('id', advance.ledger_entry_id);
        }
        await logAudit(businessId, user?.id ?? null, 'advance_update', 'trip_advance', advance.id, { amount: formData.amount });
        showToast('Advance updated — ledger updated, no duplicate created');
      } else {
        // Creating new advance
        const trip = trips.find((t) => t.id === formData.trip_id);
        const { data: newAdvance, error } = await supabase.from('trip_advances').insert({
          business_id: businessId,
          trip_id: formData.trip_id,
          advance_date: formData.advance_date,
          recipient_type: formData.recipient_type,
          recipient_party_id: formData.recipient_party_id ?? null,
          recipient_name: formData.recipient_name ?? null,
          amount: Number(formData.amount),
          account_id: formData.account_id ?? null,
          payment_method: formData.payment_method ?? null,
          reference_number: formData.reference_number ?? null,
          notes: formData.notes ?? null,
          created_by: user?.id ?? null,
        }).select('*').maybeSingle();
        if (error) throw error;
        if (formData.account_id) { await updateAccountBalance(formData.account_id, -Number(formData.amount)); }

        // Create a single ledger entry (driver advance) linked to a party if available
        let ledgerEntryId: string | null = null;
        if (formData.recipient_party_id) {
          ledgerEntryId = await createLedgerEntry(
            businessId,
            formData.recipient_party_id,
            formData.advance_date!,
            'driver_advance',
            Number(formData.amount),
            0,
            `Driver advance for trip ${trip?.trip_number ?? ''}`,
            'trip_advance',
            newAdvance.id,
            user?.id ?? null
          );
          // Link the ledger entry back to the advance
          if (ledgerEntryId) {
            await supabase.from('trip_advances').update({ ledger_entry_id: ledgerEntryId }).eq('id', newAdvance.id);
          }
        }

        await logAudit(businessId, user?.id ?? null, 'advance_create', 'trip_advance', newAdvance.id, { amount: formData.amount, ledger_entry_id: ledgerEntryId });
        showToast('Advance recorded — appears in driver ledger exactly once');
      }
      onSave();
    } catch (err: any) { showToast(err.message ?? 'Failed to save', 'error'); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={advance ? 'Edit Advance' : 'Add Driver Advance'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-navy-50 rounded-lg p-3 text-xs text-navy-500">
          Driver advances are separate from salary payments. Each advance creates exactly one ledger entry. Editing an advance updates the existing entry — no duplicates.
        </div>
        <Select label="Trip" required error={errors.trip_id} value={formData.trip_id ?? ''} onChange={(e) => setFormData({ ...formData, trip_id: e.target.value })}>
          <option value="">Select trip...</option>
          {trips.map((t) => <option key={t.id} value={t.id}>{t.trip_number} — {formatDate(t.trip_date)} ({t.origin} → {t.destination})</option>)}
        </Select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Advance Date" type="date" required error={errors.advance_date} value={formData.advance_date ?? ''} onChange={(e) => setFormData({ ...formData, advance_date: e.target.value })} />
          <Select label="Recipient Type" value={formData.recipient_type ?? 'driver'} onChange={(e) => setFormData({ ...formData, recipient_type: e.target.value as RecipientType })}>
            {RECIPIENT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        {formData.recipient_type === 'driver' && (
          <div className="space-y-3">
            <Select label="Select Registered Driver (optional)" value={formData.recipient_party_id ?? ''} onChange={(e) => {
              const d = drivers.find((d) => d.id === e.target.value);
              setFormData({ ...formData, recipient_party_id: e.target.value || null, recipient_name: d?.driver_name ?? formData.recipient_name });
            }}>
              <option value="">— Enter name manually below —</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
            </Select>
            <Input label="Driver/Recipient Name" error={errors.recipient_name} value={formData.recipient_name ?? ''} onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })} placeholder="Driver name" />
          </div>
        )}
        {formData.recipient_type !== 'driver' && (
          <>
            <Select label="Select Party (for ledger)" value={formData.recipient_party_id ?? ''} onChange={(e) => {
              const p = parties.find((p) => p.id === e.target.value);
              setFormData({ ...formData, recipient_party_id: e.target.value || null, recipient_name: p?.party_name ?? formData.recipient_name });
            }}>
              <option value="">— Enter name manually below —</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
            </Select>
            <Input label="Recipient Name" value={formData.recipient_name ?? ''} onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })} placeholder="Recipient name" />
          </>
        )}
        <Select label="Cash / Bank Account" value={formData.account_id ?? ''} onChange={(e) => setFormData({ ...formData, account_id: e.target.value || null })}>
          <option value="">— No specific account —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name} ({a.account_type})</option>)}
        </Select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Amount (₹)" type="number" step="0.01" required error={errors.amount} value={String(formData.amount ?? 0)} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} />
          <Input label="Payment Method" value={formData.payment_method ?? ''} onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })} placeholder="Cash, UPI, Bank, etc." />
        </div>
        <Input label="Reference Number" value={formData.reference_number ?? ''} onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })} placeholder="Cheque no, UPI ref, etc." />
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{advance ? 'Update Advance' : 'Record Advance'}</Button>
        </div>
      </form>
    </Modal>
  );
}
