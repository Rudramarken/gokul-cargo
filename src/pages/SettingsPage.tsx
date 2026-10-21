import { useState, useEffect, FormEvent } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Landmark, Wallet, Building2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { useBankAccounts, saveBankAccount, deleteBankAccount } from '@/hooks/useBankAccounts';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { formatCurrency } from '@/lib/format';
import { Button, Input, Select, Card, Badge, PageHeader, LoadingSpinner, Modal, ConfirmDialog, EmptyState } from '@/components/ui';
import type { BankAccount, AccountType } from '@/types/database';

export function SettingsPage() {
  const { businessId, user, settings, isAdmin, refreshBusiness } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const { accounts, loading: acctLoading, refetch } = useBankAccounts();

  useEffect(() => { if (settings) setFormData(settings); }, [settings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessId || !settings) return;
    setSaving(true);
    try {
      const { error: bizError } = await supabase.from('businesses').update({
        business_name: formData.business_name, address: formData.address, phone: formData.phone, email: formData.email, updated_at: new Date().toISOString(),
      }).eq('id', businessId);
      if (bizError) throw bizError;
      const { error: setError } = await supabase.from('business_settings').update({
        business_name: formData.business_name, address: formData.address, phone: formData.phone, email: formData.email,
        currency: formData.currency, time_zone: formData.time_zone, date_format: formData.date_format,
        trip_prefix: formData.trip_prefix, lr_prefix: formData.lr_prefix, bill_prefix: formData.bill_prefix, default_rate_type: formData.default_rate_type,
        updated_at: new Date().toISOString(),
      }).eq('business_id', businessId);
      if (setError) throw setError;
      await logAudit(businessId, user?.id ?? null, 'settings_update', 'business_settings', settings.id, {});
      await refreshBusiness();
      showToast('Settings saved successfully');
    } catch (err: any) { showToast(err.message ?? 'Failed to save settings', 'error'); }
    setSaving(false);
  };

  if (!isAdmin) return <Card><p className="p-6 text-sm text-navy-400 text-center">Only owners and admins can access settings.</p></Card>;
  if (!settings) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Business Settings" subtitle="Configure your business profile, document settings, and bank accounts" />
      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        <Card className="p-6"><h3 className="text-sm font-semibold text-navy-700 mb-4">Business Profile</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Business Name" required value={formData.business_name ?? ''} onChange={(e) => setFormData({ ...formData, business_name: e.target.value })} />
            <Input label="Phone" value={formData.phone ?? ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            <Input label="Email" value={formData.email ?? ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            <div className="sm:col-span-2"><Input label="Address" value={formData.address ?? ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })} /></div>
          </div>
        </Card>
        <Card className="p-6"><h3 className="text-sm font-semibold text-navy-700 mb-4">Regional Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Currency" value={formData.currency ?? 'INR'} onChange={(e) => setFormData({ ...formData, currency: e.target.value })}><option value="INR">INR</option></Select>
            <Select label="Time Zone" value={formData.time_zone ?? 'Asia/Kolkata'} onChange={(e) => setFormData({ ...formData, time_zone: e.target.value })}><option value="Asia/Kolkata">Asia/Kolkata</option></Select>
            <Select label="Date Format" value={formData.date_format ?? 'DD/MM/YYYY'} onChange={(e) => setFormData({ ...formData, date_format: e.target.value })}><option value="DD/MM/YYYY">DD/MM/YYYY</option></Select>
          </div>
        </Card>
        <Card className="p-6"><h3 className="text-sm font-semibold text-navy-700 mb-4">Document Number Prefixes</h3>
          <p className="text-xs text-navy-400 mb-3">Changes only affect new documents. Existing numbers are preserved.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Trip Number Prefix" value={formData.trip_prefix ?? 'TRP'} onChange={(e) => setFormData({ ...formData, trip_prefix: e.target.value })} />
            <Input label="LR/Bilty Prefix" value={formData.lr_prefix ?? 'LR'} onChange={(e) => setFormData({ ...formData, lr_prefix: e.target.value })} />
            <Input label="Bill Prefix" value={formData.bill_prefix ?? 'BILL'} onChange={(e) => setFormData({ ...formData, bill_prefix: e.target.value })} />
            <Select label="Default Rate Type" value={formData.default_rate_type ?? 'fixed'} onChange={(e) => setFormData({ ...formData, default_rate_type: e.target.value })}><option value="fixed">Fixed Trip Rate</option><option value="per_quintal">Per Quintal</option></Select>
          </div>
        </Card>
        <div className="flex justify-end"><Button type="submit" loading={saving}>Save Settings</Button></div>
      </form>

      <div className="max-w-3xl mt-8">
        <BankAccountsSection businessId={businessId ?? ''} accounts={accounts} loading={acctLoading} refetch={refetch} userId={user?.id ?? null} />
      </div>
    </div>
  );
}

