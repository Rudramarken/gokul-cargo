import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { Route } from '@/types/database';
import { Button, Input, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination } from '@/components/ui';
import { MapPin, Plus, Search, Edit2, Trash2 } from 'lucide-react';

const PAGE_SIZE = 15;

export function RoutesPage() {
  const { businessId, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Route | null>(null);

  const loadRoutes = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('routes').select('*').eq('business_id', businessId);
    if (search) query = query.or(`origin.ilike.%${search}%,destination.ilike.%${search}%`);
    if (statusFilter) query = query.eq('is_active', statusFilter === 'active');
    const { data, error, count } = await query.order('origin').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load routes', 'error'); setLoading(false); return; }
    setRoutes((data ?? []) as Route[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setLoading(false);
  }, [businessId, search, statusFilter, page, showToast]);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  const handleSave = async (formData: Partial<Route>) => {
    if (!businessId) { setLoading(false); return; }
    if (editingRoute) {
      const { error } = await supabase.from('routes').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', editingRoute.id);
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user?.id ?? null, 'route_update', 'route', editingRoute.id, {});
      showToast('Route updated successfully');
    } else {
      const { error } = await supabase.from('routes').insert({ ...formData, business_id: businessId });
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user?.id ?? null, 'route_create', 'route', null, {});
      showToast('Route added successfully');
    }
    setModalOpen(false); setEditingRoute(null); loadRoutes();
  };

  const handleDelete = async (route: Route) => {
    if (!businessId) { setLoading(false); return; }
    const { error } = await supabase.from('routes').delete().eq('id', route.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, 'route_delete', 'route', route.id, {});
    showToast('Route deleted'); setConfirmDelete(null); loadRoutes();
  };

  return (
    <div>
      <PageHeader title="Routes" subtitle="Manage transport routes between cities" actions={isAdmin && <Button onClick={() => { setEditingRoute(null); setModalOpen(true); }}><Plus size={16} /> Add Route</Button>} />
      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder="Search by origin or destination..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>
      {loading ? <LoadingSpinner /> : routes.length === 0 ? (
        <Card><EmptyState icon={<MapPin size={48} />} title="No routes found" message="Add your first route to speed up trip creation." action={isAdmin && <Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add Route</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Origin</th>
                  <th className="text-left px-4 py-3 font-semibold">Destination</th>
                  <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Distance (km)</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  {isAdmin && <th className="text-right px-4 py-3 font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {routes.map((r) => (
                  <tr key={r.id} className="hover:bg-navy-50/50">
                    <td className="px-4 py-3 font-medium text-navy-800">{r.origin}</td>
                    <td className="px-4 py-3 text-navy-600">{r.destination}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-navy-600">{r.distance_km ? `${r.distance_km} km` : '—'}</td>
                    <td className="px-4 py-3 text-center"><Badge color={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Active' : 'Inactive'}</Badge></td>
                    {isAdmin && <td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => { setEditingRoute(r); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button><button onClick={() => setConfirmDelete(r)} className="p-1.5 rounded-lg hover:bg-navy-100 text-red-600"><Trash2 size={15} /></button></div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}
      <RouteFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingRoute(null); }} route={editingRoute} onSave={handleSave} />
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={() => confirmDelete && handleDelete(confirmDelete)} title="Delete Route" message={`Are you sure you want to delete "${confirmDelete?.origin} → ${confirmDelete?.destination}"?`} confirmText="Delete" danger />
    </div>
  );
}

function RouteFormModal({ open, onClose, route, onSave }: { open: boolean; onClose: () => void; route: Route | null; onSave: (data: Partial<Route>) => void }) {
  const [formData, setFormData] = useState<Partial<Route>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (route) setFormData(route);
    else setFormData({ is_active: true });
    setErrors({});
  }, [route, open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.origin?.trim()) errs.origin = 'Origin is required';
    if (!formData.destination?.trim()) errs.destination = 'Destination is required';
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
    <Modal open={open} onClose={onClose} title={route ? 'Edit Route' : 'Add Route'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Origin" required error={errors.origin} value={formData.origin ?? ''} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder="Mumbai" />
          <Input label="Destination" required error={errors.destination} value={formData.destination ?? ''} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} placeholder="Delhi" />
        </div>
        <Input label="Distance (km)" type="number" step="0.01" value={String(formData.distance_km ?? '')} onChange={(e) => setFormData({ ...formData, distance_km: e.target.value ? Number(e.target.value) : null })} placeholder="Optional" />
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{route ? 'Update Route' : 'Add Route'}</Button>
        </div>
      </form>
    </Modal>
  );
}
