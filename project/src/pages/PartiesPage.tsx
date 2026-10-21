import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry } from '@/lib/audit';
import { Party, PartyType, OpeningBalanceType } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination } from '@/components/ui';
import { formatCurrency, formatDate, cn } from '@/lib/format';
import { Users, Plus, Search, Edit2, Eye, Archive, Phone, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

const PAGE_SIZE = 15;

export function PartiesPage() {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [confirmArchive, setConfirmArchive] = useState<Party | null>(null);

  const loadParties = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('parties').select('*', { count: 'exact' }).eq('business_id', businessId);

    if (search) {
      query = query.or(`party_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    if (typeFilter) query = query.eq('party_type', typeFilter);
    if (statusFilter) query = query.eq('is_active', statusFilter === 'active');

    const { data, error, count } = await query
      .order('party_name', { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (error) {
      showToast('Failed to load parties', 'error');
      setLoading(false);
      return;
    }

    setParties((data ?? []) as Party[]);
    setTotalPages(Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)));

    // Load balances for each party
    if (data) {
      const balMap: Record<string, number> = {};
      for (const party of data) {
        const { data: ledger } = await supabase
          .from('ledger_entries')
          .select('debit, credit, is_reversed')
          .eq('party_id', party.id)
          .eq('is_reversed', false);
        const debit = (ledger ?? []).reduce((s, e) => s + Number(e.debit), 0);
        const credit = (ledger ?? []).reduce((s, e) => s + Number(e.credit), 0);
        balMap[party.id] = debit - credit;
      }
      setBalances(balMap);
    }
    setLoading(false);
  }, [businessId, search, typeFilter, statusFilter, page, showToast]);

  useEffect(() => { loadParties(); }, [loadParties]);

  const handleSave = async (formData: Partial<Party>): Promise<boolean> => {
    if (!businessId) { showToast('No business selected', 'error'); return false; }

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (value === '' || value === undefined) {
        cleaned[key] = null;
      } else {
        cleaned[key] = value;
      }
    }
    cleaned.business_id = businessId;

    if (editingParty) {
      const { error } = await supabase.from('parties').update({
        ...cleaned,
        updated_at: new Date().toISOString(),
      }).eq('id', editingParty.id);

      if (error) { showToast(error.message, 'error'); return false; }

      await logAudit(businessId, user?.id ?? null, 'party_update', 'party', editingParty.id, { name: formData.party_name });
      showToast('Party updated successfully');
    } else {
      const { data, error } = await supabase.from('parties').insert(cleaned).select('*').maybeSingle();

      if (error) { showToast(error.message, 'error'); return false; }

      if (data) {
        await logAudit(businessId, user?.id ?? null, 'party_create', 'party', data.id, { name: formData.party_name });

        if (Number(formData.opening_balance) > 0 && formData.opening_balance_type && formData.opening_balance_type !== 'none') {
          const isReceivable = formData.opening_balance_type === 'receivable';
          await createLedgerEntry(
            businessId,
            data.id,
            formData.opening_balance_date ?? new Date().toISOString().split('T')[0],
            'opening_balance',
            isReceivable ? Number(formData.opening_balance) : 0,
            isReceivable ? 0 : Number(formData.opening_balance),
            `Opening balance: ${formData.opening_balance_type}`,
            'party',
            data.id,
            user?.id ?? null
          );
        }
      }
      showToast('Party created successfully');
    }
    setModalOpen(false);
    setEditingParty(null);
    loadParties();
    return true;
  };

  const handleArchive = async (party: Party) => {
    if (!businessId) { setLoading(false); return; }
    const { error } = await supabase.from('parties').update({ is_active: !party.is_active, updated_at: new Date().toISOString() }).eq('id', party.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, party.is_active ? 'party_archive' : 'party_restore', 'party', party.id, { name: party.party_name });
    showToast(party.is_active ? 'Party archived' : 'Party restored');
    setConfirmArchive(null);
    loadParties();
  };

  const partyTypeColors: Record<string, string> = {
    customer: 'blue', supplier: 'orange', both: 'green', other: 'gray',
  };

  return (
    <div>
      <PageHeader
        title="Parties"
        subtitle="Manage customers, suppliers, and truck owners"
        actions={<Button onClick={() => { setEditingParty(null); setModalOpen(true); }}><Plus size={16} /> Add Party</Button>}
      />

      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300"
            />
          </div>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Types</option>
            <option value="customer">Customer</option>
            <option value="supplier">Supplier / Truck Owner</option>
            <option value="both">Both</option>
            <option value="other">Other</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : parties.length === 0 ? (
        <Card><EmptyState icon={<Users size={48} />} title="No parties found" message="Add your first customer, supplier, or truck owner to get started." action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add Party</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Name</th>
                  <th className="text-left px-4 py-3 font-semibold">Type</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">City</th>
                  <th className="text-right px-4 py-3 font-semibold">Opening Bal.</th>
                  <th className="text-right px-4 py-3 font-semibold">Current Balance</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {parties.map((party) => {
                  const balance = balances[party.id] ?? 0;
                  return (
                    <tr key={party.id} className="hover:bg-navy-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/parties/${party.id}`} className="font-medium text-navy-800 hover:text-navy-600">{party.party_name}</Link>
                        {party.contact_person && <p className="text-xs text-navy-400">{party.contact_person}</p>}
                      </td>
                      <td className="px-4 py-3"><Badge color={partyTypeColors[party.party_type]}>{party.party_type}</Badge></td>
                      <td className="px-4 py-3 hidden md:table-cell text-navy-600">{party.phone ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{party.city ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-navy-600">
                        {party.opening_balance > 0 ? formatCurrency(party.opening_balance) : '—'}
                        {party.opening_balance > 0 && <span className={cn(' text-xs ml-1', party.opening_balance_type === 'receivable' ? 'text-green-600' : 'text-red-600')}>({party.opening_balance_type === 'receivable' ? 'Dr' : 'Cr'})</span>}
                      </td>
                      <td className={cn('px-4 py-3 text-right font-semibold', balance >= 0 ? 'text-green-700' : 'text-red-700')}>
                        {formatCurrency(Math.abs(balance))}
                        <span className="text-xs ml-1 text-navy-400">{balance >= 0 ? 'Dr' : 'Cr'}</span>
                      </td>
                      <td className="px-4 py-3 text-center"><Badge color={party.is_active ? 'green' : 'gray'}>{party.is_active ? 'Active' : 'Inactive'}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/parties/${party.id}`} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Eye size={15} /></Link>
                          <button onClick={() => { setEditingParty(party); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button>
                          <button onClick={() => setConfirmArchive(party)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Archive size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}

      <PartyFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingParty(null); }} party={editingParty} onSave={handleSave} />
      <ConfirmDialog
        open={!!confirmArchive}
        onClose={() => setConfirmArchive(null)}
        onConfirm={() => confirmArchive && handleArchive(confirmArchive)}
        title={confirmArchive?.is_active ? 'Archive Party' : 'Restore Party'}
        message={`Are you sure you want to ${confirmArchive?.is_active ? 'archive' : 'restore'} "${confirmArchive?.party_name}"? ${confirmArchive?.is_active ? 'Existing financial records will be preserved.' : ''}`}
        confirmText={confirmArchive?.is_active ? 'Archive' : 'Restore'}
        danger={confirmArchive?.is_active}
      />
    </div>
  );
}

function PartyFormModal({ open, onClose, party, onSave }: { open: boolean; onClose: () => void; party: Party | null; onSave: (data: Partial<Party>) => Promise<boolean> }) {
  const [formData, setFormData] = useState<Partial<Party>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (party) {
      setFormData(party);
    } else {
      setFormData({
        party_type: 'customer',
        opening_balance_type: 'none',
        is_active: true,
        opening_balance: 0,
      });
    }
    setErrors({});
  }, [party, open]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.party_name?.trim()) errs.party_name = 'Party name is required';
    if (formData.opening_balance && Number(formData.opening_balance) < 0) errs.opening_balance = 'Opening balance cannot be negative';
    if (formData.opening_balance && Number(formData.opening_balance) > 0 && formData.opening_balance_type === 'none') errs.opening_balance_type = 'Select receivable or payable for opening balance';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    const success = await onSave(formData);
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={party ? 'Edit Party' : 'Add Party'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Party Name" required error={errors.party_name} value={formData.party_name ?? ''} onChange={(e) => setFormData({ ...formData, party_name: e.target.value })} placeholder="ABC Transport Co." />
          <Select label="Party Type" required value={formData.party_type ?? 'customer'} onChange={(e) => setFormData({ ...formData, party_type: e.target.value as PartyType })}>
            <option value="customer">Customer</option>
            <option value="supplier">Supplier / Truck Owner</option>
            <option value="both">Both</option>
            <option value="other">Other</option>
          </Select>
          <Input label="Contact Person" value={formData.contact_person ?? ''} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} placeholder="John Doe" />
          <Input label="Phone" value={formData.phone ?? ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="9876543210" />
          <Input label="Alternate Phone" value={formData.alternate_phone ?? ''} onChange={(e) => setFormData({ ...formData, alternate_phone: e.target.value })} placeholder="9876543211" />
          <Input label="City" value={formData.city ?? ''} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Mumbai" />
          <Input label="State" value={formData.state ?? ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })} placeholder="Maharashtra" />
          <Input label="Address" value={formData.address ?? ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Business Street" />
        </div>

        {!party && (
          <div className="border-t border-navy-100 pt-4">
            <h3 className="text-sm font-semibold text-navy-700 mb-3">Opening Balance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Amount (₹)" type="number" step="0.01" error={errors.opening_balance} value={String(formData.opening_balance ?? 0)} onChange={(e) => setFormData({ ...formData, opening_balance: Number(e.target.value) })} />
              <Select label="Balance Type" error={errors.opening_balance_type} value={formData.opening_balance_type ?? 'none'} onChange={(e) => setFormData({ ...formData, opening_balance_type: e.target.value as OpeningBalanceType })}>
                <option value="none">None</option>
                <option value="receivable">Receivable (Dr)</option>
                <option value="payable">Payable (Cr)</option>
              </Select>
              <Input label="Effective Date" type="date" value={formData.opening_balance_date ?? ''} onChange={(e) => setFormData({ ...formData, opening_balance_date: e.target.value })} />
            </div>
          </div>
        )}

        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional information about this party..." />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{party ? 'Update Party' : 'Create Party'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function PartyDetailPage({ partyId }: { partyId: string }) {
  const { businessId } = useAuth();
  const [party, setParty] = useState<Party | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningBalance, setRunningBalance] = useState(0);

  useEffect(() => {
    if (!businessId || !partyId) return;
    setLoading(true);

    Promise.all([
      supabase.from('parties').select('*').eq('id', partyId).maybeSingle(),
      supabase.from('ledger_entries').select('*').eq('party_id', partyId).eq('is_reversed', false).order('transaction_date', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('trips').select('*, vehicle:vehicles(*), driver:drivers(*)').eq('party_id', partyId).order('trip_date', { ascending: false }).limit(10),
      supabase.from('customer_bills').select('*').eq('customer_party_id', partyId).order('bill_date', { ascending: false }).limit(10),
      supabase.from('payments').select('*').eq('party_id', partyId).eq('is_reversed', false).order('payment_date', { ascending: false }).limit(10),
      supabase.from('truck_owner_settlements').select('*, trip:trips(*)').eq('truck_owner_party_id', partyId).order('settlement_date', { ascending: false }).limit(10),
    ]).then(([partyRes, ledgerRes, tripsRes, billsRes, paymentsRes, settlementsRes]) => {
      setParty(partyRes.data as Party | null);
      const ledger = (ledgerRes.data ?? []) as any[];
      setLedgerEntries(ledger);
      let bal = 0;
      const withRunning = ledger.map((e) => {
        bal += Number(e.debit) - Number(e.credit);
        return { ...e, running: bal };
      });
      setLedgerEntries(withRunning);
      setRunningBalance(bal);
      setTrips(tripsRes.data as any[]);
      setBills(billsRes.data as any[]);
      setPayments(paymentsRes.data as any[]);
      setSettlements(settlementsRes.data as any[]);
      setLoading(false);
    });
  }, [businessId, partyId]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (!party) return <Card><EmptyState title="Party not found" message="This party may have been deleted." /></Card>;

  const typeColors: Record<string, string> = { customer: 'blue', supplier: 'orange', both: 'green', other: 'gray' };

  return (
    <div>
      <PageHeader
        title={party.party_name}
        subtitle={`${party.party_type} · ${party.is_active ? 'Active' : 'Inactive'}`}
        actions={
          <div className="flex gap-2">
            <Link to="/parties"><Button variant="outline">Back to Parties</Button></Link>
            <Link to="/ledger"><Button variant="outline"><Eye size={16} /> View Ledger</Button></Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Contact Information</h3>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-navy-400">Contact Person</dt><dd className="text-navy-800">{party.contact_person ?? '—'}</dd></div>
            <div><dt className="text-navy-400">Phone</dt><dd className="text-navy-800">{party.phone ?? '—'}</dd></div>
            <div><dt className="text-navy-400">Alt Phone</dt><dd className="text-navy-800">{party.alternate_phone ?? '—'}</dd></div>
            <div><dt className="text-navy-400">Address</dt><dd className="text-navy-800">{party.address ?? '—'}</dd></div>
            <div><dt className="text-navy-400">City</dt><dd className="text-navy-800">{party.city ?? '—'}, {party.state ?? '—'}</dd></div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Financial Summary</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-navy-400">Opening Balance</dt><dd className="text-navy-800 font-medium">{formatCurrency(party.opening_balance)} ({party.opening_balance_type === 'receivable' ? 'Dr' : party.opening_balance_type === 'payable' ? 'Cr' : '—'})</dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Current Balance</dt><dd className={runningBalance >= 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>{formatCurrency(Math.abs(runningBalance))} ({runningBalance >= 0 ? 'Dr' : 'Cr'})</dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Total Trips</dt><dd className="text-navy-800 font-medium">{trips.length}{trips.length === 10 ? '+' : ''}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Total Bills</dt><dd className="text-navy-800 font-medium">{bills.length}{bills.length === 10 ? '+' : ''}</dd></div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Notes</h3>
          <p className="text-sm text-navy-600">{party.notes ?? 'No notes recorded.'}</p>
        </Card>
      </div>

      <Card className="p-5 mb-6">
        <h3 className="text-sm font-semibold text-navy-700 mb-3">Recent Ledger</h3>
        {ledgerEntries.length === 0 ? <p className="text-sm text-navy-400 text-center py-4">No ledger entries</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-navy-400 border-b border-navy-100">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">Date</th>
                  <th className="text-left py-2 px-2 font-medium">Type</th>
                  <th className="text-left py-2 px-2 font-medium">Description</th>
                  <th className="text-right py-2 px-2 font-medium">Debit</th>
                  <th className="text-right py-2 px-2 font-medium">Credit</th>
                  <th className="text-right py-2 px-2 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {ledgerEntries.slice(-10).reverse().map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 px-2 text-navy-600">{formatDate(e.transaction_date)}</td>
                    <td className="py-2 px-2"><Badge color="gray">{e.transaction_type.replace(/_/g, ' ')}</Badge></td>
                    <td className="py-2 px-2 text-navy-700">{e.description}</td>
                    <td className="py-2 px-2 text-right text-navy-700">{e.debit > 0 ? formatCurrency(e.debit) : '—'}</td>
                    <td className="py-2 px-2 text-right text-navy-700">{e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
                    <td className={`py-2 px-2 text-right font-medium ${e.running >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(Math.abs(e.running))} ({e.running >= 0 ? 'Dr' : 'Cr'})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Recent Trips</h3>
          {trips.length === 0 ? <p className="text-sm text-navy-400 text-center py-4">No trips</p> : (
            <div className="space-y-2">{trips.map((t) => (
              <Link key={t.id} to={`/trips/${t.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50">
                <div><p className="text-sm font-medium text-navy-800">{t.trip_number}</p><p className="text-xs text-navy-400">{formatDate(t.trip_date)} · {t.origin} → {t.destination}</p></div>
                <span className="text-sm font-semibold text-navy-700">{formatCurrency(t.customer_freight)}</span>
              </Link>
            ))}</div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Recent Payments</h3>
          {payments.length === 0 ? <p className="text-sm text-navy-400 text-center py-4">No payments</p> : (
            <div className="space-y-2">{payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50">
                <div><p className="text-sm font-medium text-navy-800">{formatDate(p.payment_date)}</p><p className="text-xs text-navy-400">{p.payment_type.replace(/_/g, ' ')}</p></div>
                <span className="text-sm font-semibold text-green-700">{formatCurrency(p.amount)}</span>
              </div>
            ))}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
