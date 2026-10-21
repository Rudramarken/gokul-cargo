import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { PartyRate, Party, RateType } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { TrendingUp, Plus, Search, Edit2, Trash2 } from 'lucide-react';

const PAGE_SIZE = 15;

export function PartyRatesPage() {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [rates, setRates] = useState<PartyRate[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<PartyRate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PartyRate | null>(null);

  const loadRates = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('party_rates').select('*, party:parties(*)').eq('business_id', businessId);
    if (search) {
      query = query.or(`origin.ilike.%${search}%,destination.ilike.%${search}%`);
    }
    if (partyFilter) query = query.eq('party_id', partyFilter);
    const { data, error, count } = await query.order('effective_from', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load rates', 'error'); setLoading(false); return; }
    setRates((data ?? []) as PartyRate[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setLoading(false);
  }, [businessId, search, partyFilter, page, showToast]);

  const loadParties = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    const { data } = await supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).order('party_name');
    setParties((data ?? []) as Party[]);
  }, [businessId]);

  useEffect(() => { loadRates(); loadParties(); }, [loadRates, loadParties]);

  const handleSave = async (formData: Partial<PartyRate>) => {
    if (!businessId) { setLoading(false); return; }
    if (editingRate) {
      const { error } = await supabase.from('party_rates').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', editingRate.id);
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user?.id ?? null, 'rate_update', 'party_rate', editingRate.id, { party_id: formData.party_id });
      showToast('Rate updated successfully');
    } else {
      const { error } = await supabase.from('party_rates').insert({ ...formData, business_id: businessId });
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user?.id ?? null, 'rate_create', 'party_rate', null, { party_id: formData.party_id });
      showToast('Rate created successfully');
    }
    setModalOpen(false); setEditingRate(null); loadRates();
  };

  const handleDelete = async (rate: PartyRate) => {
    if (!businessId) { setLoading(false); return; }
    const { error } = await supabase.from('party_rates').delete().eq('id', rate.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, 'rate_delete', 'party_rate', rate.id, {});
    showToast('Rate deleted'); setConfirmDelete(null); loadRates();
  };

  const isCurrentlyActive = (rate: PartyRate) => {
    const today = new Date().toISOString().split('T')[0];
    return rate.effective_from <= today && (!rate.effective_to || rate.effective_to >= today);
  };

  return (
    <div>
      <PageHeader title="Party Rates" subtitle="Manage customer rate cards for routes" actions={isAdmin && <Button onClick={() => { setEditingRate(null); setModalOpen(true); }}><Plus size={16} /> Add Rate</Button>} />

      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder="Search by origin or destination..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>
          <select value={partyFilter} onChange={(e) => { setPartyFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Parties</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
          </select>
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : rates.length === 0 ? (
        <Card><EmptyState icon={<TrendingUp size={48} />} title="No rates found" message="Add rate cards for your customers to streamline trip creation." action={isAdmin && <Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add Rate</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Party</th>
                  <th className="text-left px-4 py-3 font-semibold">Route</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Vehicle Cat.</th>
                  <th className="text-left px-4 py-3 font-semibold">Rate Type</th>
                  <th className="text-right px-4 py-3 font-semibold">Rate</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Effective</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  {isAdmin && <th className="text-right px-4 py-3 font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {rates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-navy-50/50">
                    <td className="px-4 py-3 font-medium text-navy-800">{rate.party?.party_name ?? '—'}</td>
                    <td className="px-4 py-3 text-navy-600">{rate.origin} → {rate.destination}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-navy-600">{rate.vehicle_category ?? 'Any'}</td>
                    <td className="px-4 py-3"><Badge color={rate.rate_type === 'fixed' ? 'navy' : 'blue'}>{rate.rate_type === 'fixed' ? 'Fixed' : 'Per Quintal'}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold text-navy-800">{formatCurrency(rate.rate_value)}{rate.rate_type === 'per_quintal' && <span className="text-xs text-navy-400">/qtl</span>}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{formatDate(rate.effective_from)}{rate.effective_to && ` — ${formatDate(rate.effective_to)}`}</td>
                    <td className="px-4 py-3 text-center"><Badge color={isCurrentlyActive(rate) ? 'green' : 'gray'}>{isCurrentlyActive(rate) ? 'Active' : 'Inactive'}</Badge></td>
                    {isAdmin && <td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => { setEditingRate(rate); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button><button onClick={() => setConfirmDelete(rate)} className="p-1.5 rounded-lg hover:bg-navy-100 text-red-600"><Trash2 size={15} /></button></div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}

      <RateFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingRate(null); }} rate={editingRate} parties={parties} onSave={handleSave} />
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={() => confirmDelete && handleDelete(confirmDelete)} title="Delete Rate" message="Are you sure you want to delete this rate? Existing trips will retain their saved rates." confirmText="Delete" danger />
    </div>
  );
}

function RateFormModal({ open, onClose, rate, parties, onSave }: { open: boolean; onClose: () => void; rate: PartyRate | null; parties: Party[]; onSave: (data: Partial<PartyRate>) => void }) {
  const [formData, setFormData] = useState<Partial<PartyRate>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rate) setFormData(rate);
    else setFormData({ rate_type: 'fixed', effective_from: new Date().toISOString().split('T')[0] });
    setErrors({});
  }, [rate, open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.party_id) errs.party_id = 'Party is required';
    if (!formData.origin?.trim()) errs.origin = 'Origin is required';
    if (!formData.destination?.trim()) errs.destination = 'Destination is required';
    if (!formData.rate_value || Number(formData.rate_value) <= 0) errs.rate_value = 'Rate must be greater than 0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await onSave(formData);
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={rate ? 'Edit Rate' : 'Add Rate'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Party" required error={errors.party_id} value={formData.party_id ?? ''} onChange={(e) => setFormData({ ...formData, party_id: e.target.value })}>
          <option value="">Select party...</option>
          {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
        </Select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Origin" required error={errors.origin} value={formData.origin ?? ''} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder="Mumbai" />
          <Input label="Destination" required error={errors.destination} value={formData.destination ?? ''} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} placeholder="Delhi" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Vehicle Category (optional)" value={formData.vehicle_category ?? ''} onChange={(e) => setFormData({ ...formData, vehicle_category: e.target.value })} placeholder="Truck, Mini, etc." />
          <Select label="Rate Type" required value={formData.rate_type ?? 'fixed'} onChange={(e) => setFormData({ ...formData, rate_type: e.target.value as RateType })}>
            <option value="fixed">Fixed Trip Rate</option>
            <option value="per_quintal">Per Quintal Rate</option>
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Rate Value (₹)" type="number" step="0.01" required error={errors.rate_value} value={String(formData.rate_value ?? '')} onChange={(e) => setFormData({ ...formData, rate_value: Number(e.target.value) })} />
          <Input label="Effective From" type="date" required value={formData.effective_from ?? ''} onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })} />
          <Input label="Effective To (optional)" type="date" value={formData.effective_to ?? ''} onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })} />
        </div>
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{rate ? 'Update Rate' : 'Create Rate'}</Button>
        </div>
      </form>
    </Modal>
  );
}
