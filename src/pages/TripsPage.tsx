import { useState, useEffect, useCallback, FormEvent, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry } from '@/lib/audit';
import { Trip, TripStop, Party, Vehicle, Driver, Route, TripStatus, RateType, JourneyDirection, JourneyType, FreightPaymentStatus, CommissionType, CommissionStatus, StopType, StopStatus } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate, calculateCustomerFreight, todayISODate, cn } from '@/lib/format';
import { Package, Plus, Search, Edit2, Eye, X, Printer, Receipt, Truck, ArrowLeftRight, ArrowUpDown, Wallet, FileText, ChevronDown, ChevronUp, MapPin, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

const PAGE_SIZE = 15;

const STATUS_FLOW: Record<TripStatus, TripStatus[]> = {
  draft: ['booked', 'cancelled'],
  booked: ['in_transit', 'delivered', 'completed', 'cancelled'],
  in_transit: ['delivered', 'completed', 'cancelled'],
  delivered: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_LABELS: Record<TripStatus, string> = {
  draft: 'Draft', booked: 'Booked', in_transit: 'In Transit', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
};

const DIRECTION_LABELS: Record<JourneyDirection, string> = {
  up: 'Up / Outward', down: 'Down / Return', return: 'Return Leg', single: 'Single',
};

const JOURNEY_TYPE_LABELS: Record<JourneyType, string> = {
  single: 'Single Journey', multi_stop: 'Multi-Stop Journey', round_trip: 'Round Trip',
};

const STOP_TYPE_LABELS: Record<StopType, string> = {
  loading: 'Loading', unloading: 'Unloading', both: 'Both', intermediate: 'Intermediate',
};

const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  planned: 'Planned', arrived: 'Arrived', completed: 'Completed', skipped: 'Skipped',
};

export function TripsPage() {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState(searchParams.get('vehicle') ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

  const loadTrips = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    let query = supabase.from('trips').select('*, party:parties!party_id(*), vehicle:vehicles(*), driver:drivers(*), route:routes(*), truck_owner_party:parties!truck_owner_party_id(*)', { count: 'exact' }).eq('business_id', businessId);
    if (search) query = query.or(`trip_number.ilike.%${search}%,origin.ilike.%${search}%,destination.ilike.%${search}%`);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (directionFilter) query = query.eq('journey_direction', directionFilter);
    if (vehicleFilter) query = query.eq('vehicle_id', vehicleFilter);
    if (dateFrom) query = query.gte('trip_date', dateFrom);
    if (dateTo) query = query.lte('trip_date', dateTo);
    const { data, error, count } = await query.order('trip_date', { ascending: false }).order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { setLoadError(error.message); showToast('Failed to load trips', 'error'); setLoading(false); return; }
    setTrips((data ?? []) as Trip[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setLoading(false);
  }, [businessId, search, statusFilter, directionFilter, vehicleFilter, dateFrom, dateTo, page, showToast]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  return (
    <div>
      <PageHeader title="Trips" subtitle="Manage transport journeys — each trip is one journey leg" actions={<Button onClick={() => { setEditingTrip(null); setModalOpen(true); }}><Plus size={16} /> New Trip</Button>} />

      <Card className="p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder="Search by trip no, origin, destination..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={directionFilter} onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Directions</option>
            <option value="up">Up / Outward</option>
            <option value="down">Down / Return</option>
            <option value="return">Return Leg</option>
            <option value="single">Single</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
          {(search || statusFilter || directionFilter || vehicleFilter || dateFrom || dateTo) && (
            <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter(''); setDirectionFilter(''); setVehicleFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}><X size={16} /> Clear</Button>
          )}
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : loadError ? (
        <Card><EmptyState icon={<Package size={48} />} title="Failed to load trips" message={loadError} action={<Button onClick={() => loadTrips()}>Retry</Button>} /></Card>
      ) : trips.length === 0 ? (
        <Card><EmptyState icon={<Package size={48} />} title="No trips found" message="Create your first journey to start managing transport operations." action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New Trip</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Trip No.</th>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Dir</th>
                  <th className="text-left px-4 py-3 font-semibold">Route</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Vehicle</th>
                  <th className="text-right px-4 py-3 font-semibold">Cust. Freight</th>
                  <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Transp. Payable</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {trips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-navy-50/50 cursor-pointer" onClick={() => navigate(`/trips/${trip.id}`)}>
                    <td className="px-4 py-3 font-medium text-navy-800">{trip.trip_number}</td>
                    <td className="px-4 py-3 text-navy-600">{formatDate(trip.trip_date)}</td>
                    <td className="px-4 py-3 hidden md:table-cell"><Badge color={trip.journey_direction === 'return' || trip.journey_direction === 'down' ? 'orange' : 'green'}>{DIRECTION_LABELS[trip.journey_direction ?? 'single']?.split(' / ')[0] ?? 'Single'}</Badge></td>
                    <td className="px-4 py-3 text-navy-600">{trip.origin} → {trip.destination}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{trip.vehicle?.vehicle_number ?? trip.transporter_vehicle_number ?? trip.market_vehicle_number ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-navy-800">{formatCurrency(trip.customer_freight)}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-medium text-navy-600">{formatCurrency(trip.freight_payable)}</td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}><StatusBadge status={trip.status} /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => navigate(`/trips/${trip.id}`)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Eye size={15} /></button>
                        {trip.status !== 'completed' && trip.status !== 'cancelled' && <button onClick={() => { setEditingTrip(trip); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button>}
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

      <TripFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingTrip(null); }} trip={editingTrip} onSave={() => { setModalOpen(false); setEditingTrip(null); loadTrips(); }} />
    </div>
  );
}

// ─── Trip Form Modal — Section-based journey form ───────────────────────
function TripFormModal({ open, onClose, trip, onSave }: { open: boolean; onClose: () => void; trip: Trip | null; onSave: () => void }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Partial<Trip>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [parties, setParties] = useState<Party[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [returnableTrips, setReturnableTrips] = useState<Trip[]>([]);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (!businessId || !open) return;
    Promise.all([
      supabase.from('parties').select('*').eq('business_id', businessId).eq('is_active', true).order('party_name'),
      supabase.from('vehicles').select('*').eq('business_id', businessId).eq('is_active', true).eq('ownership_type', 'own').order('vehicle_number'),
      supabase.from('drivers').select('*').eq('business_id', businessId).eq('is_active', true).order('driver_name'),
      supabase.from('routes').select('*').eq('business_id', businessId).eq('is_active', true).order('origin'),
      supabase.from('trips').select('id, trip_number, trip_date, origin, destination').eq('business_id', businessId).neq('status', 'cancelled').neq('status', 'completed').order('trip_date', { ascending: false }).limit(200),
    ]).then(([pRes, vRes, dRes, rRes, retRes]) => {
      // (stops for an editing trip are loaded in the trip-effect below)
      setParties(pRes.data as Party[] ?? []);
      setVehicles(vRes.data as Vehicle[] ?? []);
      setDrivers(dRes.data as Driver[] ?? []);
      setRoutes(rRes.data as Route[] ?? []);
      setReturnableTrips((retRes.data as Trip[]) ?? []);
    });
  }, [businessId, open]);

  useEffect(() => {
    if (trip) {
      setFormData(trip);
      if (businessId) {
        supabase.from('trip_stops').select('*').eq('trip_id', trip.id).order('sequence_no').then(({ data }) => setStops((data ?? []) as TripStop[]));
      }
    } else {
      setFormData({
        trip_date: todayISODate(),
        rate_type: 'fixed',
        ownership_type_snapshot: 'own',
        status: 'draft',
        applied_rate: 0,
        customer_freight: 0,
        truck_owner_cost: 0,
        quantity_unit: 'kg',
        has_direct_payment: false,
        direct_payment_amount: 0,
        commission_applicable: false,
        commission_value: 0,
        commission_received: 0,
        commission_status: 'n/a',
        journey_direction: 'single',
        journey_type: 'single',
        freight_payable: 0,
        freight_paid: 0,
        freight_payment_status: 'unpaid',
      });
      setStops([]);
    }
    setErrors({});
    setShowSummary(false);
  }, [trip, open, businessId]);

  // Calculate customer freight
  const calculatedFreight = useMemo(() => {
    return calculateCustomerFreight(
      formData.rate_type ?? 'fixed',
      Number(formData.applied_rate ?? 0),
      Number(formData.quantity ?? 0),
      formData.quantity_unit ?? 'kg'
    );
  }, [formData.rate_type, formData.applied_rate, formData.quantity, formData.quantity_unit]);

  useEffect(() => {
    if (!trip) {
      setFormData((prev) => ({ ...prev, customer_freight: calculatedFreight }));
    }
  }, [calculatedFreight, trip]);

  // Auto-calculate freight payment status
  const freightBalance = useMemo(() => Number(formData.freight_payable ?? 0) - Number(formData.freight_paid ?? 0), [formData.freight_payable, formData.freight_paid]);

  useEffect(() => {
    const paid = Number(formData.freight_paid ?? 0);
    const payable = Number(formData.freight_payable ?? 0);
    let status: FreightPaymentStatus = 'unpaid';
    if (paid >= payable && payable > 0) status = 'paid';
    else if (paid > 0) status = 'partially_paid';
    setFormData((prev) => ({ ...prev, freight_payment_status: status }));
  }, [formData.freight_paid, formData.freight_payable]);

  // Commission amount calculation
  const commissionAmount = useMemo(() => {
    if (!formData.commission_applicable) return 0;
    if (formData.commission_type === 'fixed') return Number(formData.commission_value ?? 0);
    if (formData.commission_type === 'percentage') return (Number(formData.customer_freight ?? 0) * Number(formData.commission_value ?? 0)) / 100;
    return 0;
  }, [formData.commission_applicable, formData.commission_type, formData.commission_value, formData.customer_freight]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.trip_date) errs.trip_date = 'Journey date is required';
    if (!formData.party_id) errs.party_id = 'Customer (consignor) is required';
    if (!formData.origin?.trim()) errs.origin = 'Origin is required';
    if (!formData.destination?.trim()) errs.destination = 'Destination is required';
    if (Number(formData.customer_freight) < 0) errs.customer_freight = 'Customer freight cannot be negative';
    if (Number(formData.freight_paid) > Number(formData.freight_payable)) errs.freight_paid = 'Paid amount cannot exceed freight payable';
    // Multi-stop validation: require at least 2 stops, first and last must have a location
    if ((formData.journey_type ?? 'single') !== 'single' && stops.length > 0) {
      if (stops.length < 2) errs.stops = 'A multi-stop journey needs at least 2 stops';
      if (!stops[0]?.location?.trim()) errs.stops = 'First stop must have a location';
      if (!stops[stops.length - 1]?.location?.trim()) errs.stops = 'Last stop must have a location';
    }
    if (formData.ownership_type_snapshot === 'attached') {
      if (!formData.transporter_name?.trim() && !formData.truck_owner_party_id) errs.transporter_name = 'Transporter name or truck owner party is required';
      if (!formData.transporter_vehicle_number?.trim() && !formData.vehicle_id) errs.transporter_vehicle_number = 'Vehicle number is required for market trips';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !businessId) return;
    setSaving(true);

    try {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value === '' || value === undefined) continue;
        cleaned[key] = value;
      }
      cleaned.business_id = businessId;

      let tripIdForStops: string;
      if (trip) {
        const { error } = await supabase.from('trips').update({ ...cleaned, updated_at: new Date().toISOString() }).eq('id', trip.id);
        if (error) throw error;
        tripIdForStops = trip.id;
        await logAudit(businessId, user?.id ?? null, 'trip_update', 'trip', trip.id, { trip_number: trip.trip_number });
        showToast('Trip updated successfully');
      } else {
        const { data: seqResult, error: seqError } = await supabase.rpc('get_next_document_number', { b_id: businessId, p_doc_type: 'trip' });
        if (seqError) throw seqError;
        const tripNumber = seqResult as string;
        cleaned.trip_number = tripNumber;
        cleaned.created_by = user?.id ?? null;
        const { data: newTrip, error } = await supabase.from('trips').insert(cleaned).select('*').maybeSingle();
        if (error) throw error;
        tripIdForStops = newTrip.id;
        if (newTrip) {
          await logAudit(businessId, user?.id ?? null, 'trip_create', 'trip', newTrip.id, { trip_number: tripNumber });
          // Create truck owner cost ledger entry for attached vehicles
          if (formData.ownership_type_snapshot === 'attached' && Number(formData.truck_owner_cost) > 0 && formData.truck_owner_party_id) {
            await createLedgerEntry(
              businessId, formData.truck_owner_party_id, formData.trip_date ?? todayISODate(),
              'truck_owner_cost', 0, Number(formData.truck_owner_cost),
              `Truck owner cost for trip ${tripNumber}`, 'trip', newTrip.id, user?.id ?? null
            );
          }
        }
        showToast(`Trip ${tripNumber} created successfully`);
      }
      await syncTripStops(businessId, tripIdForStops, stops);
      onSave();
    } catch (err: any) {
      showToast(err.message ?? 'Failed to save trip', 'error');
    }
    setSaving(false);
  };

  const handleRouteSelect = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    if (route) {
      setFormData((prev) => ({ ...prev, route_id: routeId, origin: route.origin, destination: route.destination }));
    } else {
      setFormData((prev) => ({ ...prev, route_id: null }));
    }
  };

  const handleOwnershipTypeChange = (type: 'own' | 'attached') => {
    setFormData((prev) => ({
      ...prev,
      ownership_type_snapshot: type,
      vehicle_id: type === 'own' ? prev.vehicle_id : null,
      market_vehicle_number: type === 'own' ? null : prev.market_vehicle_number,
      truck_owner_party_id: type === 'own' ? null : prev.truck_owner_party_id,
      truck_owner_cost: type === 'own' ? 0 : prev.truck_owner_cost,
      transporter_name: type === 'own' ? null : prev.transporter_name,
      transporter_vehicle_number: type === 'own' ? null : prev.transporter_vehicle_number,
      transporter_vehicle_name: type === 'own' ? null : prev.transporter_vehicle_name,
      transporter_driver_name: type === 'own' ? null : prev.transporter_driver_name,
    }));
  };

  // ─── Stop builder helpers ────────────────────────────────────────────
  const addStop = () => {
    const nextSeq = stops.length > 0 ? Math.max(...stops.map((s) => s.sequence_no)) + 1 : 1;
    setStops([...stops, {
      id: `tmp-${Date.now()}`,
      business_id: businessId ?? '',
      trip_id: trip?.id ?? '',
      sequence_no: nextSeq,
      location: '',
      stop_type: 'intermediate',
      expected_arrival: null, expected_departure: null,
      actual_arrival: null, actual_departure: null,
      status: 'planned', notes: null,
      created_at: '', updated_at: '',
    }]);
  };
  const updateStop = (idx: number, field: keyof TripStop, value: string | number | null) => {
    const updated = [...stops];
    (updated[idx] as any)[field] = value;
    setStops(updated);
  };
  const removeStop = (idx: number) => setStops(stops.filter((_, i) => i !== idx));
  const moveStop = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stops.length) return;
    const reordered = [...stops];
    const a = reordered[idx]; const b = reordered[target];
    const tmpSeq = a.sequence_no;
    a.sequence_no = b.sequence_no; b.sequence_no = tmpSeq;
    reordered[idx] = b; reordered[target] = a;
    setStops(reordered.sort((x, y) => x.sequence_no - y.sequence_no));
  };

  // When journey type is multi_stop or round_trip and no stops exist yet, seed origin/destination
  const handleJourneyTypeChange = (type: JourneyType) => {
    setFormData((prev) => ({ ...prev, journey_type: type }));
    if (type !== 'single' && stops.length === 0 && (formData.origin || formData.destination)) {
      setStops([
        { id: `tmp-${Date.now()}-1`, business_id: businessId ?? '', trip_id: trip?.id ?? '', sequence_no: 1, location: formData.origin ?? '', stop_type: 'loading', expected_arrival: null, expected_departure: null, actual_arrival: null, actual_departure: null, status: 'planned', notes: null, created_at: '', updated_at: '' },
        { id: `tmp-${Date.now()}-2`, business_id: businessId ?? '', trip_id: trip?.id ?? '', sequence_no: 2, location: formData.destination ?? '', stop_type: 'unloading', expected_arrival: null, expected_departure: null, actual_arrival: null, actual_departure: null, status: 'planned', notes: null, created_at: '', updated_at: '' },
      ]);
    }
  };

  // Sync stops to DB: simple delete-all + re-insert approach (preserves order, avoids duplicates)
  const syncTripStops = async (bId: string, tId: string, stopList: TripStop[]) => {
    if (stopList.length === 0) {
      await supabase.from('trip_stops').delete().eq('trip_id', tId);
      return;
    }
    await supabase.from('trip_stops').delete().eq('trip_id', tId);
    const rows = stopList.map((s, i) => ({
      business_id: bId,
      trip_id: tId,
      sequence_no: i + 1,
      location: s.location.trim(),
      stop_type: s.stop_type,
      expected_arrival: s.expected_arrival || null,
      expected_departure: s.expected_departure || null,
      actual_arrival: s.actual_arrival || null,
      actual_departure: s.actual_departure || null,
      status: s.status,
      notes: s.notes || null,
    }));
    await supabase.from('trip_stops').insert(rows);
  };

  return (
    <Modal open={open} onClose={onClose} title={trip ? `Edit Trip ${trip.trip_number}` : 'New Trip / Journey'} size="xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* A. Journey Information */}
        <FormSection title="Journey Information" icon={<ArrowUpDown size={16} />}>
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={() => handleJourneyTypeChange('single')} className={cn('flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors', formData.journey_type === 'single' ? 'border-navy-500 bg-navy-50 text-navy-700' : 'border-navy-200 text-navy-500 hover:border-navy-300')}>
              Single Journey
            </button>
            <button type="button" onClick={() => handleJourneyTypeChange('multi_stop')} className={cn('flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors', formData.journey_type === 'multi_stop' ? 'border-navy-500 bg-navy-50 text-navy-700' : 'border-navy-200 text-navy-500 hover:border-navy-300')}>
              Multi-Stop Journey
            </button>
            <button type="button" onClick={() => handleJourneyTypeChange('round_trip')} className={cn('flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors', formData.journey_type === 'round_trip' ? 'border-navy-500 bg-navy-50 text-navy-700' : 'border-navy-200 text-navy-500 hover:border-navy-300')}>
              Round Trip
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Journey Date" type="date" required error={errors.trip_date} value={formData.trip_date ?? ''} onChange={(e) => setFormData({ ...formData, trip_date: e.target.value })} />
            <Select label="Journey Direction" value={formData.journey_direction ?? 'single'} onChange={(e) => setFormData({ ...formData, journey_direction: e.target.value as JourneyDirection })}>
              <option value="single">Single Journey</option>
              <option value="up">Up / Outward</option>
              <option value="down">Down / Return</option>
              <option value="return">Return Leg (linked)</option>
            </Select>
            <Select label="Return Trip For (optional)" value={formData.return_trip_id ?? ''} onChange={(e) => setFormData({ ...formData, return_trip_id: e.target.value || null })}>
              <option value="">— Not a return trip —</option>
              {returnableTrips.filter((t) => t.id !== trip?.id).map((t) => <option key={t.id} value={t.id}>{t.trip_number} — {formatDate(t.trip_date)} ({t.origin} → {t.destination})</option>)}
            </Select>
          </div>
          {(formData.journey_type ?? 'single') === 'single' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Route (optional)" value={formData.route_id ?? ''} onChange={(e) => handleRouteSelect(e.target.value)}>
                <option value="">Custom route</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.origin} → {r.destination}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Origin / Loading" required error={errors.origin} value={formData.origin ?? ''} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder="Mumbai" />
                <Input label="Destination / Unloading" required error={errors.destination} value={formData.destination ?? ''} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} placeholder="Delhi" />
              </div>
            </div>
          )}
          <Select label="Status" value={formData.status ?? 'draft'} onChange={(e) => setFormData({ ...formData, status: e.target.value as TripStatus })}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FormSection>

        {/* A2. Route Stops — shown for multi_stop and round_trip */}
        {(formData.journey_type ?? 'single') !== 'single' && (
          <FormSection title="Route Stops" icon={<MapPin size={16} />}>
            <div className="bg-navy-50 rounded-lg p-3 text-xs text-navy-500 mb-3">
              Add the ordered stops for this journey. Each stop can be a loading point, unloading point, or intermediate.
              You can manually type a location even if it isn't in your Routes list. LR/Bilties linked to this trip can
              be assigned specific loading and unloading stops.
            </div>
            {errors.stops && <p className="text-xs text-red-600 mb-2">{errors.stops}</p>}
            <div className="space-y-2">
              {stops.map((s, idx) => (
                <div key={s.id} className="grid grid-cols-12 gap-2 items-start bg-white rounded-lg p-2 border border-navy-100">
                  <div className="col-span-1 flex flex-col items-center justify-center pt-1">
                    <span className="text-xs font-bold text-navy-400">{s.sequence_no}</span>
                    <div className="flex flex-col mt-1">
                      <button type="button" onClick={() => moveStop(idx, -1)} disabled={idx === 0} className="p-0.5 text-navy-400 hover:text-navy-700 disabled:opacity-30"><ArrowUp size={12} /></button>
                      <button type="button" onClick={() => moveStop(idx, 1)} disabled={idx === stops.length - 1} className="p-0.5 text-navy-400 hover:text-navy-700 disabled:opacity-30"><ArrowDown size={12} /></button>
                    </div>
                  </div>
                  <input type="text" placeholder="Location / city" value={s.location} onChange={(e) => updateStop(idx, 'location', e.target.value)} className="col-span-12 sm:col-span-4 px-2 py-1.5 text-sm border border-navy-200 rounded outline-none focus:ring-1 focus:ring-navy-300" />
                  <select value={s.stop_type} onChange={(e) => updateStop(idx, 'stop_type', e.target.value)} className="col-span-6 sm:col-span-2 px-2 py-1.5 text-xs border border-navy-200 rounded outline-none">
                    {Object.entries(STOP_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={s.status} onChange={(e) => updateStop(idx, 'status', e.target.value)} className="col-span-6 sm:col-span-2 px-2 py-1.5 text-xs border border-navy-200 rounded outline-none">
                    {Object.entries(STOP_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input type="text" placeholder="Notes (optional)" value={s.notes ?? ''} onChange={(e) => updateStop(idx, 'notes', e.target.value || null)} className="col-span-10 sm:col-span-2 px-2 py-1.5 text-xs border border-navy-200 rounded outline-none focus:ring-1 focus:ring-navy-300" />
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                    <button type="button" onClick={() => removeStop(idx)} className="p-1 rounded text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addStop} className="mt-2"><Plus size={14} /> Add Stop</Button>
          </FormSection>
        )}

        {/* B. Vehicle, Transporter and Driver */}
        <FormSection title="Vehicle, Transporter & Driver" icon={<Truck size={16} />}>
          <div className="flex gap-3 mb-4">
            <button type="button" onClick={() => handleOwnershipTypeChange('own')} className={cn('flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors', formData.ownership_type_snapshot === 'own' ? 'border-green-500 bg-green-50 text-green-700' : 'border-navy-200 text-navy-500 hover:border-navy-300')}>
              <Truck size={18} className="inline mr-2" /> Own Fleet Vehicle
            </button>
            <button type="button" onClick={() => handleOwnershipTypeChange('attached')} className={cn('flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors', formData.ownership_type_snapshot === 'attached' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-navy-200 text-navy-500 hover:border-navy-300')}>
              <Truck size={18} className="inline mr-2" /> Attached / Market Truck
            </button>
          </div>

          {formData.ownership_type_snapshot === 'own' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Vehicle (Own Fleet)" value={formData.vehicle_id ?? ''} onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value || null })}>
                <option value="">Select vehicle...</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_number}</option>)}
              </Select>
              <Select label="Driver" value={formData.driver_id ?? ''} onChange={(e) => setFormData({ ...formData, driver_id: e.target.value || null })}>
                <option value="">Select driver...</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
              </Select>
            </div>
          )}

          {formData.ownership_type_snapshot === 'attached' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Transporter / Owner Name" error={errors.transporter_name} value={formData.transporter_name ?? ''} onChange={(e) => setFormData({ ...formData, transporter_name: e.target.value })} placeholder="Transporter name (manual entry)" />
                <Select label="Or Select Truck Owner Party" value={formData.truck_owner_party_id ?? ''} onChange={(e) => {
                  const p = parties.find((p) => p.id === e.target.value);
                  setFormData({ ...formData, truck_owner_party_id: e.target.value || null, transporter_name: p?.party_name ?? formData.transporter_name });
                }}>
                  <option value="">— Enter manually above —</option>
                  {parties.filter((p) => p.party_type === 'supplier' || p.party_type === 'both').map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input label="Vehicle Number" error={errors.transporter_vehicle_number} value={formData.transporter_vehicle_number ?? ''} onChange={(e) => setFormData({ ...formData, transporter_vehicle_number: e.target.value.toUpperCase() })} placeholder="MH01AB1234" />
                <Input label="Vehicle Name/Type (optional)" value={formData.transporter_vehicle_name ?? ''} onChange={(e) => setFormData({ ...formData, transporter_vehicle_name: e.target.value })} placeholder="Truck, Container, etc." />
                <Input label="Driver Name" value={formData.transporter_driver_name ?? ''} onChange={(e) => setFormData({ ...formData, transporter_driver_name: e.target.value })} placeholder="Driver name (manual)" />
              </div>
              <Input label="Agreed Truck Owner Cost (₹)" type="number" step="0.01" value={String(formData.truck_owner_cost ?? 0)} onChange={(e) => setFormData({ ...formData, truck_owner_cost: Number(e.target.value) })} />
            </div>
          )}
        </FormSection>

        {/* C. Load Details (single load on trip; multiple via LR/Bilties) */}
        <FormSection title="Load Details" icon={<Package size={16} />}>
          <div className="bg-navy-50 rounded-lg p-3 text-xs text-navy-500 mb-3">
            Enter the primary load details here. For multiple loads or separate LR/Bilties, create them from the LR/Bilty Register and link them to this trip. Each LR/Bilty can have its own consignor, consignee, weight, rate, and freight.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Customer (Consignor)" required error={errors.party_id} value={formData.party_id ?? ''} onChange={(e) => setFormData({ ...formData, party_id: e.target.value })}>
              <option value="">Select customer...</option>
              {parties.filter((p) => p.party_type === 'customer' || p.party_type === 'both').map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
            </Select>
            <Select label="Consignee" value={formData.consignee_party_id ?? ''} onChange={(e) => setFormData({ ...formData, consignee_party_id: e.target.value || null })}>
              <option value="">Select consignee...</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.party_name}</option>)}
            </Select>
          </div>
          <Input label="Material Description" value={formData.material_description ?? ''} onChange={(e) => setFormData({ ...formData, material_description: e.target.value })} placeholder="Cement, Steel, etc." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Loading Point (specific)" value={formData.loading_point ?? ''} onChange={(e) => setFormData({ ...formData, loading_point: e.target.value })} placeholder="Godown / factory name" />
            <Input label="Delivery Point (specific)" value={formData.delivery_point ?? ''} onChange={(e) => setFormData({ ...formData, delivery_point: e.target.value })} placeholder="Delivery address" />
          </div>
        </FormSection>

        {/* D. Customer Freight */}
        <FormSection title="Customer Freight" icon={<Wallet size={16} />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Quantity" type="number" step="0.01" value={String(formData.quantity ?? '')} onChange={(e) => setFormData({ ...formData, quantity: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 5000" />
            <Select label="Quantity Unit" value={formData.quantity_unit ?? 'kg'} onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}>
              <option value="kg">Kilograms (kg)</option>
              <option value="quintal">Quintal</option>
              <option value="ton">Ton</option>
            </Select>
            <Select label="Rate Type" value={formData.rate_type ?? 'fixed'} onChange={(e) => setFormData({ ...formData, rate_type: e.target.value as RateType })}>
              <option value="fixed">Fixed Trip Rate</option>
              <option value="per_kg">Per Kg Rate</option>
              <option value="per_quintal">Per Quintal Rate</option>
              <option value="per_ton">Per Tonne Rate</option>
            </Select>
            <Input label="Applied Rate (₹)" type="number" step="0.01" value={String(formData.applied_rate ?? 0)} onChange={(e) => setFormData({ ...formData, applied_rate: Number(e.target.value) })} />
          </div>
          <div className="px-3 py-2 bg-navy-50 rounded-lg text-sm">
            <p className="text-navy-600">Calculated Freight: <span className="font-bold text-navy-800">{formatCurrency(calculatedFreight)}</span></p>
            {formData.rate_type && formData.rate_type !== 'fixed' && formData.quantity && (
              <p className="text-xs text-navy-400">{Number(formData.quantity)} {formData.quantity_unit} × {formatCurrency(Number(formData.applied_rate))}/{formData.rate_type.replace('per_', '')}</p>
            )}
            {formData.rate_type === 'fixed' && (
              <p className="text-xs text-navy-400">Fixed trip rate — not multiplied by weight</p>
            )}
          </div>
          <Input label="Customer Freight (₹) — override if needed" type="number" step="0.01" value={String(formData.customer_freight ?? 0)} onChange={(e) => setFormData({ ...formData, customer_freight: Number(e.target.value) })} />
        </FormSection>

        {/* D. Transporter Freight (separate from customer freight) */}
        <FormSection title="Transporter Freight (separate from customer)" icon={<Truck size={16} />}>
          <div className="bg-navy-50 rounded-lg p-3 text-xs text-navy-500 mb-3">
            Transporter freight is what Gokul pays the truck owner/driver. This is separate from customer freight and does not affect customer billing.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Freight Payable to Transporter (₹)" type="number" step="0.01" value={String(formData.freight_payable ?? 0)} onChange={(e) => setFormData({ ...formData, freight_payable: Number(e.target.value) })} />
            <Input label="Already Paid / Advanced (₹)" type="number" step="0.01" error={errors.freight_paid} value={String(formData.freight_paid ?? 0)} onChange={(e) => setFormData({ ...formData, freight_paid: Number(e.target.value) })} />
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1.5">Remaining Balance</label>
              <div className={cn('px-3 py-2 rounded-lg text-sm font-bold', freightBalance > 0 ? 'text-orange-700 bg-orange-50' : 'text-green-700 bg-green-50')}>
                {formatCurrency(freightBalance)}
              </div>
              <p className="text-xs text-navy-400 mt-1">Status: <Badge color={formData.freight_payment_status === 'paid' ? 'green' : formData.freight_payment_status === 'partially_paid' ? 'orange' : 'gray'}>{formData.freight_payment_status}</Badge></p>
            </div>
          </div>
        </FormSection>

        {/* H. Optional Commission */}
        <FormSection title="Commission (optional)" icon={<Wallet size={16} />}>
          <div className="flex items-center gap-2 mb-3">
            <input type="checkbox" id="commission_applicable" checked={formData.commission_applicable ?? false} onChange={(e) => setFormData({ ...formData, commission_applicable: e.target.checked, commission_status: e.target.checked ? 'pending' : 'n/a', commission_type: e.target.checked ? formData.commission_type : null })} className="w-4 h-4 rounded border-navy-300" />
            <label htmlFor="commission_applicable" className="text-sm font-semibold text-navy-700">Commission applicable (when consignee pays driver directly)</label>
          </div>
          {formData.commission_applicable && (
            <div className="space-y-3 pl-6 border-l-2 border-navy-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select label="Commission Type" value={formData.commission_type ?? ''} onChange={(e) => setFormData({ ...formData, commission_type: e.target.value as CommissionType || null })}>
                  <option value="">Select...</option>
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage of Customer Freight</option>
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
              <p className="text-xs text-navy-400">Only the commission due to Gokul is recorded — not the full direct payment. If commission is disabled, no commission receivable is created.</p>
            </div>
          )}
        </FormSection>

        <Textarea label="Journey Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />

        {/* Journey Summary before save */}
        <div className="border-t border-navy-200 pt-4">
          <button type="button" onClick={() => setShowSummary(!showSummary)} className="flex items-center gap-2 text-sm font-semibold text-navy-700 hover:text-navy-800">
            {showSummary ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Journey Summary
          </button>
          {showSummary && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <SummaryRow label="Journey" value={`${formData.trip_number ?? '(auto)'} · ${formatDate(formData.trip_date)}`} />
      <SummaryRow label="Journey Type" value={JOURNEY_TYPE_LABELS[formData.journey_type ?? 'single']} />
              <SummaryRow label="Direction" value={DIRECTION_LABELS[formData.journey_direction ?? 'single']} />
              {(formData.journey_type ?? 'single') !== 'single' && <SummaryRow label="Stops" value={String(stops.length)} />}
              <SummaryRow label="Route" value={(formData.journey_type ?? 'single') === 'single' ? `${formData.origin ?? '—'} → ${formData.destination ?? '—'}` : stops.map((s) => s.location || '(unset)').join(' → ')} />
              <SummaryRow label="Vehicle" value={formData.ownership_type_snapshot === 'own' ? (vehicles.find((v) => v.id === formData.vehicle_id)?.vehicle_number ?? '—') : (formData.transporter_vehicle_number ?? '—')} />
              <SummaryRow label="Transporter" value={formData.transporter_name ?? formData.truck_owner_party_id ? parties.find((p) => p.id === formData.truck_owner_party_id)?.party_name ?? formData.transporter_name ?? '—' : '—'} />
              <SummaryRow label="Driver" value={formData.ownership_type_snapshot === 'own' ? (drivers.find((d) => d.id === formData.driver_id)?.driver_name ?? '—') : (formData.transporter_driver_name ?? '—')} />
              <div className="border-t border-navy-100 pt-2 mt-1">
                <SummaryRow label="Customer Freight" value={formatCurrency(Number(formData.customer_freight ?? 0))} bold />
                <SummaryRow label="Transporter Payable" value={formatCurrency(Number(formData.freight_payable ?? 0))} />
                <SummaryRow label="Transporter Paid" value={formatCurrency(Number(formData.freight_paid ?? 0))} />
                <SummaryRow label="Transporter Balance" value={formatCurrency(freightBalance)} highlight={freightBalance > 0 ? 'orange' : 'green'} />
                {formData.commission_applicable && (
                  <>
                    <SummaryRow label="Commission Amount" value={formatCurrency(commissionAmount)} />
                    <SummaryRow label="Commission Received" value={formatCurrency(Number(formData.commission_received ?? 0))} />
                  </>
                )}
              </div>
              <p className="text-xs text-navy-400 sm:col-span-2">Expenses, driver advances, and LR/Bilties are managed from the trip detail page after saving.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{trip ? 'Update Trip' : 'Create Trip'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function FormSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-navy-200 rounded-lg p-4 bg-white">
      <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">{icon} {title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: 'orange' | 'green' }) {
  return (
    <div className="flex justify-between">
      <span className="text-navy-400">{label}</span>
      <span className={cn('font-medium', bold && 'font-bold text-navy-800', highlight === 'orange' && 'text-orange-700', highlight === 'green' && 'text-green-700')}>{value}</span>
    </div>
  );
}

// ─── Trip Detail Page — Clear Journey Summary ───────────────────────────
export function TripDetailPage({ tripId }: { tripId: string }) {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [lrBilties, setLrBilties] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [settlement, setSettlement] = useState<any | null>(null);
  const [advances, setAdvances] = useState<any[]>([]);
  const [lrExpenses, setLrExpenses] = useState<any[]>([]);
  const [returnTrip, setReturnTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<TripStatus | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [changingStatus, setChangingStatus] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const loadTripDetails = useCallback(async () => {
    if (!businessId || !tripId) return;
    setLoading(true);

    const { data: tripData } = await supabase
      .from('trips').select('*, party:parties!party_id(*), consignee:parties!consignee_party_id(*), vehicle:vehicles(*), driver:drivers(*), route:routes(*), truck_owner_party:parties!truck_owner_party_id(*)')
      .eq('id', tripId).maybeSingle();
    setTrip(tripData as Trip | null);

    if (tripData?.return_trip_id) {
      const { data: retData } = await supabase.from('trips').select('*').eq('id', tripData.return_trip_id).maybeSingle();
      setReturnTrip(retData as Trip | null);
    } else {
      setReturnTrip(null);
    }

    const { data: expData } = await supabase.from('trip_expenses').select('*').eq('trip_id', tripId).eq('is_reversed', false).order('expense_date');
    setExpenses(expData ?? []);

    const { data: advData } = await supabase.from('trip_advances').select('*').eq('trip_id', tripId).order('advance_date');
    setAdvances(advData ?? []);

    const { data: stopData } = await supabase.from('trip_stops').select('*').eq('trip_id', tripId).order('sequence_no');
    setStops((stopData ?? []) as TripStop[]);

      const { data: lrData } = await supabase.from('lr_bilties').select('*, loading_stop:trip_stops!loading_stop_id(*), unloading_stop:trip_stops!unloading_stop_id(*)').eq('trip_id', tripId).order('bilty_date');
      setLrBilties(lrData ?? []);

    // Load LR expenses for all linked LR/Bilties
    if (lrData && lrData.length > 0) {
      const lrIds = lrData.map((lr: any) => lr.id);
      const { data: lrExpData } = await supabase.from('lr_expenses').select('*').in('lr_bilty_id', lrIds).eq('is_reversed', false).order('created_at');
      setLrExpenses(lrExpData ?? []);
    } else {
      setLrExpenses([]);
    }

    const { data: billItems } = await supabase.from('customer_bill_items').select('bill_id, bill:customer_bills(*)').eq('trip_id', tripId);
    setBills((billItems ?? []).map((bi: any) => bi.bill).filter(Boolean));

    if (tripData?.ownership_type_snapshot === 'attached') {
      const { data: setData } = await supabase.from('truck_owner_settlements').select('*, truck_owner_party:parties(*)').eq('trip_id', tripId).maybeSingle();
      setSettlement(setData);
    }

    setLoading(false);
  }, [businessId, tripId]);

  useEffect(() => { loadTripDetails(); }, [loadTripDetails]);

  const handleStatusChange = async () => {
    if (!trip || !newStatus || !businessId) return;
    setChangingStatus(true);
    const oldStatus = trip.status;
    const { error } = await supabase.from('trips').update({ status: newStatus, notes: statusNote ? `${trip.notes ?? ''}\n[${newStatus}] ${statusNote}` : trip.notes, updated_at: new Date().toISOString() }).eq('id', trip.id);
    if (error) { showToast(error.message, 'error'); setChangingStatus(false); return; }
    await logAudit(businessId, user?.id ?? null, 'trip_status_change', 'trip', trip.id, { from: oldStatus, to: newStatus, note: statusNote });
    showToast(`Trip status changed to ${STATUS_LABELS[newStatus]}`);
    if (newStatus === 'completed' && oldStatus !== 'completed') {
      await createLedgerEntry(businessId, trip.party_id, trip.trip_date, 'customer_bill', Number(trip.customer_freight), 0, `Freight for trip ${trip.trip_number}`, 'trip', trip.id, user?.id ?? null);
    }
    setStatusModalOpen(false); setNewStatus(null); setStatusNote(''); setChangingStatus(false);
    loadTripDetails();
  };

  const handleCancel = async () => {
    if (!trip || !businessId) return;
    setChangingStatus(true);
    if (bills.length > 0) {
      showToast('Cannot cancel a billed trip. Please reverse the bill first.', 'error');
      setChangingStatus(false); setConfirmCancel(false); return;
    }
    const { error } = await supabase.from('trips').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', trip.id);
    if (error) { showToast(error.message, 'error'); setChangingStatus(false); return; }
    await logAudit(businessId, user?.id ?? null, 'trip_cancel', 'trip', trip.id, { trip_number: trip.trip_number });
    const { data: tripLedger } = await supabase.from('ledger_entries').select('id').eq('reference_id', trip.id).eq('is_reversed', false);
    for (const entry of tripLedger ?? []) {
      await supabase.from('ledger_entries').update({ is_reversed: true }).eq('id', entry.id);
      const { data: orig } = await supabase.from('ledger_entries').select('*').eq('id', entry.id).maybeSingle();
      if (orig) {
        await supabase.from('ledger_entries').insert({
          business_id: businessId, party_id: orig.party_id, transaction_date: todayISODate(),
          transaction_type: 'reversal', debit: orig.credit, credit: orig.debit,
          description: `Reversal: Trip ${trip.trip_number} cancelled`, reversal_of_entry_id: entry.id, created_by: user?.id ?? null,
        });
      }
    }
    showToast('Trip cancelled successfully');
    setConfirmCancel(false); setChangingStatus(false); loadTripDetails();
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!trip) return <Card><EmptyState title="Trip not found" message="This trip may have been deleted." /></Card>;

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalAdvances = advances.reduce((s, a) => s + Number(a.amount), 0);
  const freightBalance = Number(trip.freight_payable) - Number(trip.freight_paid);
  const consignorExpenses = lrExpenses.filter((e) => e.expense_side === 'consignor');
  const consigneeExpenses = lrExpenses.filter((e) => e.expense_side === 'consignee');
  const consignorExpTotal = consignorExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const consigneeExpTotal = consigneeExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalLrFreight = lrBilties.reduce((s, lr) => s + Number(lr.final_amount || lr.freight_amount), 0);
  const commissionAmount = trip.commission_applicable
    ? (trip.commission_type === 'fixed' ? Number(trip.commission_value) : (Number(trip.customer_freight) * Number(trip.commission_value)) / 100)
    : 0;
  const commissionPending = commissionAmount - Number(trip.commission_received);

  // Net margin calculation (clearly labeled)
  const transporterCost = trip.ownership_type_snapshot === 'attached' ? Number(trip.truck_owner_cost) : Number(trip.freight_payable);
  const netMargin = Number(trip.customer_freight) - transporterCost - totalExpenses - totalAdvances;

  const availableStatuses = STATUS_FLOW[trip.status] ?? [];

  const vehicleDisplay = trip.ownership_type_snapshot === 'own'
    ? (trip.vehicle?.vehicle_number ?? '—')
    : (trip.transporter_vehicle_number ?? trip.market_vehicle_number ?? '—');
  const transporterDisplay = trip.transporter_name ?? trip.truck_owner_party?.party_name ?? '—';
  const driverDisplay = trip.ownership_type_snapshot === 'own'
    ? (trip.driver?.driver_name ?? '—')
    : (trip.transporter_driver_name ?? '—');

  return (
    <div>
      <PageHeader
        title={`Trip ${trip.trip_number}`}
        subtitle={`${formatDate(trip.trip_date)} · ${JOURNEY_TYPE_LABELS[trip.journey_type ?? 'single']} · ${DIRECTION_LABELS[trip.journey_direction ?? 'single']} · ${trip.origin} → ${trip.destination}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/trips')}>Back to Trips</Button>
            {trip.status !== 'completed' && trip.status !== 'cancelled' && <Button variant="outline" onClick={() => navigate(`/trips?edit=${trip.id}`)}><Edit2 size={16} /> Edit</Button>}
            {availableStatuses.length > 0 && <Button onClick={() => { setNewStatus(availableStatuses[0]); setStatusModalOpen(true); }}>Change Status</Button>}
            {trip.status !== 'cancelled' && trip.status !== 'completed' && <Button variant="danger" onClick={() => setConfirmCancel(true)}>Cancel Trip</Button>}
          </div>
        }
      />

      {/* Journey Summary — separate financial categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Journey Info */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Journey Information</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-navy-400">Journey No.</dt><dd className="font-medium text-navy-800">{trip.trip_number}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Date</dt><dd className="text-navy-800">{formatDate(trip.trip_date)}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Direction</dt><dd><Badge color={trip.journey_direction === 'return' || trip.journey_direction === 'down' ? 'orange' : 'green'}>{DIRECTION_LABELS[trip.journey_direction ?? 'single']}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Route</dt><dd className="text-navy-800">{trip.origin} → {trip.destination}</dd></div>
            {trip.loading_point && <div className="flex justify-between"><dt className="text-navy-400">Loading Point</dt><dd className="text-navy-800">{trip.loading_point}</dd></div>}
            {trip.delivery_point && <div className="flex justify-between"><dt className="text-navy-400">Delivery Point</dt><dd className="text-navy-800">{trip.delivery_point}</dd></div>}
            {returnTrip && <div className="flex justify-between"><dt className="text-navy-400">Return Trip For</dt><dd><Link to={`/trips/${returnTrip.id}`} className="text-navy-600 hover:text-navy-800">{returnTrip.trip_number}</Link></dd></div>}
            <div className="flex justify-between"><dt className="text-navy-400">Status</dt><dd><StatusBadge status={trip.status} /></dd></div>
          </dl>
        </Card>

        {/* Vehicle, Transporter & Driver */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Vehicle, Transporter & Driver</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-navy-400">Ownership</dt><dd><Badge color={trip.ownership_type_snapshot === 'own' ? 'green' : 'orange'}>{trip.ownership_type_snapshot === 'own' ? 'Own Fleet' : 'Attached / Market'}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Vehicle No.</dt><dd className="font-medium text-navy-800">{vehicleDisplay}</dd></div>
            {trip.transporter_vehicle_name && <div className="flex justify-between"><dt className="text-navy-400">Vehicle Type</dt><dd className="text-navy-800">{trip.transporter_vehicle_name}</dd></div>}
            <div className="flex justify-between"><dt className="text-navy-400">Transporter/Owner</dt><dd className="text-navy-800">{transporterDisplay}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Driver</dt><dd className="text-navy-800">{driverDisplay}</dd></div>
            <div className="flex justify-between"><dt className="text-navy-400">Customer</dt><dd className="text-navy-800">{trip.party?.party_name ?? '—'}</dd></div>
            {trip.consignee && <div className="flex justify-between"><dt className="text-navy-400">Consignee</dt><dd className="text-navy-800">{trip.consignee.party_name}</dd></div>}
            <div className="flex justify-between"><dt className="text-navy-400">Material</dt><dd className="text-navy-800">{trip.material_description ?? '—'}</dd></div>
          </dl>
        </Card>
      </div>

      {/* Financial Summary — separate categories, no misleading grand total */}
      <Card className="p-5 mb-6">
        <h3 className="text-sm font-semibold text-navy-700 mb-4">Financial Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Customer Freight */}
          <div className="border border-navy-100 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-navy-400 uppercase mb-2">Customer Freight</h4>
            <p className="text-lg font-bold text-navy-800">{formatCurrency(Number(trip.customer_freight))}</p>
            <p className="text-xs text-navy-400 mt-1">{trip.rate_type === 'fixed' ? 'Fixed rate' : `${trip.rate_type?.replace('per_', 'per ')} rate`}</p>
            {lrBilties.length > 0 && (
              <p className="text-xs text-navy-400 mt-2 pt-2 border-t border-navy-50">LR/Bilty total: {formatCurrency(totalLrFreight)}</p>
            )}
          </div>

          {/* Transporter Freight */}
          <div className="border border-navy-100 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-navy-400 uppercase mb-2">Transporter Freight</h4>
            <p className="text-sm text-navy-600">Payable: <span className="font-semibold text-navy-800">{formatCurrency(Number(trip.freight_payable))}</span></p>
            <p className="text-sm text-green-700">Paid: {formatCurrency(Number(trip.freight_paid))}</p>
            <p className={cn('text-sm font-bold', freightBalance > 0 ? 'text-orange-700' : 'text-green-700')}>Balance: {formatCurrency(freightBalance)}</p>
            <div className="mt-1"><Badge color={trip.freight_payment_status === 'paid' ? 'green' : trip.freight_payment_status === 'partially_paid' ? 'orange' : 'gray'}>{trip.freight_payment_status}</Badge></div>
            {trip.ownership_type_snapshot === 'attached' && Number(trip.truck_owner_cost) > 0 && (
              <p className="text-xs text-navy-400 mt-2 pt-2 border-t border-navy-50">Agreed cost: {formatCurrency(Number(trip.truck_owner_cost))}</p>
            )}
          </div>

          {/* Trip Expenses */}
          <div className="border border-navy-100 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-navy-400 uppercase mb-2">Trip Expenses</h4>
            <p className="text-lg font-bold text-red-700">{formatCurrency(totalExpenses)}</p>
            <p className="text-xs text-navy-400 mt-1">{expenses.length} entries</p>
            {consignorExpTotal > 0 && <p className="text-xs text-orange-700 mt-2 pt-2 border-t border-navy-50">Consignor exp: {formatCurrency(consignorExpTotal)}</p>}
            {consigneeExpTotal > 0 && <p className="text-xs text-orange-700">Consignee exp: {formatCurrency(consigneeExpTotal)}</p>}
          </div>

          {/* Driver Advances */}
          <div className="border border-navy-100 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-navy-400 uppercase mb-2">Driver Advances</h4>
            <p className="text-lg font-bold text-navy-800">{formatCurrency(totalAdvances)}</p>
            <p className="text-xs text-navy-400 mt-1">{advances.length} advances</p>
            <p className="text-xs text-navy-300 mt-2">Separate from salary</p>
          </div>
        </div>

        {/* Commission section */}
        {trip.commission_applicable && (
          <div className="mt-4 border-t border-navy-100 pt-4">
            <h4 className="text-xs font-semibold text-navy-400 uppercase mb-2">Commission</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><p className="text-navy-400 text-xs">Commission Amount</p><p className="font-semibold text-navy-800">{formatCurrency(commissionAmount)}</p></div>
              <div><p className="text-navy-400 text-xs">Received</p><p className="font-semibold text-green-700">{formatCurrency(Number(trip.commission_received))}</p></div>
              <div><p className="text-navy-400 text-xs">Pending</p><p className={cn('font-semibold', commissionPending > 0 ? 'text-orange-700' : 'text-green-700')}>{formatCurrency(commissionPending)}</p></div>
              <div><p className="text-navy-400 text-xs">Status</p><Badge color={trip.commission_status === 'received' ? 'green' : trip.commission_status === 'partial' ? 'orange' : 'gray'}>{trip.commission_status}</Badge></div>
            </div>
          </div>
        )}

        {/* Net Margin — clearly labeled */}
        <div className="mt-4 border-t border-navy-100 pt-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-semibold text-navy-700">Net Margin (estimated)</p>
              <p className="text-xs text-navy-400">= Customer Freight − Transporter Cost − Trip Expenses − Driver Advances</p>
              <p className="text-xs text-navy-300 mt-1">Excludes LR/Bilty expenses and commission. This is an estimate only.</p>
            </div>
            <p className={cn('text-xl font-bold', netMargin >= 0 ? 'text-green-700' : 'text-red-700')}>{formatCurrency(netMargin)}</p>
          </div>
        </div>
      </Card>

      {/* Route Stops — shown when the journey has stops */}
      {stops.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2"><MapPin size={16} /> Route Stops ({stops.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-navy-400 border-b border-navy-100">
                <tr>
                  <th className="text-left py-2 font-medium w-10">#</th>
                  <th className="text-left py-2 font-medium">Location</th>
                  <th className="text-left py-2 font-medium">Type</th>
                  <th className="text-left py-2 font-medium">Status</th>
                  <th className="text-left py-2 font-medium hidden md:table-cell">Loads Picked Up</th>
                  <th className="text-left py-2 font-medium hidden md:table-cell">Loads Dropped Off</th>
                  {stops.some((s) => s.notes) && <th className="text-left py-2 font-medium hidden lg:table-cell">Notes</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {stops.map((s) => {
                  const pickups = lrBilties.filter((lr) => lr.loading_stop_id === s.id);
                  const dropoffs = lrBilties.filter((lr) => lr.unloading_stop_id === s.id);
                  return (
                    <tr key={s.id}>
                      <td className="py-2 font-bold text-navy-400">{s.sequence_no}</td>
                      <td className="py-2 font-medium text-navy-800">{s.location}</td>
                      <td className="py-2"><Badge color={s.stop_type === 'loading' ? 'green' : s.stop_type === 'unloading' ? 'orange' : s.stop_type === 'both' ? 'blue' : 'gray'}>{STOP_TYPE_LABELS[s.stop_type]}</Badge></td>
                      <td className="py-2"><Badge color={s.status === 'completed' ? 'green' : s.status === 'arrived' ? 'yellow' : s.status === 'skipped' ? 'red' : 'gray'}>{STOP_STATUS_LABELS[s.status]}</Badge></td>
                      <td className="py-2 text-navy-600 hidden md:table-cell">{pickups.length > 0 ? pickups.map((lr) => lr.lr_number).join(', ') : '—'}</td>
                      <td className="py-2 text-navy-600 hidden md:table-cell">{dropoffs.length > 0 ? dropoffs.map((lr) => lr.lr_number).join(', ') : '—'}</td>
                      {stops.some((x) => x.notes) && <td className="py-2 text-navy-500 hidden lg:table-cell">{s.notes ?? '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Linked records */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-navy-700">LR / Bilties ({lrBilties.length})</h3>
            <Link to={`/lr-bilties?trip=${trip.id}`}><Button variant="outline" size="sm"><FileText size={14} /> Add LR/Bilty</Button></Link>
          </div>
          {lrBilties.length === 0 ? <p className="text-sm text-navy-400 text-center py-4">No LR/bilty documents. Multiple loads can be added via LR/Bilties.</p> : (
            <div className="space-y-2">{lrBilties.map((lr) => (
              <Link key={lr.id} to={`/lr-bilties/${lr.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50">
                <div>
                  <p className="text-sm font-medium text-navy-800">{lr.lr_number}</p>
                  <p className="text-xs text-navy-400">
                    {formatDate(lr.bilty_date)} · {lr.goods_description ?? '—'}
                    {(lr.loading_stop?.location || lr.unloading_stop?.location) && (
                      <span className="text-navy-500"> · {lr.loading_stop?.location ?? lr.loading_point ?? '—'} → {lr.unloading_stop?.location ?? lr.delivery_point ?? '—'}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2"><span className="text-sm font-semibold text-navy-700">{formatCurrency(lr.final_amount || lr.freight_amount)}</span><StatusBadge status={lr.document_status} /></div>
              </Link>
            ))}</div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-navy-700">Trip Expenses ({expenses.length})</h3>
            <Link to={`/trip-expenses?trip=${trip.id}`}><Button variant="outline" size="sm"><Receipt size={14} /> Add Expense</Button></Link>
          </div>
          {expenses.length === 0 ? <p className="text-sm text-navy-400 text-center py-4">No expenses recorded</p> : (
            <table className="w-full text-sm">
              <thead className="text-navy-400 border-b border-navy-100"><tr><th className="text-left py-2 font-medium">Date</th><th className="text-left py-2 font-medium">Category</th><th className="text-right py-2 font-medium">Amount</th></tr></thead>
              <tbody className="divide-y divide-navy-50">{expenses.map((e) => (<tr key={e.id}><td className="py-2 text-navy-600">{formatDate(e.expense_date)}</td><td className="py-2"><Badge color="gray">{e.expense_category}</Badge></td><td className="py-2 text-right font-medium text-navy-700">{formatCurrency(e.amount)}</td></tr>))}</tbody>
              <tfoot><tr className="border-t border-navy-100"><td colSpan={2} className="py-2 text-right font-semibold text-navy-700">Total:</td><td className="py-2 text-right font-bold text-navy-800">{formatCurrency(totalExpenses)}</td></tr></tfoot>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-navy-700">Driver Advances ({advances.length})</h3>
            <Link to={`/trip-expenses?trip=${trip.id}&tab=advances`}><Button variant="outline" size="sm"><Wallet size={14} /> Add Advance</Button></Link>
          </div>
          {advances.length === 0 ? <p className="text-sm text-navy-400 text-center py-4">No advances recorded. Each advance appears in the driver ledger exactly once.</p> : (
            <table className="w-full text-sm">
              <thead className="text-navy-400 border-b border-navy-100"><tr><th className="text-left py-2 font-medium">Date</th><th className="text-left py-2 font-medium">Recipient</th><th className="text-right py-2 font-medium">Amount</th></tr></thead>
              <tbody className="divide-y divide-navy-50">{advances.map((a) => (<tr key={a.id}><td className="py-2 text-navy-600">{formatDate(a.advance_date)}</td><td className="py-2 text-navy-700">{a.recipient_name ?? a.recipient_type}</td><td className="py-2 text-right font-medium text-navy-700">{formatCurrency(a.amount)}</td></tr>))}</tbody>
              <tfoot><tr className="border-t border-navy-100"><td colSpan={2} className="py-2 text-right font-semibold text-navy-700">Total:</td><td className="py-2 text-right font-bold text-navy-800">{formatCurrency(totalAdvances)}</td></tr></tfoot>
            </table>
          )}
        </Card>

        {/* Truck Owner Settlement */}
        {trip.ownership_type_snapshot === 'attached' && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-navy-700 mb-3">Truck Owner Settlement</h3>
            {settlement ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-navy-400">Party</dt><dd className="font-medium text-navy-800">{settlement.truck_owner_party?.party_name ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-navy-400">Agreed Amount</dt><dd className="text-navy-800">{formatCurrency(settlement.agreed_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-navy-400">Paid</dt><dd className="text-green-700">{formatCurrency(settlement.paid_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-navy-400">Balance</dt><dd className="text-orange-700 font-semibold">{formatCurrency(settlement.balance_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-navy-400">Status</dt><dd><StatusBadge status={settlement.status} /></dd></div>
              </dl>
            ) : (
              <>
                <p className="text-sm text-navy-400 mb-3">No settlement created yet.</p>
                <Link to="/settlements"><Button variant="outline" size="sm"><Receipt size={14} /> Create Settlement</Button></Link>
              </>
            )}
          </Card>
        )}
      </div>

      {bills.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="text-sm font-semibold text-navy-700 mb-3">Linked Bills (historical)</h3>
          <div className="space-y-2">{bills.map((b) => (
            <Link key={b.id} to={`/customer-billing/${b.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50">
              <div><p className="text-sm font-medium text-navy-800">{b.bill_number}</p><p className="text-xs text-navy-400">{formatDate(b.bill_date)}</p></div>
              <div className="flex items-center gap-2"><span className="text-sm font-semibold text-navy-700">{formatCurrency(b.total_amount)}</span><StatusBadge status={b.status} /></div>
            </Link>
          ))}</div>
        </Card>
      )}

      {trip.notes && <Card className="p-5 mb-6"><h3 className="text-sm font-semibold text-navy-700 mb-2">Notes</h3><p className="text-sm text-navy-600">{trip.notes}</p></Card>}

      <Modal open={statusModalOpen} onClose={() => setStatusModalOpen(false)} title="Change Trip Status" size="sm">
        <div className="space-y-4">
          <Select label="New Status" value={newStatus ?? ''} onChange={(e) => setNewStatus(e.target.value as TripStatus)}>
            {availableStatuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
          <Textarea label="Note (optional)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Reason for status change..." />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setStatusModalOpen(false)}>Cancel</Button>
            <Button loading={changingStatus} onClick={handleStatusChange}>Update Status</Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel Trip" size="sm">
        <p className="text-sm text-navy-600 mb-4">Are you sure you want to cancel trip {trip.trip_number}? This will reverse all financial entries linked to this trip.</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirmCancel(false)}>Close</Button>
          {bills.length === 0 && <Button variant="danger" loading={changingStatus} onClick={handleCancel}>Confirm Cancellation</Button>}
        </div>
      </Modal>
    </div>
  );
}
