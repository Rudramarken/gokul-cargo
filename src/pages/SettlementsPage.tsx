import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry } from '@/lib/audit';
import { TruckOwnerSettlement, Party, Trip, SettlementStatus } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate, downloadCSV, todayISODate } from '@/lib/format';
import { Wallet, Plus, Search, Eye, Download, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';

const PAGE_SIZE = 15;

export function SettlementsPage() {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [settlements, setSettlements] = useState<(TruckOwnerSettlement & { truck_owner_party?: Party; trip?: Trip })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailSettlement, setDetailSettlement] = useState<TruckOwnerSettlement | null>(null);
  const [printSettlement, setPrintSettlement] = useState<TruckOwnerSettlement | null>(null);

  const loadSettlements = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('truck_owner_settlements').select('*, truck_owner_party:parties!truck_owner_settlements_truck_owner_party_id_fkey(*), trip:trips(*)').eq('business_id', businessId);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (ownerFilter) query = query.eq('truck_owner_party_id', ownerFilter);
    const { data, error, count } = await query.order('settlement_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load settlements', 'error'); setLoading(false); return; }
    setSettlements((data ?? []) as any[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setLoading(false);
  }, [businessId, statusFilter, ownerFilter, page, showToast]);

  useEffect(() => { loadSettlements(); }, [loadSettlements]);

  const handleExport = () => {
    const rows: (string | number)[][] = [['Date', 'Truck Owner', 'Trip', 'Agreed', 'Paid', 'Balance', 'Status']];
    settlements.forEach((s) => rows.push([formatDate(s.settlement_date), s.truck_owner_party?.party_name ?? '—', s.trip?.trip_number ?? '—', s.agreed_amount, s.paid_amount, s.balance_amount, s.status]));
    downloadCSV('truck-owner-settlements.csv', rows);
  };

  return (
    <div>
      <PageHeader title="Truck Owner Settlements" subtitle="Settle payments with attached/market vehicle owners" actions={<div className="flex gap-2"><Button variant="outline" onClick={handleExport}><Download size={16} /> Export</Button>{isAdmin && <Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Settlement</Button>}</div>} />
      <Card className="p-4 mb-4"><div className="flex flex-col sm:flex-row gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer"><option value="">All Status</option><option value="pending">Pending</option><option value="partially_settled">Partially Settled</option><option value="settled">Settled</option><option value="cancelled">Cancelled</option></select>
        <select value={ownerFilter} onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer"><option value="">All Owners</option></select>
      </div></Card>
      {loading ? <LoadingSpinner /> : settlements.length === 0 ? (
        <Card><EmptyState icon={<Wallet size={48} />} title="No settlements found" message="Create settlements for attached/market vehicle trips." action={isAdmin && <Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Settlement</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-600"><tr><th className="text-left px-4 py-3 font-semibold">Date</th><th className="text-left px-4 py-3 font-semibold">Truck Owner</th><th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Trip</th><th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Vehicle</th><th className="text-right px-4 py-3 font-semibold">Agreed</th><th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Paid</th><th className="text-right px-4 py-3 font-semibold">Balance</th><th className="text-center px-4 py-3 font-semibold">Status</th><th className="text-right px-4 py-3 font-semibold">Actions</th></tr></thead>
          <tbody className="divide-y divide-navy-50">{settlements.map((s) => (
            <tr key={s.id} className="hover:bg-navy-50/50 cursor-pointer" onClick={() => setDetailSettlement(s)}>
              <td className="px-4 py-3 text-navy-600">{formatDate(s.settlement_date)}</td><td className="px-4 py-3 font-medium text-navy-800">{s.truck_owner_party?.party_name ?? '—'}</td><td className="px-4 py-3 hidden md:table-cell text-navy-600">{s.trip?.trip_number ?? '—'}</td><td className="px-4 py-3 hidden lg:table-cell text-navy-600">{s.trip?.market_vehicle_number ?? '—'}</td>
              <td className="px-4 py-3 text-right font-semibold text-navy-800">{formatCurrency(s.agreed_amount)}</td><td className="px-4 py-3 text-right hidden md:table-cell text-green-700">{formatCurrency(s.paid_amount)}</td><td className="px-4 py-3 text-right font-semibold text-red-700">{formatCurrency(s.balance_amount)}</td>
              <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}><StatusBadge status={s.status} /></td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1"><button onClick={() => setDetailSettlement(s)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Eye size={15} /></button><button onClick={() => setPrintSettlement(s)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Printer size={15} /></button></div></td>
            </tr>
          ))}</tbody>
        </table></div><div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div></Card>
      )}
      <SettlementFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); loadSettlements(); }} />
      {detailSettlement && <SettlementDetailModal settlement={detailSettlement} onClose={() => setDetailSettlement(null)} onUpdated={loadSettlements} />}
      {printSettlement && <PrintSettlement settlement={printSettlement} onClose={() => setPrintSettlement(null)} />}
    </div>
  );
}

function SettlementFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Partial<TruckOwnerSettlement>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<(Trip & { truck_owner_party?: Party })[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId || !open) return;
    setTripsLoading(true);
    setTripsError(null);
    supabase.from('trips').select('*, truck_owner_party:parties!trips_truck_owner_party_id_fkey(*)').eq('business_id', businessId).eq('ownership_type_snapshot', 'attached').neq('status', 'cancelled').order('trip_date', { ascending: false }).limit(100).then(async ({ data, error }) => {
      if (error) { setTripsError(error.message); setTripsLoading(false); return; }
      const allTrips = data as any[] ?? [];
      const available: any[] = [];
      for (const t of allTrips) {
        const { data: set } = await supabase.from('truck_owner_settlements').select('id').eq('trip_id', t.id).neq('status', 'cancelled').maybeSingle();
        if (!set) available.push(t);
      }
      setTrips(available);
      setTripsLoading(false);
    });
  }, [businessId, open]);

  useEffect(() => { if (open) { setFormData({ settlement_date: todayISODate(), paid_amount: 0, status: 'pending' }); setErrors({}); } }, [open]);

  const handleTripSelect = (tripId: string) => {
    const trip = trips.find((t) => t.id === tripId);
    if (trip) setFormData((prev) => ({ ...prev, trip_id: tripId, truck_owner_party_id: trip.truck_owner_party_id ?? undefined, agreed_amount: Number(trip.truck_owner_cost), balance_amount: Number(trip.truck_owner_cost) - Number(prev.paid_amount ?? 0) }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.trip_id) errs.trip_id = 'Trip is required';
    if (!formData.truck_owner_party_id) errs.truck_owner_party_id = 'Truck owner is required';
    if (!formData.agreed_amount || Number(formData.agreed_amount) <= 0) errs.agreed_amount = 'Agreed amount must be greater than 0';
    if (Number(formData.paid_amount) < 0) errs.paid_amount = 'Paid amount cannot be negative';
    if (Number(formData.paid_amount) > Number(formData.agreed_amount)) errs.paid_amount = 'Paid cannot exceed agreed amount';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !businessId) return;
    setSaving(true);
    const balance = Number(formData.agreed_amount) - Number(formData.paid_amount);
    const status: SettlementStatus = balance <= 0 ? 'settled' : Number(formData.paid_amount) > 0 ? 'partially_settled' : 'pending';
    try {
      const { data, error } = await supabase.from('truck_owner_settlements').insert({ ...formData, business_id: businessId, balance_amount: balance, status }).select('*').maybeSingle();
      if (error) throw error;
      await logAudit(businessId, user?.id ?? null, 'settlement_create', 'truck_owner_settlement', data.id, { trip_id: formData.trip_id });
      if (Number(formData.paid_amount) > 0) {
        await createLedgerEntry(businessId, formData.truck_owner_party_id!, formData.settlement_date!, 'truck_owner_payment', Number(formData.paid_amount), 0, `Truck owner payment for trip`, 'settlement', data.id, user?.id ?? null);
      }
      showToast('Settlement created');
      onSaved();
    } catch (err: any) { showToast(err.message ?? 'Failed to save', 'error'); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="New Truck Owner Settlement" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {tripsError ? (
          <div className="py-3 text-center">
            <p className="text-sm text-red-600 mb-2">Failed to load trips: {tripsError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { setTripsLoading(true); setTripsError(null); }}>Retry</Button>
          </div>
        ) : tripsLoading ? (
          <p className="text-sm text-navy-400 py-3 text-center">Loading eligible trips...</p>
        ) : trips.length === 0 ? (
          <div className="py-3 text-center">
            <p className="text-sm text-orange-600 mb-2">No eligible attached/market trips found. Create a trip with an attached vehicle first.</p>
            <Link to="/trips"><Button type="button" variant="outline" size="sm">Go to Trips</Button></Link>
          </div>
        ) : (
          <Select label="Trip (Attached/Market)" required error={errors.trip_id} value={formData.trip_id ?? ''} onChange={(e) => handleTripSelect(e.target.value)}><option value="">Select trip...</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.trip_number} — {t.market_vehicle_number ?? 'No vehicle'} — {t.truck_owner_party?.party_name ?? '—'} ({formatDate(t.trip_date)})</option>)}</Select>
        )}
        {formData.truck_owner_party_id && <div className="bg-navy-50 rounded-lg p-3 text-sm"><p className="text-navy-400">Truck Owner</p><p className="font-medium">{trips.find((t) => t.id === formData.trip_id)?.truck_owner_party?.party_name ?? '—'}</p>{trips.find((t) => t.id === formData.trip_id)?.market_vehicle_number && <p className="text-navy-400 mt-1">Vehicle: <span className="font-medium text-navy-700">{trips.find((t) => t.id === formData.trip_id)?.market_vehicle_number}</span></p>}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Agreed Amount (₹)" type="number" step="0.01" required error={errors.agreed_amount} value={String(formData.agreed_amount ?? 0)} onChange={(e) => setFormData({ ...formData, agreed_amount: Number(e.target.value), balance_amount: Number(e.target.value) - Number(formData.paid_amount ?? 0) })} />
          <Input label="Paid Amount (₹)" type="number" step="0.01" error={errors.paid_amount} value={String(formData.paid_amount ?? 0)} onChange={(e) => setFormData({ ...formData, paid_amount: Number(e.target.value), balance_amount: Number(formData.agreed_amount ?? 0) - Number(e.target.value) })} />
        </div>
        <Input label="Settlement Date" type="date" value={formData.settlement_date ?? ''} onChange={(e) => setFormData({ ...formData, settlement_date: e.target.value })} />
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2"><Button variant="outline" onClick={onClose} type="button">Cancel</Button><Button type="submit" loading={saving}>Create Settlement</Button></div>
      </form>
    </Modal>
  );
}

