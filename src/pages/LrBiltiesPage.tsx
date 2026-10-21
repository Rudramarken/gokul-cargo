import { useState, useEffect, useCallback, FormEvent, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry } from '@/lib/audit';
import {
  LrBilty, LrExpense, Trip, TripStop, Party, Vehicle, Driver,
  RateType, JourneyDirection, FreightPaymentStatus,
  CommissionType, CommissionStatus, PaidByType, LrExpenseSide,
} from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate, calculateBaseFreight, calculateFinalFreight, todayISODate, cn } from '@/lib/format';
import { FileText, Plus, Search, Edit2, Printer, Trash2, Eye, ArrowUpDown } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

const PAGE_SIZE = 15;

const DIRECTION_LABELS: Record<JourneyDirection, string> = {
  up: 'Up', down: 'Down', return: 'Return', single: 'Single',
};

export function LrBiltiesPage() {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [bilties, setBilties] = useState<LrBilty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tripFilter, setTripFilter] = useState(searchParams.get('trip') ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBilty, setEditingBilty] = useState<LrBilty | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<LrBilty | null>(null);
  const [detailBilty, setDetailBilty] = useState<LrBilty | null>(null);
  const [printBilty, setPrintBilty] = useState<LrBilty | null>(null);

  const loadBilties = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('lr_bilties')
      .select('*, trip:trips(*), consignor_party:parties!consignor_party_id(*), consignee_party:parties!consignee_party_id(*), transporter_vehicle:vehicles(*), transporter_driver:drivers(*)', { count: 'exact' })
      .eq('business_id', businessId);
    if (search) query = query.or(`lr_number.ilike.%${search}%`);
    if (statusFilter) query = query.eq('document_status', statusFilter);
    if (tripFilter) query = query.eq('trip_id', tripFilter);
    if (dateFrom) query = query.gte('bilty_date', dateFrom);
    if (dateTo) query = query.lte('bilty_date', dateTo);
    const { data, error, count } = await query.order('bilty_date', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load LR/bilties', 'error'); setLoading(false); return; }
    setBilties((data ?? []) as LrBilty[]);
    setTotalPages(Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)));
    setLoading(false);
  }, [businessId, search, statusFilter, tripFilter, dateFrom, dateTo, page, showToast]);

  useEffect(() => { loadBilties(); }, [loadBilties]);

  const handleCancel = async (bilty: LrBilty) => {
    if (!businessId) return;
    const { error } = await supabase.from('lr_bilties').update({ document_status: 'cancelled' }).eq('id', bilty.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, 'lr_cancel', 'lr_bilty', bilty.id, { lr_number: bilty.lr_number });
    showToast('LR/bilty cancelled');
    setConfirmCancel(null); loadBilties();
  };

  return (
    <div>
      <PageHeader title="LR / Bilty Register" subtitle="Lorry receipt and bilty documents with full consignment details" actions={<Button onClick={() => { setEditingBilty(null); setModalOpen(true); }}><Plus size={16} /> New LR/Bilty</Button>} />

      <Card className="p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder="Search by LR number..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : bilties.length === 0 ? (
        <Card><EmptyState icon={<FileText size={48} />} title="No LR/bilties found" message="Create your first lorry receipt or bilty document — with or without a trip." action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New LR/Bilty</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">LR No.</th>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Dir</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Trip</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Consignor</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Consignee</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Transporter</th>
                  <th className="text-right px-4 py-3 font-semibold">Final Amt</th>
                  <th className="text-center px-4 py-3 font-semibold hidden md:table-cell">Freight</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {bilties.map((b) => (
                  <tr key={b.id} className="hover:bg-navy-50/50 cursor-pointer" onClick={() => setDetailBilty(b)}>
                    <td className="px-4 py-3 font-medium text-navy-800">{b.lr_number}</td>
                    <td className="px-4 py-3 text-navy-600">{formatDate(b.bilty_date)}</td>
                    <td className="px-4 py-3 hidden md:table-cell"><Badge color={b.journey_direction === 'return' ? 'orange' : 'green'}>{DIRECTION_LABELS[b.journey_direction ?? 'single']}</Badge></td>
                    <td className="px-4 py-3 hidden md:table-cell">{b.trip_id ? <Link to={`/trips/${b.trip_id}`} className="text-navy-600 hover:text-navy-800" onClick={(e) => e.stopPropagation()}>{b.trip?.trip_number ?? '—'}</Link> : <span className="text-navy-400">Standalone</span>}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{b.consignor_party?.party_name ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{b.consignee_party?.party_name ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{b.transporter_name ?? b.transporter_vehicle_number ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-navy-800">{formatCurrency(b.final_amount || b.freight_amount)}</td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <Badge color={b.freight_payment_status === 'paid' ? 'green' : b.freight_payment_status === 'partially_paid' ? 'orange' : 'gray'}>{b.freight_payment_status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}><StatusBadge status={b.document_status} /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setDetailBilty(b)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Eye size={15} /></button>
                        <button onClick={() => setPrintBilty(b)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Printer size={15} /></button>
                        <button onClick={() => { setEditingBilty(b); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button>
                        {b.document_status === 'active' && <button onClick={() => setConfirmCancel(b)} className="p-1.5 rounded-lg hover:bg-navy-100 text-red-600"><FileText size={15} /></button>}
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

      <LrBiltyFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingBilty(null); }} bilty={editingBilty} presetTripId={tripFilter || undefined} onSave={async () => { setModalOpen(false); setEditingBilty(null); await loadBilties(); return true; }} />
      <ConfirmDialog open={!!confirmCancel} onClose={() => setConfirmCancel(null)} onConfirm={() => confirmCancel && handleCancel(confirmCancel)} title="Cancel LR/Bilty" message={`Cancel ${confirmCancel?.lr_number}? This is a recorded action and the document will remain in history as cancelled.`} confirmText="Cancel Document" danger />
      {detailBilty && <LrBiltyDetailModal bilty={detailBilty} onClose={() => setDetailBilty(null)} onEdit={() => { setEditingBilty(detailBilty); setDetailBilty(null); setModalOpen(true); }} onPrint={() => { setPrintBilty(detailBilty); setDetailBilty(null); }} onChanged={loadBilties} />}
      {printBilty && <PrintLrBilty bilty={printBilty} onClose={() => setPrintBilty(null)} />}
    </div>
  );
}

// ─── LR Expense sub-form ───────────────────────────────────────────────
interface LrExpenseInput {
  id?: string;
  expense_side: LrExpenseSide;
  description: string;
  amount: number;
  paid_by: PaidByType;
  responsible_party: string;
  payment_status: 'pending' | 'paid';
}

function ExpenseSection({ title, side, expenses, onChange }: { title: string; side: LrExpenseSide; expenses: LrExpenseInput[]; onChange: (expenses: LrExpenseInput[]) => void }) {
  const addExpense = () => onChange([...expenses, { expense_side: side, description: '', amount: 0, paid_by: 'gokul', responsible_party: '', payment_status: 'pending' }]);
  const updateExpense = (idx: number, field: keyof LrExpenseInput, value: string | number) => {
    const updated = [...expenses];
    (updated[idx] as any)[field] = value;
    onChange(updated);
  };
  const removeExpense = (idx: number) => onChange(expenses.filter((_, i) => i !== idx));
  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div className="border border-navy-200 rounded-lg p-4 bg-navy-50/30">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-navy-700">{title}</h4>
        <Button type="button" variant="outline" size="sm" onClick={addExpense}><Plus size={14} /> Add</Button>
      </div>
      {expenses.length === 0 ? (
        <p className="text-xs text-navy-400 py-2">No {title.toLowerCase()} added.</p>
      ) : (
        <div className="space-y-2">
          {expenses.map((e, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-white rounded-lg p-2 border border-navy-100">
              <input type="text" placeholder="Description" value={e.description} onChange={(ev) => updateExpense(idx, 'description', ev.target.value)} className="col-span-12 sm:col-span-4 px-2 py-1.5 text-xs border border-navy-200 rounded outline-none focus:ring-1 focus:ring-navy-300" />
              <input type="number" step="0.01" placeholder="Amount" value={String(e.amount || '')} onChange={(ev) => updateExpense(idx, 'amount', Number(ev.target.value))} className="col-span-6 sm:col-span-2 px-2 py-1.5 text-xs border border-navy-200 rounded outline-none focus:ring-1 focus:ring-navy-300" />
              <select value={e.paid_by} onChange={(ev) => updateExpense(idx, 'paid_by', ev.target.value)} className="col-span-6 sm:col-span-2 px-2 py-1.5 text-xs border border-navy-200 rounded outline-none">
                <option value="gokul">Gokul</option>
                <option value="consignor">Consignor</option>
                <option value="consignee">Consignee</option>
                <option value="other">Other</option>
              </select>
              <input type="text" placeholder="Responsible" value={e.responsible_party} onChange={(ev) => updateExpense(idx, 'responsible_party', ev.target.value)} className="col-span-6 sm:col-span-2 px-2 py-1.5 text-xs border border-navy-200 rounded outline-none focus:ring-1 focus:ring-navy-300" />
              <div className="col-span-4 sm:col-span-1 flex items-center">
                <select value={e.payment_status} onChange={(ev) => updateExpense(idx, 'payment_status', ev.target.value)} className="w-full px-1 py-1.5 text-xs border border-navy-200 rounded outline-none">
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                <button type="button" onClick={() => removeExpense(idx)} className="p-1 rounded text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          <div className="flex justify-between text-xs font-semibold text-navy-700 pt-1">
            <span>Total {title}</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LR/Bilty Form Modal ────────────────────────────────────────────────
function LrBiltyFormModal({ open, onClose, bilty, presetTripId, onSave }: { open: boolean; onClose: () => void; bilty: LrBilty | null; presetTripId?: string; onSave: () => Promise<boolean> }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Partial<LrBilty>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<Trip[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [consignorExpenses, setConsignorExpenses] = useState<LrExpenseInput[]>([]);
  const [consigneeExpenses, setConsigneeExpenses] = useState<LrExpenseInput[]>([]);
  const [useRegisteredVehicle, setUseRegisteredVehicle] = useState(false);
  const [useRegisteredDriver, setUseRegisteredDriver] = useState(false);
  const [tripStops, setTripStops] = useState<TripStop[]>([]);

  useEffect(() => {
    if (!businessId || !open) return;
    Promise.all([
      supabase.from('trips').select('*').eq('business_id', businessId).neq('status', 'cancelled').order('trip_date', { ascending: false }).limit(100),
      supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).order('party_name'),
      supabase.from('vehicles').select('*').eq('business_id', businessId).eq('is_active', true).eq('ownership_type', 'own').order('vehicle_number'),
      supabase.from('drivers').select('*').eq('business_id', businessId).eq('is_active', true).order('driver_name'),
    ]).then(([tripsRes, partiesRes, vehiclesRes, driversRes]) => {
      setTrips((tripsRes.data as Trip[]) ?? []);
      setParties((partiesRes.data as Party[]) ?? []);
      setVehicles((vehiclesRes.data as Vehicle[]) ?? []);
      setDrivers((driversRes.data as Driver[]) ?? []);
    });
  }, [businessId, open]);

  useEffect(() => {
    if (bilty) {
      setFormData(bilty);
      if (bilty.trip_id) {
        supabase.from('trip_stops').select('*').eq('trip_id', bilty.trip_id).order('sequence_no').then(({ data }) => setTripStops((data ?? []) as TripStop[]));
      } else {
        setTripStops([]);
      }
      setUseRegisteredVehicle(!!bilty.transporter_vehicle_id);
      setUseRegisteredDriver(!!bilty.transporter_driver_id);
      // Load existing expenses
      if (businessId) {
        supabase.from('lr_expenses').select('*').eq('lr_bilty_id', bilty.id).eq('is_reversed', false).order('created_at').then(({ data }) => {
          const exps = (data ?? []) as LrExpense[];
          setConsignorExpenses(exps.filter((e) => e.expense_side === 'consignor').map((e) => ({
            id: e.id, expense_side: 'consignor', description: e.description ?? '', amount: Number(e.amount), paid_by: e.paid_by, responsible_party: e.responsible_party ?? '', payment_status: e.payment_status,
          })));
          setConsigneeExpenses(exps.filter((e) => e.expense_side === 'consignee').map((e) => ({
            id: e.id, expense_side: 'consignee', description: e.description ?? '', amount: Number(e.amount), paid_by: e.paid_by, responsible_party: e.responsible_party ?? '', payment_status: e.payment_status,
          })));
        });
      }
    } else {
      setFormData({
        bilty_date: todayISODate(),
        trip_id: presetTripId || null,
        document_status: 'active',
        rate_type: 'fixed',
        rate_value: 0,
        rate_unit: 'kg',
        base_freight: 0,
        additional_amount: 0,
        deduction_amount: 0,
        freight_amount: 0,
        final_amount: 0,
        weight: null,
        journey_direction: 'single',
        freight_payable: 0,
        freight_paid: 0,
        freight_payment_status: 'unpaid',
        commission_applicable: false,
        commission_value: 0,
        commission_amount: 0,
        commission_received: 0,
        commission_status: 'n/a',
      });
      setConsignorExpenses([]);
      setConsigneeExpenses([]);
      setUseRegisteredVehicle(false);
      setUseRegisteredDriver(false);
      setTripStops([]);
    }
    setErrors({});
  }, [bilty, open, presetTripId, businessId]);

  const baseFreight = useMemo(() => calculateBaseFreight(
    (formData.rate_type ?? 'fixed') as RateType,
    Number(formData.rate_value ?? 0),
    Number(formData.weight ?? 0) || null,
    formData.rate_unit ?? 'kg'
  ), [formData.rate_type, formData.rate_value, formData.weight, formData.rate_unit]);

  const finalFreight = useMemo(() => calculateFinalFreight(
    baseFreight, Number(formData.additional_amount ?? 0), Number(formData.deduction_amount ?? 0)
  ), [baseFreight, formData.additional_amount, formData.deduction_amount]);

  const freightBalance = useMemo(() => Number(formData.freight_payable ?? 0) - Number(formData.freight_paid ?? 0), [formData.freight_payable, formData.freight_paid]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      base_freight: baseFreight,
      freight_amount: baseFreight,
      final_amount: finalFreight,
      freight_payable: prev.freight_payable ?? finalFreight,
    }));
  }, [baseFreight, finalFreight]);

  // Auto-calculate commission amount
  const commissionAmount = useMemo(() => {
    if (!formData.commission_applicable) return 0;
    if (formData.commission_type === 'fixed') return Number(formData.commission_value ?? 0);
    if (formData.commission_type === 'percentage') return (Number(formData.final_amount ?? 0) * Number(formData.commission_value ?? 0)) / 100;
    return 0;
  }, [formData.commission_applicable, formData.commission_type, formData.commission_value, formData.final_amount]);

  // Auto-calculate freight payment status
  useEffect(() => {
    const paid = Number(formData.freight_paid ?? 0);
    const payable = Number(formData.freight_payable ?? 0);
    let status: FreightPaymentStatus = 'unpaid';
    if (paid >= payable && payable > 0) status = 'paid';
    else if (paid > 0) status = 'partially_paid';
    setFormData((prev) => ({ ...prev, freight_payment_status: status, commission_amount: commissionAmount }));
  }, [formData.freight_paid, formData.freight_payable, commissionAmount]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.bilty_date) errs.bilty_date = 'Date is required';
    if (Number(formData.final_amount) < 0) errs.final_amount = 'Final amount cannot be negative';
    if (Number(formData.additional_amount) < 0) errs.additional_amount = 'Additional amount cannot be negative';
    if (Number(formData.deduction_amount) < 0) errs.deduction_amount = 'Deduction amount cannot be negative';
    if (Number(formData.freight_paid) > Number(formData.freight_payable)) errs.freight_paid = 'Paid amount cannot exceed freight payable';
    if (formData.rate_type !== 'fixed' && (!Number(formData.weight) || Number(formData.weight) <= 0)) errs.weight = 'Weight is required for per-kg/quintal/ton rates';
    if (formData.rate_type !== 'fixed' && (!Number(formData.rate_value) || Number(formData.rate_value) <= 0)) errs.rate_value = 'Rate is required for weight-based calculation';
    if (formData.commission_applicable && !formData.commission_type) errs.commission_type = 'Select commission type';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!validate() || !businessId) return;
    setSaving(true);
    try {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value === '' || value === undefined) continue;
        cleaned[key] = value;
      }
      cleaned.business_id = businessId;
      cleaned.base_freight = baseFreight;
      cleaned.freight_amount = baseFreight;
      cleaned.final_amount = finalFreight;
      cleaned.commission_amount = commissionAmount;
      if (!cleaned.trip_id) cleaned.trip_id = null;
      if (!useRegisteredVehicle) { cleaned.transporter_vehicle_id = null; }
      if (!useRegisteredDriver) { cleaned.transporter_driver_id = null; }

      let lrId: string;

      if (bilty) {
        const { error } = await supabase.from('lr_bilties').update({ ...cleaned, updated_at: new Date().toISOString() }).eq('id', bilty.id);
        if (error) throw error;
        lrId = bilty.id;
        await logAudit(businessId, user?.id ?? null, 'lr_update', 'lr_bilty', lrId, { lr_number: bilty.lr_number });
        showToast('LR/bilty updated');
      } else {
        const { data: seqResult, error: seqError } = await supabase.rpc('get_next_document_number', { b_id: businessId, p_doc_type: 'lr' });
        if (seqError) throw seqError;
        const lrNumber = seqResult as string;
        cleaned.lr_number = lrNumber;
        const { data: newLr, error } = await supabase.from('lr_bilties').insert(cleaned).select('*').maybeSingle();
        if (error) throw error;
        lrId = newLr.id;
        await logAudit(businessId, user?.id ?? null, 'lr_create', 'lr_bilty', lrId, { lr_number: lrNumber });
        showToast(`LR ${lrNumber} created`);
      }

      // Sync expenses — delete old, insert new (avoids duplicates)
      await supabase.from('lr_expenses').delete().eq('lr_bilty_id', lrId);
      const allExpenses = [...consignorExpenses, ...consigneeExpenses].filter((e) => Number(e.amount) > 0 || e.description.trim());
      if (allExpenses.length > 0) {
        await supabase.from('lr_expenses').insert(allExpenses.map((e) => ({
          business_id: businessId,
          lr_bilty_id: lrId,
          expense_side: e.expense_side,
          description: e.description || null,
          amount: Number(e.amount),
          paid_by: e.paid_by,
          responsible_party: e.responsible_party || null,
          payment_status: e.payment_status,
          created_by: user?.id ?? null,
        })));
      }

      await onSave();
    } catch (err: any) { showToast(err.message ?? 'Failed to save', 'error'); setSaving(false); return; }
    setSaving(false);
  };

  const calcLabel = useMemo(() => {
    const rt = formData.rate_type ?? 'fixed';
    const w = Number(formData.weight ?? 0);
    const r = Number(formData.rate_value ?? 0);
    if (rt === 'fixed') return 'Fixed trip rate';
    const unit = formData.rate_unit ?? 'kg';
    const wInUnit = rt === 'per_kg' ? w : rt === 'per_quintal' ? (unit === 'kg' ? w / 100 : unit === 'ton' ? w * 10 : w) : (unit === 'kg' ? w / 1000 : unit === 'quintal' ? w / 10 : w);
    return `${wInUnit.toFixed(2)} ${rt.replace('per_', '')} × ${formatCurrency(r)} = ${formatCurrency(baseFreight)}`;
  }, [formData.rate_type, formData.weight, formData.rate_value, formData.rate_unit, baseFreight]);

  return (
    <Modal open={open} onClose={onClose} title={bilty ? `Edit ${bilty.lr_number}` : 'New LR/Bilty'} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Bilty Date" type="date" required error={errors.bilty_date} value={formData.bilty_date ?? ''} onChange={(e) => setFormData({ ...formData, bilty_date: e.target.value })} />
          <Select label="Link to Trip (optional)" value={formData.trip_id ?? ''} onChange={(e) => {
            const tid = e.target.value || null;
            setFormData({ ...formData, trip_id: tid, loading_stop_id: null, unloading_stop_id: null });
            if (tid) {
              supabase.from('trip_stops').select('*').eq('trip_id', tid).order('sequence_no').then(({ data }) => setTripStops((data ?? []) as TripStop[]));
            } else {
              setTripStops([]);
            }
          }}>
            <option value="">— Standalone (no trip) —</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.trip_number} — {formatDate(t.trip_date)} ({t.origin} → {t.destination})</option>)}
          </Select>
          <Select label="Journey Direction" value={formData.journey_direction ?? 'single'} onChange={(e) => setFormData({ ...formData, journey_direction: e.target.value as JourneyDirection })}>
            <option value="single">Single</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
            <option value="return">Return</option>
          </Select>
        </div>

        {/* Consignor & Consignee */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Consignor" value={formData.consignor_party_id ?? ''} onChange={(e) => setFormData({ ...formData, consignor_party_id: e.target.value || null })}>
            <option value="">Select consignor...</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
          </Select>
          <Select label="Consignee" value={formData.consignee_party_id ?? ''} onChange={(e) => setFormData({ ...formData, consignee_party_id: e.target.value || null })}>
            <option value="">Select consignee...</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Loading Point" value={formData.loading_point ?? ''} onChange={(e) => setFormData({ ...formData, loading_point: e.target.value })} />
          <Input label="Delivery Point" value={formData.delivery_point ?? ''} onChange={(e) => setFormData({ ...formData, delivery_point: e.target.value })} />
        </div>

        {/* Stop selectors — only when linked trip has stops */}
        {tripStops.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-navy-50/50 rounded-lg p-3 border border-navy-100">
            <Select label="Loading Stop (from trip route)" value={formData.loading_stop_id ?? ''} onChange={(e) => {
              const stop = tripStops.find((s) => s.id === e.target.value);
              setFormData({ ...formData, loading_stop_id: e.target.value || null, loading_point: stop?.location ?? formData.loading_point });
            }}>
              <option value="">— None —</option>
              {tripStops.map((s) => <option key={s.id} value={s.id}>#{s.sequence_no} {s.location} ({s.stop_type})</option>)}
            </Select>
            <Select label="Unloading Stop (from trip route)" value={formData.unloading_stop_id ?? ''} onChange={(e) => {
              const stop = tripStops.find((s) => s.id === e.target.value);
              setFormData({ ...formData, unloading_stop_id: e.target.value || null, delivery_point: stop?.location ?? formData.delivery_point });
            }}>
              <option value="">— None —</option>
              {tripStops.map((s) => <option key={s.id} value={s.id}>#{s.sequence_no} {s.location} ({s.stop_type})</option>)}
            </Select>
            <p className="sm:col-span-2 text-xs text-navy-400">Assign this load's pickup and drop-off stops. A load doesn't have to start at the first stop or end at the last stop.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Goods Description" value={formData.goods_description ?? ''} onChange={(e) => setFormData({ ...formData, goods_description: e.target.value })} placeholder="Cement, Steel, etc." />
          <Input label="Quantity" type="number" step="0.01" value={String(formData.quantity ?? '')} onChange={(e) => setFormData({ ...formData, quantity: e.target.value ? Number(e.target.value) : null })} />
          <Input label="Weight" type="number" step="0.01" error={errors.weight} value={String(formData.weight ?? '')} onChange={(e) => setFormData({ ...formData, weight: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 5000" />
        </div>

        {/* Consignor Expenses */}
        <div>
          <h3 className="text-sm font-semibold text-navy-700 mb-2 flex items-center gap-2"><ArrowUpDown size={14} /> Consignor Expenses</h3>
          <ExpenseSection title="Consignor Expenses" side="consignor" expenses={consignorExpenses} onChange={setConsignorExpenses} />
        </div>

        {/* Consignee Expenses */}
        <div>
          <h3 className="text-sm font-semibold text-navy-700 mb-2 flex items-center gap-2"><ArrowUpDown size={14} /> Consignee Expenses</h3>
          <ExpenseSection title="Consignee Expenses" side="consignee" expenses={consigneeExpenses} onChange={setConsigneeExpenses} />
        </div>

        {/* Freight Calculation */}
        <div className="border-t border-navy-100 pt-4">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Freight Calculation</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Rate Type" value={formData.rate_type ?? 'fixed'} onChange={(e) => setFormData({ ...formData, rate_type: e.target.value as RateType })}>
              <option value="fixed">Fixed Trip Rate</option>
              <option value="per_kg">Per Kg Rate</option>
              <option value="per_quintal">Per Quintal Rate</option>
              <option value="per_ton">Per Tonne Rate</option>
            </Select>
            {formData.rate_type !== 'fixed' && (
              <Select label="Weight Unit" value={formData.rate_unit ?? 'kg'} onChange={(e) => setFormData({ ...formData, rate_unit: e.target.value })}>
                <option value="kg">Kilograms (kg)</option>
                <option value="quintal">Quintal</option>
                <option value="ton">Tonne</option>
              </Select>
            )}
            <Input label="Rate Value (₹)" type="number" step="0.01" error={errors.rate_value} value={String(formData.rate_value ?? 0)} onChange={(e) => setFormData({ ...formData, rate_value: Number(e.target.value) })} placeholder={formData.rate_type === 'fixed' ? 'Fixed amount' : '₹ per unit'} />
          </div>
          <div className="mt-3 px-3 py-2 bg-navy-50 rounded-lg text-sm">
            <p className="text-navy-600">Base Freight: <span className="font-bold text-navy-800">{formatCurrency(baseFreight)}</span></p>
            <p className="text-xs text-navy-400">{calcLabel}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <Input label="Additional Amount (+) (₹)" type="number" step="0.01" error={errors.additional_amount} value={String(formData.additional_amount ?? 0)} onChange={(e) => setFormData({ ...formData, additional_amount: Number(e.target.value) })} />
            <Input label="Deduction Amount (-) (₹)" type="number" step="0.01" error={errors.deduction_amount} value={String(formData.deduction_amount ?? 0)} onChange={(e) => setFormData({ ...formData, deduction_amount: Number(e.target.value) })} />
          </div>
          <Input label="Reason for Additions/Deductions" value={formData.adjustment_reason ?? ''} onChange={(e) => setFormData({ ...formData, adjustment_reason: e.target.value })} placeholder="e.g. Detention charges, short delivery" />

          <div className="mt-3 px-3 py-3 bg-navy-100 rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold text-navy-700">Final Freight Amount</span>
              <span className="text-lg font-bold text-navy-900">{formatCurrency(finalFreight)}</span>
            </div>
            <p className="text-xs text-navy-400 mt-1">= Base {formatCurrency(baseFreight)} + Additions {formatCurrency(Number(formData.additional_amount ?? 0))} − Deductions {formatCurrency(Number(formData.deduction_amount ?? 0))}</p>
          </div>
        </div>

        {/* Transporter / Freight Payable */}
        <div className="border-t border-navy-100 pt-4">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Transporter / Freight Payable</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Transporter Name" value={formData.transporter_name ?? ''} onChange={(e) => setFormData({ ...formData, transporter_name: e.target.value })} placeholder="Transporter / owner name" />
            <Input label="Transporter Vehicle Number" value={formData.transporter_vehicle_number ?? ''} onChange={(e) => setFormData({ ...formData, transporter_vehicle_number: e.target.value })} placeholder="MH01AB1234" />
            <Input label="Vehicle Name/Type (optional)" value={formData.transporter_vehicle_name ?? ''} onChange={(e) => setFormData({ ...formData, transporter_vehicle_name: e.target.value })} placeholder="Truck, Container, etc." />
            <Input label="Driver Name" value={formData.transporter_driver_name ?? ''} onChange={(e) => setFormData({ ...formData, transporter_driver_name: e.target.value })} placeholder="Driver name" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-navy-600">
                <input type="checkbox" checked={useRegisteredVehicle} onChange={(e) => setUseRegisteredVehicle(e.target.checked)} className="w-3.5 h-3.5 rounded border-navy-300" />
                Select from own fleet vehicles
              </label>
              <label className="flex items-center gap-2 text-xs text-navy-600">
                <input type="checkbox" checked={useRegisteredDriver} onChange={(e) => setUseRegisteredDriver(e.target.checked)} className="w-3.5 h-3.5 rounded border-navy-300" />
                Select from registered drivers
              </label>
            </div>
            {useRegisteredVehicle && (
              <Select label="Own Fleet Vehicle" value={formData.transporter_vehicle_id ?? ''} onChange={(e) => {
                const v = vehicles.find((v) => v.id === e.target.value);
                setFormData({ ...formData, transporter_vehicle_id: e.target.value || null, transporter_vehicle_number: v?.vehicle_number ?? formData.transporter_vehicle_number, transporter_vehicle_name: v?.vehicle_category ?? formData.transporter_vehicle_name });
              }}>
                <option value="">Select vehicle...</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_number}</option>)}
              </Select>
            )}
            {useRegisteredDriver && (
              <Select label="Registered Driver" value={formData.transporter_driver_id ?? ''} onChange={(e) => {
                const d = drivers.find((d) => d.id === e.target.value);
                setFormData({ ...formData, transporter_driver_id: e.target.value || null, transporter_driver_name: d?.driver_name ?? formData.transporter_driver_name });
              }}>
                <option value="">Select driver...</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
              </Select>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            <Input label="Freight Payable to Transporter (₹)" type="number" step="0.01" value={String(formData.freight_payable ?? 0)} onChange={(e) => setFormData({ ...formData, freight_payable: Number(e.target.value) })} />
            <Input label="Freight Already Paid/Advanced (₹)" type="number" step="0.01" error={errors.freight_paid} value={String(formData.freight_paid ?? 0)} onChange={(e) => setFormData({ ...formData, freight_paid: Number(e.target.value) })} />
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1.5">Remaining Balance</label>
              <div className={cn('px-3 py-2 rounded-lg text-sm font-bold', freightBalance > 0 ? 'text-orange-700 bg-orange-50' : 'text-green-700 bg-green-50')}>
                {formatCurrency(freightBalance)}
              </div>
              <p className="text-xs text-navy-400 mt-1">Status: <Badge color={formData.freight_payment_status === 'paid' ? 'green' : formData.freight_payment_status === 'partially_paid' ? 'orange' : 'gray'}>{formData.freight_payment_status}</Badge></p>
            </div>
          </div>
        </div>

        {/* Commission */}
        <div className="border-t border-navy-100 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <input type="checkbox" id="commission_applicable" checked={formData.commission_applicable ?? false} onChange={(e) => setFormData({ ...formData, commission_applicable: e.target.checked, commission_status: e.target.checked ? 'pending' : 'n/a', commission_type: e.target.checked ? formData.commission_type : null })} className="w-4 h-4 rounded border-navy-300" />
            <label htmlFor="commission_applicable" className="text-sm font-semibold text-navy-700">Commission applicable (when consignee pays driver directly)</label>
          </div>
          {formData.commission_applicable && (
            <div className="space-y-3 pl-6 border-l-2 border-navy-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select label="Commission Type" error={errors.commission_type ? '' : undefined} value={formData.commission_type ?? ''} onChange={(e) => setFormData({ ...formData, commission_type: e.target.value as CommissionType || null })}>
                  <option value="">Select...</option>
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage</option>
                </Select>
                <Input label="Commission Value (₹ or %)" type="number" step="0.01" value={String(formData.commission_value ?? 0)} onChange={(e) => setFormData({ ...formData, commission_value: Number(e.target.value) })} />
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Commission Amount</label>
                  <div className="px-3 py-2 bg-navy-50 rounded-lg text-sm font-bold text-navy-800">{formatCurrency(commissionAmount)}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input label="Commission Received (₹)" type="number" step="0.01" value={String(formData.commission_received ?? 0)} onChange={(e) => {
                  const received = Number(e.target.value);
                  let status: CommissionStatus = 'pending';
                  if (received >= commissionAmount && commissionAmount > 0) status = 'received';
                  else if (received > 0) status = 'partial';
                  setFormData({ ...formData, commission_received: received, commission_status: status });
                }} />
                <Input label="Commission Date" type="date" value={formData.commission_date ?? ''} onChange={(e) => setFormData({ ...formData, commission_date: e.target.value || null })} />
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Status</label>
                  <div className="py-2"><Badge color={formData.commission_status === 'received' ? 'green' : formData.commission_status === 'partial' ? 'orange' : 'gray'}>{formData.commission_status}</Badge></div>
                </div>
              </div>
              <Input label="Commission Notes" value={formData.commission_notes ?? ''} onChange={(e) => setFormData({ ...formData, commission_notes: e.target.value })} />
            </div>
          )}
        </div>

        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{bilty ? 'Update' : 'Create LR/Bilty'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── LR/Bilty Detail Modal (Short Journey Summary) ──────────────────────
function LrBiltyDetailModal({ bilty, onClose, onEdit, onPrint, onChanged }: { bilty: LrBilty; onClose: () => void; onEdit: () => void; onPrint: () => void; onChanged: () => void }) {
  const { business, settings } = useAuth();
  const [expenses, setExpenses] = useState<LrExpense[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [consignor, setConsignor] = useState<Party | null>(null);
  const [consignee, setConsignee] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('lr_expenses').select('*').eq('lr_bilty_id', bilty.id).eq('is_reversed', false).order('created_at'),
      bilty.trip_id ? supabase.from('trips').select('*').eq('id', bilty.trip_id).maybeSingle() : Promise.resolve({ data: null }),
      bilty.consignor_party_id ? supabase.from('parties').select('*').eq('id', bilty.consignor_party_id).maybeSingle() : Promise.resolve({ data: null }),
      bilty.consignee_party_id ? supabase.from('parties').select('*').eq('id', bilty.consignee_party_id).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([expRes, tripRes, conRes, ceeRes]) => {
      setExpenses((expRes.data ?? []) as LrExpense[]);
      setTrip(tripRes.data as Trip | null);
      setConsignor(conRes.data as Party | null);
      setConsignee(ceeRes.data as Party | null);
      setLoading(false);
    });
  }, [bilty]);

  const consignorExpenses = expenses.filter((e) => e.expense_side === 'consignor');
  const consigneeExpenses = expenses.filter((e) => e.expense_side === 'consignee');
  const consignorTotal = consignorExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const consigneeTotal = consigneeExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const freightBalance = Number(bilty.freight_payable) - Number(bilty.freight_paid);
  const commissionBalance = Number(bilty.commission_amount) - Number(bilty.commission_received);

  return (
    <Modal open={true} onClose={onClose} title={`LR ${bilty.lr_number} — Journey Summary`} size="xl">
      {loading ? <LoadingSpinner /> : (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between bg-navy-50 rounded-lg p-4">
            <div>
              <h3 className="text-lg font-bold text-navy-800">{business?.business_name ?? settings?.business_name ?? 'Gokul Cargo Movers'}</h3>
              <p className="text-sm text-navy-500">LR No: {bilty.lr_number} · Date: {formatDate(bilty.bilty_date)}</p>
            </div>
            <div className="flex gap-2">
              <Badge color={bilty.journey_direction === 'return' ? 'orange' : 'green'}>{DIRECTION_LABELS[bilty.journey_direction ?? 'single']}</Badge>
              <StatusBadge status={bilty.document_status} />
            </div>
          </div>

          {/* Route & Parties */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="text-xs font-semibold text-navy-400 uppercase mb-2">Route</h4>
              <p className="text-sm text-navy-700"><span className="text-navy-400">From:</span> {bilty.loading_point ?? trip?.origin ?? '—'}</p>
              <p className="text-sm text-navy-700"><span className="text-navy-400">To:</span> {bilty.delivery_point ?? trip?.destination ?? '—'}</p>
              {trip && <p className="text-sm text-navy-700 mt-2"><span className="text-navy-400">Trip:</span> <Link to={`/trips/${trip.id}`} className="text-navy-600 hover:underline">{trip.trip_number}</Link></p>}
            </Card>
            <Card className="p-4">
              <h4 className="text-xs font-semibold text-navy-400 uppercase mb-2">Parties</h4>
              <p className="text-sm text-navy-700"><span className="text-navy-400">Consignor:</span> {consignor?.party_name ?? '—'}</p>
              <p className="text-sm text-navy-700"><span className="text-navy-400">Consignee:</span> {consignee?.party_name ?? '—'}</p>
              <p className="text-sm text-navy-700 mt-2"><span className="text-navy-400">Goods:</span> {bilty.goods_description ?? '—'} · {bilty.weight ? `${bilty.weight} ${bilty.rate_unit}` : bilty.quantity ?? '—'}</p>
            </Card>
          </div>

          {/* Transporter */}
          <Card className="p-4">
            <h4 className="text-xs font-semibold text-navy-400 uppercase mb-2">Transporter / Vehicle</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-navy-400 text-xs">Transporter</p><p className="font-medium text-navy-800">{bilty.transporter_name ?? '—'}</p></div>
              <div><p className="text-navy-400 text-xs">Vehicle No.</p><p className="font-medium text-navy-800">{bilty.transporter_vehicle_number ?? '—'}</p></div>
              <div><p className="text-navy-400 text-xs">Driver</p><p className="font-medium text-navy-800">{bilty.transporter_driver_name ?? '—'}</p></div>
              <div><p className="text-navy-400 text-xs">Vehicle Type</p><p className="font-medium text-navy-800">{bilty.transporter_vehicle_name ?? '—'}</p></div>
            </div>
          </Card>

          {/* Financial Summary — separate categories */}
          <Card className="p-4">
            <h4 className="text-xs font-semibold text-navy-400 uppercase mb-3">Financial Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-navy-50 pb-2">
                <span className="text-navy-600 font-medium">Customer Freight (final)</span>
                <span className="font-bold text-navy-800">{formatCurrency(bilty.final_amount || bilty.freight_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Consignor Expenses ({consignorExpenses.length})</span>
                <span className="text-orange-700">{formatCurrency(consignorTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Consignee Expenses ({consigneeExpenses.length})</span>
                <span className="text-orange-700">{formatCurrency(consigneeTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-navy-100 pt-2">
                <span className="text-navy-600 font-medium">Freight Payable to Transporter</span>
                <span className="text-navy-800">{formatCurrency(Number(bilty.freight_payable))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Freight Paid/Advanced</span>
                <span className="text-green-700">{formatCurrency(Number(bilty.freight_paid))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Freight Balance</span>
                <span className={freightBalance > 0 ? 'text-orange-700 font-semibold' : 'text-green-700 font-semibold'}>{formatCurrency(freightBalance)}</span>
              </div>
              {bilty.commission_applicable && (
                <>
                  <div className="flex justify-between border-t border-navy-100 pt-2">
                    <span className="text-navy-600 font-medium">Commission Amount</span>
                    <span className="text-navy-800">{formatCurrency(Number(bilty.commission_amount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-500">Commission Received</span>
                    <span className="text-green-700">{formatCurrency(Number(bilty.commission_received))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-500">Commission Pending</span>
                    <span className={commissionBalance > 0 ? 'text-orange-700 font-semibold' : 'text-green-700 font-semibold'}>{formatCurrency(commissionBalance)}</span>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-navy-300 mt-3">Customer freight, transporter freight, expenses, and commission are tracked separately.</p>
          </Card>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button variant="outline" onClick={onPrint}><Printer size={16} /> Print</Button>
            <Button onClick={onEdit}><Edit2 size={16} /> Edit</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Print LR/Bilty ─────────────────────────────────────────────────────
function PrintLrBilty({ bilty, onClose }: { bilty: LrBilty; onClose: () => void }) {
  const { business, settings } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [consignor, setConsignor] = useState<Party | null>(null);
  const [consignee, setConsignee] = useState<Party | null>(null);
  const [expenses, setExpenses] = useState<LrExpense[]>([]);

  useEffect(() => {
    if (bilty.trip_id) supabase.from('trips').select('*').eq('id', bilty.trip_id).maybeSingle().then(({ data }) => setTrip(data as Trip | null));
    if (bilty.consignor_party_id) supabase.from('parties').select('*').eq('id', bilty.consignor_party_id).maybeSingle().then(({ data }) => setConsignor(data as Party | null));
    if (bilty.consignee_party_id) supabase.from('parties').select('*').eq('id', bilty.consignee_party_id).maybeSingle().then(({ data }) => setConsignee(data as Party | null));
    supabase.from('lr_expenses').select('*').eq('lr_bilty_id', bilty.id).eq('is_reversed', false).order('created_at').then(({ data }) => setExpenses((data ?? []) as LrExpense[]));
  }, [bilty]);

  const consignorExp = expenses.filter((e) => e.expense_side === 'consignor');
  const consigneeExp = expenses.filter((e) => e.expense_side === 'consignee');

  return (
    <Modal open={true} onClose={onClose} title={`Print ${bilty.lr_number}`} size="lg">
      <div className="print-container border border-navy-200 rounded-lg p-8 bg-white" id="print-area">
        <div className="flex items-start justify-between border-b-2 border-navy-800 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-navy-800">{business?.business_name ?? settings?.business_name ?? 'Gokul Cargo Movers'}</h1>
            <p className="text-sm text-navy-600">{settings?.address ?? business?.address ?? ''}</p>
            <p className="text-sm text-navy-600">Phone: {settings?.phone ?? business?.phone ?? ''} {settings?.email ? `· Email: ${settings.email}` : ''}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-navy-700">Lorry Receipt</h2>
            <p className="text-sm font-semibold">LR No: {bilty.lr_number}</p>
            <p className="text-sm">Date: {formatDate(bilty.bilty_date)}</p>
            <p className="text-sm">Direction: {DIRECTION_LABELS[bilty.journey_direction ?? 'single']}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div className="border border-navy-200 rounded p-3">
            <p className="font-semibold text-navy-700 mb-1">Consignor</p>
            <p>{consignor?.party_name ?? '—'}</p>
            <p className="text-navy-500">{consignor?.address ?? ''}</p>
            <p className="text-navy-500">{consignor?.phone ?? ''}</p>
          </div>
          <div className="border border-navy-200 rounded p-3">
            <p className="font-semibold text-navy-700 mb-1">Consignee</p>
            <p>{consignee?.party_name ?? '—'}</p>
            <p className="text-navy-500">{consignee?.address ?? ''}</p>
            <p className="text-navy-500">{consignee?.phone ?? ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div><p className="text-navy-400">Loading Point</p><p className="font-medium">{bilty.loading_point ?? trip?.origin ?? '—'}</p></div>
          <div><p className="text-navy-400">Delivery Point</p><p className="font-medium">{bilty.delivery_point ?? trip?.destination ?? '—'}</p></div>
          <div><p className="text-navy-400">Trip Number</p><p className="font-medium">{trip?.trip_number ?? 'Standalone'}</p></div>
        </div>
        {/* Transporter section */}
        <div className="border border-navy-200 rounded p-3 mb-6 text-sm">
          <p className="font-semibold text-navy-700 mb-1">Transporter / Vehicle</p>
          <div className="grid grid-cols-4 gap-2">
            <div><p className="text-navy-400 text-xs">Transporter</p><p>{bilty.transporter_name ?? '—'}</p></div>
            <div><p className="text-navy-400 text-xs">Vehicle No.</p><p>{bilty.transporter_vehicle_number ?? '—'}</p></div>
            <div><p className="text-navy-400 text-xs">Driver</p><p>{bilty.transporter_driver_name ?? '—'}</p></div>
            <div><p className="text-navy-400 text-xs">Type</p><p>{bilty.transporter_vehicle_name ?? '—'}</p></div>
          </div>
        </div>
        <table className="w-full text-sm border border-navy-200 mb-6">
          <thead className="bg-navy-50"><tr><th className="text-left p-2">Goods Description</th><th className="text-right p-2">Quantity</th><th className="text-right p-2">Weight</th><th className="text-right p-2">Base Freight</th></tr></thead>
          <tbody><tr className="border-t border-navy-100"><td className="p-2">{bilty.goods_description ?? '—'}</td><td className="p-2 text-right">{bilty.quantity ?? '—'}</td><td className="p-2 text-right">{bilty.weight ?? '—'} {bilty.rate_unit}</td><td className="p-2 text-right font-semibold">{formatCurrency(bilty.base_freight)}</td></tr></tbody>
        </table>
        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div className="space-y-1">
            {Number(bilty.additional_amount) > 0 && <div className="flex justify-between"><span>Additions:</span><span className="font-medium">+{formatCurrency(Number(bilty.additional_amount))}</span></div>}
            {Number(bilty.deduction_amount) > 0 && <div className="flex justify-between"><span>Deductions:</span><span className="font-medium">-{formatCurrency(Number(bilty.deduction_amount))}</span></div>}
            {bilty.adjustment_reason && <p className="text-xs text-navy-400">Reason: {bilty.adjustment_reason}</p>}
            {consignorExp.length > 0 && (
              <div className="mt-2 pt-2 border-t border-navy-100">
                <p className="text-xs font-semibold text-navy-600">Consignor Expenses</p>
                {consignorExp.map((e, i) => <div key={i} className="flex justify-between text-xs"><span>{e.description ?? '—'}</span><span>{formatCurrency(Number(e.amount))}</span></div>)}
              </div>
            )}
            {consigneeExp.length > 0 && (
              <div className="mt-2 pt-2 border-t border-navy-100">
                <p className="text-xs font-semibold text-navy-600">Consignee Expenses</p>
                {consigneeExp.map((e, i) => <div key={i} className="flex justify-between text-xs"><span>{e.description ?? '—'}</span><span>{formatCurrency(Number(e.amount))}</span></div>)}
              </div>
            )}
          </div>
          <div className="border border-navy-200 rounded p-3 text-right space-y-1">
            <p className="text-navy-400 text-xs">Final Freight Amount</p>
            <p className="text-xl font-bold text-navy-800">{formatCurrency(bilty.final_amount || bilty.freight_amount)}</p>
            {Number(bilty.freight_payable) > 0 && (
              <>
                <p className="text-navy-400 text-xs mt-2">Freight Payable: {formatCurrency(Number(bilty.freight_payable))}</p>
                <p className="text-navy-400 text-xs">Paid: {formatCurrency(Number(bilty.freight_paid))}</p>
                <p className="text-navy-400 text-xs">Balance: {formatCurrency(Number(bilty.freight_payable) - Number(bilty.freight_paid))}</p>
              </>
            )}
            {bilty.commission_applicable && (
              <p className="text-navy-400 text-xs mt-2">Commission: {formatCurrency(Number(bilty.commission_amount))} ({bilty.commission_status})</p>
            )}
          </div>
        </div>
        <div className="flex justify-between items-end mt-8">
          <div className="text-xs text-navy-400"><p>This is a transport document, not a GST tax invoice.</p>{bilty.notes && <p className="mt-2">Notes: {bilty.notes}</p>}</div>
          <div className="text-center"><div className="border-t border-navy-300 w-40 mt-12 pt-1 text-xs text-navy-500">Authorized Signature</div></div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4 no-print">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={() => window.print()}><Printer size={16} /> Print</Button>
      </div>
    </Modal>
  );
}
