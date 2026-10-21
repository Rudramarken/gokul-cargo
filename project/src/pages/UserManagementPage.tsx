import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { BusinessMember, BusinessRole } from '@/types/database';
import { Button, Input, Select, Modal, Badge, Card, PageHeader, EmptyState, LoadingSpinner } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { Shield, Plus, Edit2 } from 'lucide-react';

export function UserManagementPage() {
  const { businessId, user, isOwner } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState<(BusinessMember & { email?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<BusinessMember | null>(null);

  const loadMembers = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('business_members').select('*').eq('business_id', businessId);
    if (error) { showToast('Failed to load users', 'error'); setLoading(false); return; }
    const membersWithEmails = [];
    for (const m of data ?? []) {
      membersWithEmails.push({ ...m, email: '—' });
    }
    setMembers(membersWithEmails as any[]);
    setLoading(false);
  }, [businessId, showToast]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleSave = async (_email: string, role: BusinessRole) => {
    if (!businessId || !user) return;
    if (editingMember) {
      const { error } = await supabase.from('business_members').update({ role }).eq('id', editingMember.id);
      if (error) { showToast(error.message, 'error'); return; }
      await logAudit(businessId, user.id, 'user_role_change', 'business_member', editingMember.id, { role });
      showToast('User role updated');
    }
    setModalOpen(false); setEditingMember(null); loadMembers();
  };

  if (!isOwner) return <Card><EmptyState icon={<Shield size={48} />} title="Access Restricted" message="Only the business owner can manage users." /></Card>;

  return (
    <div>
      <PageHeader title="User Management" subtitle="Manage who can access your business system" />
      {loading ? <LoadingSpinner /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-navy-50 text-navy-600"><tr><th className="text-left px-4 py-3 font-semibold">User ID</th><th className="text-left px-4 py-3 font-semibold">Role</th><th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Added</th><th className="text-right px-4 py-3 font-semibold">Actions</th></tr></thead>
            <tbody className="divide-y divide-navy-50">{members.map((m) => (
              <tr key={m.id} className="hover:bg-navy-50/50"><td className="px-4 py-3 font-medium text-navy-800 text-xs">{m.user_id.slice(0, 8)}...</td><td className="px-4 py-3"><Badge color={m.role === 'owner' ? 'navy' : m.role === 'admin' ? 'blue' : 'gray'}>{m.role}</Badge></td><td className="px-4 py-3 hidden md:table-cell text-navy-600">{formatDate(m.created_at)}</td><td className="px-4 py-3 text-right">{m.role !== 'owner' && <button onClick={() => { setEditingMember(m); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><Edit2 size={15} /></button>}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}
      {modalOpen && <UserModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingMember(null); }} member={editingMember} onSave={handleSave} />}
    </div>
  );
}

function UserModal({ open, onClose, member, onSave }: { open: boolean; onClose: () => void; member: BusinessMember | null; onSave: (email: string, role: BusinessRole) => void }) {
  const [role, setRole] = useState<BusinessRole>('staff');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (member) setRole(member.role); else setRole('staff'); }, [member, open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); await onSave('', role); setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={member ? 'Edit User Role' : 'User Details'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Role" required value={role} onChange={(e) => setRole(e.target.value as BusinessRole)}>
          <option value="staff">Staff</option><option value="admin">Admin</option>
        </Select>
        <div className="text-xs text-navy-400 space-y-1"><p><b>Owner:</b> Full access including user management and settings.</p><p><b>Admin:</b> Manage operational and financial records.</p><p><b>Staff:</b> Access only permitted modules.</p></div>
        <div className="flex justify-end gap-3 pt-2"><Button variant="outline" onClick={onClose} type="button">Cancel</Button><Button type="submit" loading={saving}>{member ? 'Update Role' : 'Done'}</Button></div>
      </form>
    </Modal>
  );
}