function SettlementDetailModal({ settlement, onClose, onUpdated }: { settlement: TruckOwnerSettlement; onClose: () => void; onUpdated: () => void }) {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [owner, setOwner] = useState<Party | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('trips').select('*').eq('id', settlement.trip_id).maybeSingle().then(({ data }) => setTrip(data as Trip | null));
    supabase.from('parties').select('*').eq('id', settlement.truck_owner_party_id).maybeSingle().then(({ data }) => setOwner(data as Party | null));
  }, [settlement]);

  const handlePayment = async () => {
    if (payAmount <= 0 || payAmount > settlement.balance_amount) { showToast('Invalid payment amount', 'error'); return; }
    setSaving(true);
    const newPaid = Number(settlement.paid_amount) + payAmount;
    const newBalance = Number(settlement.agreed_amount) - newPaid;
    const newStatus: SettlementStatus = newBalance <= 0 ? 'settled' : 'partially_settled';
    const { error } = await supabase.from('truck_owner_settlements').update({ paid_amount: newPaid, balance_amount: newBalance, status: newStatus, updated_at: new Date().toISOString() }).eq('id', settlement.id);
    if (error) { showToast(error.message, 'error'); setSaving(false); return; }
    await createLedgerEntry(businessId!, settlement.truck_owner_party_id, todayISODate(), 'truck_owner_payment', payAmount, 0, `Truck owner payment for trip ${trip?.trip_number ?? ''}`, 'settlement', settlement.id, user?.id ?? null);
    await logAudit(businessId!, user?.id ?? null, 'settlement_payment', 'truck_owner_settlement', settlement.id, { amount: payAmount });
    showToast('Payment recorded');
    setSaving(false); setPayAmount(0); onUpdated(); onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Settlement Details" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-navy-400">Date</p><p className="font-medium">{formatDate(settlement.settlement_date)}</p></div>
          <div><p className="text-navy-400">Trip</p><p className="font-medium">{trip?.trip_number ?? '—'}</p></div>
          <div><p className="text-navy-400">Vehicle</p><p className="font-medium">{trip?.market_vehicle_number ?? '—'}</p></div>
          <div><p className="text-navy-400">Truck Owner</p><p className="font-medium">{owner?.party_name ?? '—'}</p></div>
          <div><p className="text-navy-400">Status</p><StatusBadge status={settlement.status} /></div>
        </div>
        <div className="bg-navy-50 rounded-lg p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-navy-600">Agreed Amount</span><span className="font-semibold">{formatCurrency(settlement.agreed_amount)}</span></div>
          <div className="flex justify-between"><span className="text-navy-600">Paid Amount</span><span className="font-semibold text-green-700">{formatCurrency(settlement.paid_amount)}</span></div>
          <div className="flex justify-between border-t border-navy-200 pt-1"><span className="font-bold">Balance</span><span className="font-bold text-red-700">{formatCurrency(settlement.balance_amount)}</span></div>
        </div>
        {settlement.notes && <p className="text-sm text-navy-600">{settlement.notes}</p>}
        {isAdmin && settlement.balance_amount > 0 && settlement.status !== 'cancelled' && (
          <div className="border-t border-navy-100 pt-4">
            <h3 className="text-sm font-semibold text-navy-700 mb-2">Record Additional Payment</h3>
            <div className="flex gap-2"><input type="number" step="0.01" placeholder={`Max: ${formatCurrency(settlement.balance_amount)}`} value={String(payAmount || '')} onChange={(e) => setPayAmount(Number(e.target.value))} className="flex-1 px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" /><Button loading={saving} onClick={handlePayment}>Record Payment</Button></div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PrintSettlement({ settlement, onClose }: { settlement: TruckOwnerSettlement; onClose: () => void }) {
  const { business, settings } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [owner, setOwner] = useState<Party | null>(null);

  useEffect(() => {
    supabase.from('trips').select('*').eq('id', settlement.trip_id).maybeSingle().then(({ data }) => setTrip(data as Trip | null));
    supabase.from('parties').select('*').eq('id', settlement.truck_owner_party_id).maybeSingle().then(({ data }) => setOwner(data as Party | null));
  }, [settlement]);

  return (
    <Modal open={true} onClose={onClose} title="Print Settlement" size="md">
      <div className="print-container border border-navy-200 rounded-lg p-8 bg-white" id="print-area">
        <div className="flex items-start justify-between border-b-2 border-navy-800 pb-4 mb-6">
          <div><h1 className="text-2xl font-bold text-navy-800">{business?.business_name ?? settings?.business_name}</h1><p className="text-sm text-navy-600">{settings?.address ?? business?.address}</p><p className="text-sm text-navy-600">Phone: {settings?.phone ?? business?.phone}</p></div>
          <div className="text-right"><h2 className="text-xl font-bold text-navy-700">Settlement Statement</h2><p className="text-sm">Date: {formatDate(settlement.settlement_date)}</p></div>
        </div>
        <div className="mb-6 text-sm"><p className="font-semibold text-navy-700">Truck Owner:</p><p className="font-medium">{owner?.party_name ?? '—'}</p><p className="text-navy-500">{owner?.address ?? ''}</p><p className="text-navy-500">{owner?.phone ?? ''}</p></div>
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div className="border border-navy-200 rounded p-3"><p className="text-navy-400">Trip Number</p><p className="font-medium">{trip?.trip_number ?? '—'}</p></div>
          <div className="border border-navy-200 rounded p-3"><p className="text-navy-400">Vehicle Number</p><p className="font-medium">{trip?.market_vehicle_number ?? '—'}</p></div>
          <div className="border border-navy-200 rounded p-3"><p className="text-navy-400">Route</p><p className="font-medium">{trip?.origin} → {trip?.destination}</p></div>
        </div>
        <table className="w-full text-sm border border-navy-200 mb-6"><tbody>
          <tr className="border-b border-navy-100"><td className="p-2 font-medium">Agreed Amount</td><td className="p-2 text-right font-semibold">{formatCurrency(settlement.agreed_amount)}</td></tr>
          <tr className="border-b border-navy-100"><td className="p-2 font-medium">Paid Amount</td><td className="p-2 text-right text-green-700">{formatCurrency(settlement.paid_amount)}</td></tr>
          <tr className="border-b border-navy-100"><td className="p-2 font-bold">Balance Payable</td><td className="p-2 text-right font-bold text-red-700">{formatCurrency(settlement.balance_amount)}</td></tr>
        </tbody></table>
        <div className="flex justify-between items-end mt-8"><div className="text-xs text-navy-400">{settlement.notes && <p>Notes: {settlement.notes}</p>}</div><div className="text-center"><div className="border-t border-navy-300 w-40 mt-12 pt-1 text-xs text-navy-500">Authorized Signature</div></div></div>
      </div>
      <div className="flex justify-end gap-3 mt-4 no-print"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => window.print()}><Printer size={16} /> Print</Button></div>
    </Modal>
  );
}