function BankAccountsSection({ businessId, accounts, loading, refetch, userId }: {
  businessId: string;
  accounts: BankAccount[];
  loading: boolean;
  refetch: () => void;
  userId: string | null;
}) {
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BankAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<{ account_name: string; account_type: AccountType; bank_name: string; account_number: string; ifsc_code: string; upi_id: string; opening_balance: string; is_active: boolean }>({
    account_name: '', account_type: 'bank', bank_name: '', account_number: '', ifsc_code: '', upi_id: '', opening_balance: '0', is_active: true,
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ account_name: '', account_type: 'bank', bank_name: '', account_number: '', ifsc_code: '', upi_id: '', opening_balance: '0', is_active: true });
    setModalOpen(true);
  };

  const openEdit = (acct: BankAccount) => {
    setEditing(acct);
    setForm({
      account_name: acct.account_name,
      account_type: acct.account_type,
      bank_name: acct.bank_name ?? '',
      account_number: acct.account_number ?? '',
      ifsc_code: acct.ifsc_code ?? '',
      upi_id: acct.upi_id ?? '',
      opening_balance: String(acct.opening_balance),
      is_active: acct.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    if (!form.account_name.trim()) { showToast('Account name is required', 'error'); return; }
    setSaving(true);
    try {
      const result = await saveBankAccount(businessId, {
        id: editing?.id,
        account_name: form.account_name.trim(),
        account_type: form.account_type,
        bank_name: form.bank_name.trim() || null,
        account_number: form.account_number.trim() || null,
        ifsc_code: form.ifsc_code.trim() || null,
        upi_id: form.upi_id.trim() || null,
        opening_balance: Number(form.opening_balance) || 0,
        is_active: form.is_active,
      });
      if (!result) throw new Error('Failed to save account');
      await logAudit(businessId, userId, editing ? 'bank_account_update' : 'bank_account_create', 'bank_account', result.id, { account_name: result.account_name });
      showToast(editing ? 'Bank account updated' : 'Bank account created');
      setModalOpen(false);
      refetch();
    } catch (err: any) { showToast(err.message ?? 'Failed to save bank account', 'error'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete || !businessId) return;
    setDeleting(true);
    try {
      await deleteBankAccount(confirmDelete.id);
      await logAudit(businessId, userId, 'bank_account_delete', 'bank_account', confirmDelete.id, { account_name: confirmDelete.account_name });
      showToast('Bank account deleted');
      setConfirmDelete(null);
      refetch();
    } catch (err: any) { showToast(err.message ?? 'Failed to delete bank account', 'error'); }
    setDeleting(false);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-navy-700 flex items-center gap-2"><Landmark size={16} /> Cash & Bank Accounts</h3>
          <p className="text-xs text-navy-400 mt-0.5">Manage your cash boxes and bank accounts for recording payments and receipts.</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus size={14} /> Add Account</Button>
      </div>

      {loading ? <LoadingSpinner size="sm" /> : accounts.length === 0 ? (
        <EmptyState icon={<Wallet size={32} />} title="No accounts yet" message="Add a cash box or bank account to start tracking payments through specific accounts." action={<Button size="sm" onClick={openAdd}><Plus size={14} /> Add Account</Button>} />
      ) : (
        <div className="space-y-2">
          {accounts.map((acct) => (
            <div key={acct.id} className="flex items-center justify-between p-3 rounded-lg border border-navy-100 hover:bg-navy-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${acct.account_type === 'bank' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                  {acct.account_type === 'bank' ? <Building2 size={18} /> : <Wallet size={18} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-navy-800">{acct.account_name}</p>
                  <p className="text-xs text-navy-400">
                    {acct.account_type === 'bank' ? `${acct.bank_name ?? 'Bank'}${acct.account_number ? ` · ${acct.account_number}` : ''}` : 'Cash account'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-navy-800">{formatCurrency(Number(acct.current_balance))}</p>
                  {!acct.is_active && <Badge color="gray">Inactive</Badge>}
                </div>
                <button onClick={() => openEdit(acct)} className="p-1.5 rounded text-navy-500 hover:bg-navy-100 transition-colors"><Edit2 size={14} /></button>
                <button onClick={() => setConfirmDelete(acct)} className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Account' : 'Add Cash / Bank Account'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm({ ...form, account_type: 'bank' })} className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${form.account_type === 'bank' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-navy-200 text-navy-500 hover:border-navy-300'}`}>
              <Building2 size={16} className="inline mr-2" /> Bank Account
            </button>
            <button type="button" onClick={() => setForm({ ...form, account_type: 'cash' })} className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${form.account_type === 'cash' ? 'border-green-500 bg-green-50 text-green-700' : 'border-navy-200 text-navy-500 hover:border-navy-300'}`}>
              <Wallet size={16} className="inline mr-2" /> Cash Account
            </button>
          </div>
          <Input label="Account Name" required placeholder={form.account_type === 'bank' ? 'e.g. HDFC Current A/c' : 'e.g. Petty Cash Box'} value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          {form.account_type === 'bank' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Bank Name" placeholder="HDFC Bank" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
              <Input label="Account Number" placeholder="1234567890" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
              <Input label="IFSC Code" placeholder="HDFC0001234" value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value.toUpperCase() })} />
              <Input label="UPI ID (optional)" placeholder="gokul@hdfc" value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} />
            </div>
          )}
          <Input label="Opening Balance" type="number" step="0.01" disabled={!!editing} value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
          {editing && <p className="text-xs text-navy-400">Opening balance cannot be changed after creation. Current balance is updated automatically as payments are recorded.</p>}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 rounded border-navy-300" />
            <span className="text-sm text-navy-700">Active</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? 'Update Account' : 'Create Account'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete} title="Delete Account" message={`Are you sure you want to delete "${confirmDelete?.account_name}"? Existing payments linked to this account will keep their records but lose the account reference.`} confirmText="Delete" danger loading={deleting} />
    </Card>
  );
}
