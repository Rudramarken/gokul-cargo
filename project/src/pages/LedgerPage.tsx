import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { Party } from '@/types/database';
import { Button, Select, Card, PageHeader, EmptyState, LoadingSpinner, Badge } from '@/components/ui';
import { formatCurrency, formatDate, downloadCSV } from '@/lib/format';
import { BookOpen, Download, Printer } from 'lucide-react';

export function LedgerPage() {
  const { businessId } = useAuth();
  const { showToast } = useToast();
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [runningBalance, setRunningBalance] = useState(0);
  const [party, setParty] = useState<Party | null>(null);

  useEffect(() => {
    if (!businessId) { setParties([]); setLoading(false); return; }
    supabase.from('parties').select('*').eq('business_id', businessId).order('party_name').then(({ data }) => setParties(data as Party[] ?? []));
  }, [businessId]);

  const loadLedger = useCallback(async () => {
    if (!businessId || !selectedParty) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('ledger_entries').select('*').eq('business_id', businessId).eq('party_id', selectedParty).eq('is_reversed', false);
    if (dateFrom) query = query.gte('transaction_date', dateFrom);
    if (dateTo) query = query.lte('transaction_date', dateTo);
    query = query.order('transaction_date', { ascending: true }).order('created_at', { ascending: true });
    const { data, error } = await query;
    if (error) { showToast('Failed to load ledger', 'error'); setLoading(false); return; }
    let bal = 0;
    const withRunning = (data ?? []).map((e) => { bal += Number(e.debit) - Number(e.credit); return { ...e, running: bal }; });
    setEntries(withRunning);
    setRunningBalance(bal);
    const p = parties.find((p) => p.id === selectedParty);
    setParty(p ?? null);
    setLoading(false);
  }, [businessId, selectedParty, dateFrom, dateTo, parties, showToast]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  const totalDebit = entries.reduce((s, e) => s + Number(e.debit), 0);
  const totalCredit = entries.reduce((s, e) => s + Number(e.credit), 0);

  const handleExport = () => {
    const rows: (string | number)[][] = [['Date', 'Type', 'Description', 'Debit', 'Credit', 'Balance']];
    entries.forEach((e) => rows.push([formatDate(e.transaction_date), e.transaction_type, e.description ?? '', e.debit, e.credit, `${Math.abs(e.running)} (${e.running >= 0 ? 'Dr' : 'Cr'})`]));
    rows.push(['', '', 'Total', totalDebit, totalCredit, '']);
    downloadCSV(`ledger-${party?.party_name ?? 'party'}.csv`, rows);
  };

  return (
    <div>
      <PageHeader title="Party Ledger" subtitle="Account statement for customers and suppliers" actions={<div className="flex gap-2"><Button variant="outline" onClick={handleExport} disabled={!selectedParty}><Download size={16} /> Export</Button><Button variant="outline" onClick={() => window.print()} disabled={!selectedParty}><Printer size={16} /> Print</Button></div>} />
      <Card className="p-4 mb-4"><div className="flex flex-col sm:flex-row gap-3">
        <select value={selectedParty} onChange={(e) => setSelectedParty(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none cursor-pointer"><option value="">Select party...</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.party_name} ({p.party_type})</option>)}</select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" /><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 text-sm border border-navy-200 rounded-lg outline-none" />
      </div></Card>
      {!selectedParty ? <Card><EmptyState icon={<BookOpen size={48} />} title="Select a party" message="Choose a party to view their ledger." /></Card> : loading ? <LoadingSpinner /> : (
        <Card className="overflow-hidden print-container" id="print-area">
          <div className="px-5 py-4 border-b border-navy-100 hidden print:block"><h2 className="text-lg font-bold">{party?.party_name} — Ledger</h2></div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-navy-50 text-navy-600"><tr><th className="text-left px-4 py-3 font-semibold">Date</th><th className="text-left px-4 py-3 font-semibold">Type</th><th className="text-left px-4 py-3 font-semibold">Description</th><th className="text-right px-4 py-3 font-semibold">Debit</th><th className="text-right px-4 py-3 font-semibold">Credit</th><th className="text-right px-4 py-3 font-semibold">Balance</th></tr></thead>
            <tbody className="divide-y divide-navy-50">{entries.map((e) => (
              <tr key={e.id} className="hover:bg-navy-50/50"><td className="px-4 py-3 text-navy-600">{formatDate(e.transaction_date)}</td><td className="px-4 py-3"><Badge color="gray">{e.transaction_type.replace(/_/g, ' ')}</Badge></td><td className="px-4 py-3 text-navy-700">{e.description}</td><td className="px-4 py-3 text-right text-navy-700">{e.debit > 0 ? formatCurrency(e.debit) : '—'}</td><td className="px-4 py-3 text-right text-navy-700">{e.credit > 0 ? formatCurrency(e.credit) : '—'}</td><td className={`px-4 py-3 text-right font-medium ${e.running >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(Math.abs(e.running))} ({e.running >= 0 ? 'Dr' : 'Cr'})</td></tr>
            ))}</tbody>
            <tfoot><tr className="border-t-2 border-navy-100 bg-navy-50"><td colSpan={3} className="px-4 py-3 text-right font-semibold">Total:</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(totalDebit)}</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(totalCredit)}</td><td className={`px-4 py-3 text-right font-bold ${runningBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(Math.abs(runningBalance))} ({runningBalance >= 0 ? 'Dr' : 'Cr'})</td></tr></tfoot>
          </table></div>
        </Card>
      )}
    </div>
  );
}
