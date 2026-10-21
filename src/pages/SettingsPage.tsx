import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { Button, Input, Select, Card, PageHeader, LoadingSpinner } from '@/components/ui';

export function SettingsPage() {
  const { businessId, user, settings, isAdmin, refreshBusiness } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

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
      <PageHeader title="Business Settings" subtitle="Configure your business profile and document settings" />
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
    </div>
  );
}
