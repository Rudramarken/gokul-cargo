import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { Vehicle } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination } from '@/components/ui';
import { formatCurrency, normalizeVehicleNumber, formatDate, cn } from '@/lib/format';
import { Truck, Plus, Search, Edit2, Eye, Archive } from 'lucide-react';
import { Link } from 'react-router-dom';

const PAGE_SIZE = 15;

export function VehiclesPage() {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Vehicle | null>(null);
  const [tripCounts, setTripCounts] = useState<Record<string, number>>({});

  const loadVehicles = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('vehicles').select('*, owner_party:parties(*)').eq('business_id', businessId);
    query = query.eq('ownership_type', 'own');
    if (search) query = query.ilike('vehicle_number', `%${search}%`);
    if (statusFilter) query = query.eq('is_active', statusFilter === 'active');
    const { data, error, count } = await query.order('vehicle_number').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load vehicles', 'error'); setLoading(false); return; }
    setVehicles((data ?? []) as Vehicle[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));

    if (data) {
      const counts: Record<string, number> = {};
      for (const v of data) {
        const { count } = await supabase.from('trips').select('*', { count: 'exact', head: true }).eq('vehicle_id', v.id).neq('status', 'cancelled');
        counts[v.id] = count ?? 0;
      }
      setTripCounts(counts);
    }
    setLoading(false);
  }, [businessId, search, statusFilter, page, showToast]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  const handleSave = async (formData: Partial<Vehicle>) => {
    if (!businessId) { setLoading(false); return; }
    const normalized = normalizeVehicleNumber(formData.vehicle_number ?? '');
    const payload = { ...formData, vehicle_number_normalized: normalized };

    if (editingVehicle) {
      const { error } = await supabase.from('vehicles').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingVehicle.id);
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user?.id ?? null, 'vehicle_update', 'vehicle', editingVehicle.id, { number: payload.vehicle_number });
      showToast('Vehicle updated successfully');
    } else {
      const { error } = await supabase.from('vehicles').insert({ ...payload, business_id: businessId });
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user?.id ?? null, 'vehicle_create', 'vehicle', null, { number: payload.vehicle_number });
      showToast('Vehicle added successfully');
    }
    setModalOpen(false); setEditingVehicle(null); loadVehicles();
  };

  const handleArchive = async (vehicle: Vehicle) => {
    if (!businessId) { setLoading(false); return; }
    const { error } = await supabase.from('vehicles').update({ is_active: !vehicle.is_active, updated_at: new Date().toISOString() }).eq('id', vehicle.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, vehicle.is_active ? 'vehicle_deactivate' : 'vehicle_activate', 'vehicle', vehicle.id, { number: vehicle.vehicle_number });
    showToast(vehicle.is_active ? 'Vehicle deactivated' : 'Vehicle activated');
    setConfirmArchive(null); loadVehicles();
  };

  return (
    <div>
      <PageHeader title="Vehicles" subtitle="Manage your own fleet vehicles" actions={<Button onClick={() => { setEditingVehicle(null); setModalOpen(true); }}><Plus size={16} /> Add Vehicle</Button>} />

      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder="Search by vehicle number..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>

          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : vehicles.length === 0 ? (
        <Card><EmptyState icon={<Truck size={48} />} title="No vehicles found" message="Add your first vehicle to start creating trips." action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add Vehicle</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Vehicle No.</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Category</th>

                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Capacity</th>
                  <th className="text-center px-4 py-3 font-semibold">Trips</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-navy-50/50">
                    <td className="px-4 py-3 font-medium text-navy-800">{v.vehicle_number}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-navy-600">{v.vehicle_category ?? '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-navy-600">{v.capacity ? `${v.capacity} ${v.capacity_unit}` : '—'}</td>
                    <td className="px-4 py-3 text-center text-navy-700 font-medium">{tripCounts[v.id] ?? 0}</td>
                    <td className="px-4 py-3 text-center"><Badge color={v.is_active ? 'green' : 'gray'}>{v.is_active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1"><Link to={`/trips?vehicle=${v.id}`} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Eye size={15} /></Link><button onClick={() => { setEditingVehicle(v); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button><button onClick={() => setConfirmArchive(v)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Archive size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}

      <VehicleFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingVehicle(null); }} vehicle={editingVehicle} onSave={handleSave} />
      <ConfirmDialog open={!!confirmArchive} onClose={() => setConfirmArchive(null)} onConfirm={() => confirmArchive && handleArchive(confirmArchive)} title={confirmArchive?.is_active ? 'Deactivate Vehicle' : 'Activate Vehicle'} message={`Are you sure you want to ${confirmArchive?.is_active ? 'deactivate' : 'activate'} "${confirmArchive?.vehicle_number}"?`} confirmText={confirmArchive?.is_active ? 'Deactivate' : 'Activate'} danger={confirmArchive?.is_active} />
    </div>
  );
}

function VehicleFormModal({ open, onClose, vehicle, onSave }: { open: boolean; onClose: () => void; vehicle: Vehicle | null; onSave: (data: Partial<Vehicle>) => void }) {
  const [formData, setFormData] = useState<Partial<Vehicle>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (vehicle) setFormData(vehicle);
    else setFormData({ ownership_type: 'own', is_active: true, capacity_unit: 'kg', owner_party_id: null });
    setErrors({});
  }, [vehicle, open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.vehicle_number?.trim()) errs.vehicle_number = 'Vehicle number is required';

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
    <Modal open={open} onClose={onClose} title={vehicle ? 'Edit Vehicle' : 'Add Vehicle'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Vehicle Number" required error={errors.vehicle_number} value={formData.vehicle_number ?? ''} onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })} placeholder="MH01AB1234" />
          <Input label="Vehicle Category" value={formData.vehicle_category ?? ''} onChange={(e) => setFormData({ ...formData, vehicle_category: e.target.value })} placeholder="Truck, Mini, Container, etc." />
          <Input label="Capacity" type="number" step="0.01" value={String(formData.capacity ?? '')} onChange={(e) => setFormData({ ...formData, capacity: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 10000" />
          <Select label="Capacity Unit" value={formData.capacity_unit ?? 'kg'} onChange={(e) => setFormData({ ...formData, capacity_unit: e.target.value })}>
            <option value="kg">Kilograms (kg)</option>
            <option value="quintal">Quintal</option>
            <option value="ton">Ton</option>
          </Select>
        </div>
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{vehicle ? 'Update Vehicle' : 'Add Vehicle'}</Button>
        </div>
      </form>
    </Modal>
  );
}
