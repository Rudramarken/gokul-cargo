import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card, PageHeader, LoadingSpinner, Badge, Pagination } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 25;

export function AuditLogPage() {
  const { businessId, isAdmin } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('audit_logs').select('*', { count: 'exact' }).eq('business_id', businessId);
    if (search) query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%`);
    const { data, error, count } = await query.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { setLoading(false); return; }
    setLogs(data ?? []);
    setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE));
    setLoading(false);
  }, [businessId, search, page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  if (!isAdmin) return <Card><p className="p-6 text-sm text-navy-400 text-center">Only owners and admins can view the audit log.</p></Card>;

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="History of important actions and changes" />
      <Card className="p-4 mb-4"><input placeholder="Search by action or entity type..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full px-4 py-2 text-sm border border-navy-200 rounded-lg outline-none focus:ring-2 focus:ring-navy-300" /></Card>
      {loading ? <LoadingSpinner /> : logs.length === 0 ? <Card><p className="text-sm text-navy-400 text-center py-8">No audit entries</p></Card> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-navy-50 text-navy-600"><tr><th className="text-left px-4 py-3 font-semibold">Timestamp</th><th className="text-left px-4 py-3 font-semibold">Action</th><th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Entity</th><th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Details</th></tr></thead>
            <tbody className="divide-y divide-navy-50">{logs.map((log) => (
              <tr key={log.id} className="hover:bg-navy-50/50"><td className="px-4 py-3 text-navy-600 whitespace-nowrap">{formatDateTime(log.created_at)}</td><td className="px-4 py-3"><Badge color="navy">{log.action.replace(/_/g, ' ')}</Badge></td><td className="px-4 py-3 hidden md:table-cell text-navy-600">{log.entity_type ?? '—'}</td><td className="px-4 py-3 hidden lg:table-cell text-navy-400 text-xs">{log.details ? JSON.stringify(log.details).slice(0, 100) : '—'}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="px-4 pb-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
        </Card>
      )}
    </div>
  );
}
