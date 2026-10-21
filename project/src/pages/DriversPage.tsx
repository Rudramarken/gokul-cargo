import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit, createLedgerEntry } from '@/lib/audit';
import { Driver, DriverSalaryRecord, SalaryFrequency, SalaryStatus } from '@/types/database';
import { Button, Input, Select, Textarea, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner, ConfirmDialog, Pagination, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate, todayISODate } from '@/lib/format';
import { UserCircle, Plus, Search, Edit2, Archive, Wallet } from 'lucide-react';

const PAGE_SIZE = 15;

export function DriversPage() {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Driver | null>(null);
  const [tripCounts, setTripCounts] = useState<Record<string, number>>({});
  const [salaryModalDriver, setSalaryModalDriver] = useState<Driver | null>(null);

  const loadDrivers = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('drivers').select('*').eq('business_id', businessId);
    if (search) query = query.or(`driver_name.ilike.%${search}%,phone.ilike.%${search}%,licence_number.ilike.%${search}%`);
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
    if (!businessId) { setLoading(false); return; }
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
    if (!businessId) { setLoading(false); return; }
    const { error } = await supabase.from('drivers').update({ is_active: !driver.is_active, updated_at: new Date().toISOString() }).eq('id', driver.id);
    if (error) { showToast(error.message, 'error'); return; }
    await logAudit(businessId, user?.id ?? null, driver.is_active ? 'driver_deactivate' : 'driver_activate', 'driver', driver.id, { name: driver.driver_name });
    showToast(driver.is_active ? 'Driver deactivated' : 'Driver activated');
    setConfirmArchive(null); loadDrivers();
  };

  return (
    <div>
      <PageHeader title="Drivers" subtitle="Manage your drivers" actions={<Button onClick={() => { setEditingDriver(null); setModalOpen(true); }}><Plus size={16} /> Add Driver</Button>} />
      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-navy-400" />
            <input placeholder="Search by name, phone, or licence..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>
      {loading ? <LoadingSpinner /> : drivers.length === 0 ? (
        <Card><EmptyState icon={<UserCircle size={48} />} title="No drivers found" message="Add your first driver to start assigning them to trips." action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add Driver</Button>} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Name</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Licence No.</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Address</th>
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
                    <td className="px-4 py-3 hidden lg:table-cell text-navy-600">{d.address ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-navy-700 font-medium">{tripCounts[d.id] ?? 0}</td>
                    <td className="px-4 py-3 text-center"><Badge color={d.is_active ? 'green' : 'gray'}>{d.is_active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => { setEditingDriver(d); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600" title="Edit"><Edit2 size={15} /></button><button onClick={() => setSalaryModalDriver(d)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600" title="Salary"><Wallet size={15} /></button><button onClick={() => setConfirmArchive(d)} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600" title="Archive"><Archive size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}
      <DriverFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingDriver(null); }} driver={editingDriver} onSave={handleSave} />
      {salaryModalDriver && <DriverSalaryModal driver={salaryModalDriver} onClose={() => setSalaryModalDriver(null)} />}
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
    <Modal open={open} onClose={onClose} title={driver ? 'Edit Driver' : 'Add Driver'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Driver Name" required error={errors.driver_name} value={formData.driver_name ?? ''} onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })} placeholder="Ramesh Kumar" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Phone" value={formData.phone ?? ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="9876543210" />
          <Input label="Licence Number" value={formData.licence_number ?? ''} onChange={(e) => setFormData({ ...formData, licence_number: e.target.value })} placeholder="DL-0420090001234" />
        </div>
        <Input label="Joining Date" type="date" value={formData.joining_date ?? ''} onChange={(e) => setFormData({ ...formData, joining_date: e.target.value || null })} />
        <Textarea label="Address" value={formData.address ?? ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Driver Colony, Mumbai" />
        <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" loading={saving}>{driver ? 'Update Driver' : 'Add Driver'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DriverSalaryModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const { businessId, user } = useAuth();
  const { showToast } = useToast();
  const [records, setRecords] = useState<DriverSalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<DriverSalaryRecord>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadRecords = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const { data, error } = await supabase.from('driver_salary_records').select('*').eq('business_id', businessId).eq('driver_id', driver.id).order('salary_period', { ascending: false });
    if (error) { showToast('Failed to load salary records', 'error'); setLoading(false); return; }
    setRecords((data ?? []) as DriverSalaryRecord[]);
    setLoading(false);
  }, [businessId, driver.id, showToast]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  useEffect(() => {
    setFormData({ joining_date: driver.joining_date, agreed_salary: 0, salary_frequency: 'monthly', amount_paid: 0, status: 'pending', due_date: todayISODate() });
  }, [driver]);

  const totalPaid = records.reduce((s, r) => s + Number(r.amount_paid), 0);
  const totalAgreed = records.reduce((s, r) => s + Number(r.agreed_salary), 0);
  const outstandingSalary = totalAgreed - totalPaid;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.agreed_salary || Number(formData.agreed_salary) <= 0) errs.agreed_salary = 'Agreed salary must be greater than 0';
    if (Number(formData.amount_paid) < 0) errs.amount_paid = 'Amount paid cannot be negative';
    if (Number(formData.amount_paid) > Number(formData.agreed_salary)) errs.amount_paid = 'Amount paid cannot exceed agreed salary';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || !businessId) return;
    setSaving(true);
    try {
      const status: SalaryStatus = Number(formData.amount_paid) >= Number(formData.agreed_salary) ? 'paid' : Number(formData.amount_paid) > 0 ? 'partially_paid' : 'pending';
      const { error } = await supabase.from('driver_salary_records').insert({
        business_id: businessId,
        driver_id: driver.id,
        joining_date: formData.joining_date || null,
        agreed_salary: Number(formData.agreed_salary),
        salary_frequency: formData.salary_frequency ?? 'monthly',
        salary_period: formData.salary_period || null,
        due_date: formData.due_date || null,
        payment_date: formData.payment_date || null,
        amount_paid: Number(formData.amount_paid),
        payment_method: formData.payment_method || null,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null,
        status,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      await logAudit(businessId, user?.id ?? null, 'driver_salary_create', 'driver', driver.id, { agreed_salary: formData.agreed_salary, amount_paid: formData.amount_paid });
      // Create ledger entry for salary payment if amount > 0
      if (Number(formData.amount_paid) > 0) {
        // Find or create a party for the driver — use the driver's name as a fallback
        // Since drivers don't have party entries, we log audit only, not a party ledger entry
        // Driver ledger would need a party_id; for now we track via salary records
      }
      showToast('Salary record added');
      setShowForm(false);
      setFormData({ joining_date: driver.joining_date, agreed_salary: 0, salary_frequency: 'monthly', amount_paid: 0, status: 'pending', due_date: todayISODate() });
      loadRecords();
    } catch (err: any) { showToast(err.message ?? 'Failed to save', 'error'); }
    setSaving(false);
  };

  return (
    <Modal open={true} onClose={onClose} title={`Salary — ${driver.driver_name}`} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-3"><p className="text-xs text-navy-400">Total Agreed</p><p className="text-lg font-bold text-navy-800">{formatCurrency(totalAgreed)}</p></Card>
          <Card className="p-3"><p className="text-xs text-navy-400">Total Paid</p><p className="text-lg font-bold text-green-700">{formatCurrency(totalPaid)}</p></Card>
          <Card className="p-3"><p className="text-xs text-navy-400">Outstanding</p><p className="text-lg font-bold text-red-700">{formatCurrency(outstandingSalary)}</p></Card>
        </div>

        {driver.joining_date && <p className="text-sm text-navy-500">Joining date: {formatDate(driver.joining_date)}</p>}

        <div className="flex justify-end">
          <Button onClick={() => setShowForm(!showForm)}><Plus size={16} /> Add Salary Record</Button>
        </div>

        {showForm && (
          <Card className="p-4 space-y-3">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Agreed Salary (₹)" type="number" step="0.01" required error={errors.agreed_salary} value={String(formData.agreed_salary ?? 0)} onChange={(e) => setFormData({ ...formData, agreed_salary: Number(e.target.value) })} />
                <Select label="Frequency" value={formData.salary_frequency ?? 'monthly'} onChange={(e) => setFormData({ ...formData, salary_frequency: e.target.value as SalaryFrequency })}>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                  <option value="trip_based">Trip Based</option>
                </Select>
                <Input label="Salary Period (e.g. Oct 2026)" value={formData.salary_period ?? ''} onChange={(e) => setFormData({ ...formData, salary_period: e.target.value })} />
                <Input label="Due Date" type="date" value={formData.due_date ?? ''} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                <Input label="Amount Paid (₹)" type="number" step="0.01" error={errors.amount_paid} value={String(formData.amount_paid ?? 0)} onChange={(e) => setFormData({ ...formData, amount_paid: Number(e.target.value) })} />
                <Input label="Payment Date" type="date" value={formData.payment_date ?? ''} onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })} />
                <Input label="Payment Method" value={formData.payment_method ?? ''} onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })} placeholder="Cash, UPI, Bank" />
                <Input label="Reference Number" value={formData.reference_number ?? ''} onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })} />
              </div>
              <Textarea label="Notes" value={formData.notes ?? ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowForm(false)} type="button">Cancel</Button>
                <Button type="submit" loading={saving}>Save Salary Record</Button>
              </div>
            </form>
          </Card>
        )}

        {loading ? <LoadingSpinner /> : records.length === 0 ? (
          <p className="text-sm text-navy-400 text-center py-8">No salary records yet. Add the first salary record above.</p>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-navy-600">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Period</th>
                  <th className="text-right px-3 py-2 font-semibold">Agreed</th>
                  <th className="text-right px-3 py-2 font-semibold">Paid</th>
                  <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Payment Date</th>
                  <th className="text-center px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-navy-700">{r.salary_period ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-navy-700">{formatCurrency(r.agreed_salary)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{formatCurrency(r.amount_paid)}</td>
                    <td className="px-3 py-2 hidden sm:table-cell text-navy-500">{formatDate(r.payment_date)}</td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </Modal>
  );
}
