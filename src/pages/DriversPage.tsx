import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { Driver } from '@/types/database';
import { Button, Input, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { User, Plus, Search, Edit2, Archive } from 'lucide-react';

const PAGE_SIZE = 15;

export function DriversPage() {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Driver | null>(null);
  const [tripCounts, setTripCounts] = useState<Record<string, number>>({});

  const loadDrivers = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('drivers').select('*', { count: 'exact' }).eq('business_id', businessId);
    if (search) query = query.ilike('driver_name', `%${search}%`);
    if (statusFilter) query = query.eq('is_active', statusFilter === 'active');
    const { data, error, count } = await query.order('driver_name').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { showToast('Failed to load drivers', 'error'); setLoading(false); return; }
    setDrivers((data ?? []) as Driver[]);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));

    if (data) {
      const counts: Record<string, number> = {};
      for (const d of data) {
        const { count } = await supabase.from('trips').select('*', { count: 'exact', head: true }).eq('driver_id', d.id).neq('status', 'cancelled');
        counts[d.id] = count ?? 0;
      }
      setTripCounts(counts);
    }
    setLoading(false);
  }, [businessId, search, statusFilter, page, showToast]);

  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  const handleSave = async (formData: Partial<Driver>) => {
    if (!businessId) { return; }

    if (editingDriver) {
      const { error } = await supabase.from('drivers').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', editingDriver.id);
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user?.id ?? null, 'driver_update', 'driver', editingDriver.id, { name: formData.driver_name });
      showToast('Driver updated successfully');
    } else {
      const { error } = await supabase.from('drivers').insert({ ...formData, business_id: businessId });
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user?.id ?? null, 'driver_create', 'driver', null, { name: formData.driver_name });
      showToast('Driver added successfully');
    }
    setModalOpen(false); setEditingDriver(null); loadDrivers();
  };

  const handleArchive = async (driver: Driver) => {
    if (!businessId) { return; }
    const { error } = await supabase.from('drivers').update({ is_active: !driver.is_active, updated_at: new Date().toISOString() }).eq('id', driver.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, driver.is_active ? 'driver_deactivate' : 'driver_activate', 'driver', driver.id, { name: driver.driver_name });
    showToast(driver.is_active ? 'Driver deactivated' : 'Driver activated');
    setConfirmArchive(null); loadDrivers();
  };

  return (
    <div>
      <PageHeader title="Drivers" subtitle="Manage your drivers and their details" actions={<Button onClick={() => { setEditingDriver(null); setModalOpen(true); }}><Plus size={16} /> Add Driver</Button>} />

      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder="Search by driver name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>

          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      {loading ? <LoadingSpinner /> : drivers.length === 0 ? (
        <Card><EmptyState icon={<User size={48} />} title="No drivers found" message="Add your first driver to start assigning them to trips." action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add Driver</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Driver Name</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Licence No.</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Joined</th>
                  <th className="text-center px-4 py-3 font-semibold">Trips</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {drivers.map((d) => (
                  <tr key={d.id} className="hover:bg-navy-50/50">
                    <td className="px-4 py-3 font-medium text-navy-800">{d.driver_name}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-navy-600">{d.phone ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{d.licence_number ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{formatDate(d.joining_date)}</td>
                    <td className="px-4 py-3 text-center text-navy-700 font-medium">{tripCounts[d.id] ?? 0}</td>
                    <td className="px-4 py-3 text-center"><Badge color={d.is_active ? 'green' : 'gray'}>{d.is_active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => { setEditingDriver(d); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button><button onClick={() => setConfirmArchive(d)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Archive size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}

      <DriverFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingDriver(null); }} driver={editingDriver} onSave={handleSave} />
      <ConfirmDialog open={!!confirmArchive} onClose={() => setConfirmArchive(null)} onConfirm={() => confirmArchive && handleArchive(confirmArchive)} title={confirmArchive?.is_active ? 'Deactivate Driver' : 'Activate Driver'} message={`Are you sure you want to ${confirmArchive?.is_active ? 'deactivate' : 'activate'} "${confirmArchive?.driver_name}"?`} confirmText={confirmArchive?.is_active ? 'Deactivate' : 'Activate'} danger={confirmArchive?.is_active} />
    </div>
  );
}

function DriverFormModal({ open, onClose, driver, onSave }: { open: boolean; onClose: () => void; driver: Driver | null; onSave: (data: Partial<Driver>) => void }) {
  const [formData, setFormData] = useState<Partial<Driver>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (driver) setFormData(driver);
    else setFormData({ is_active: true });
    setErrors({});
  }, [driver, open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.driver_name?.trim()) errs.driver_name = 'Driver name is required';
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
    <Modal open={open} onClose={onClose} title={driver ? 'Edit Driver' : 'Add Driver'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Driver Name" required error={errors.driver_name} value={formData.driver_name ?? ''} onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })} placeholder="Enter driver name" />
          <Input label="Phone" value={formData.phone ?? ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Enter phone number" />
          <Input label="Licence Number" value={formData.licence_number ?? ''} onChange={(e) => setFormData({ ...formData, licence_number: e.target.value })} placeholder="Enter licence number" />
          <Input label="Joining Date" type="date" value={formData.joining_date ?? ''} onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })} />
        </div>
        <Textarea label="Address" value={formData.address ?? ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{driver ? 'Update Driver' : 'Add Driver'}</Button>
        </div>
      </form>
    </Modal>
  );
}
