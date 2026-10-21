import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { BankAccount, AccountType } from '@/types/database';

export function useBankAccounts(activeOnly = false) {
  const { businessId } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    let q = supabase.from('bank_accounts').select('*').eq('business_id', businessId).order('account_name', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) { setAccounts([]); } else { setAccounts((data ?? []) as BankAccount[]); }
    setLoading(false);
  }, [businessId, activeOnly]);

  useEffect(() => { refetch(); }, [refetch]);

  return { accounts, loading, refetch };
}

export async function saveBankAccount(
  businessId: string,
  account: Partial<BankAccount> & { account_name: string; account_type: AccountType }
): Promise<BankAccount | null> {
  const payload: Record<string, unknown> = {
    business_id: businessId,
    account_name: account.account_name,
    account_type: account.account_type,
    bank_name: account.account_type === 'bank' ? (account.bank_name ?? null) : null,
    account_number: account.account_type === 'bank' ? (account.account_number ?? null) : null,
    ifsc_code: account.account_type === 'bank' ? (account.ifsc_code ?? null) : null,
    upi_id: account.account_type === 'bank' ? (account.upi_id ?? null) : null,
    opening_balance: account.opening_balance ?? 0,
    current_balance: account.id ? undefined : (account.opening_balance ?? 0),
    is_active: account.is_active ?? true,
    updated_at: new Date().toISOString(),
  };

  if (account.id) {
    const { data, error } = await supabase.from('bank_accounts').update(payload).eq('id', account.id).select('*').maybeSingle();
    if (error) throw error;
    return data as BankAccount | null;
  } else {
    const { data, error } = await supabase.from('bank_accounts').insert(payload).select('*').maybeSingle();
    if (error) throw error;
    return data as BankAccount | null;
  }
}

export async function deleteBankAccount(id: string): Promise<void> {
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function updateAccountBalance(accountId: string, delta: number): Promise<void> {
  const { data: acct } = await supabase.from('bank_accounts').select('current_balance').eq('id', accountId).maybeSingle();
  if (!acct) return;
  const newBalance = Number(acct.current_balance) + delta;
  await supabase.from('bank_accounts').update({ current_balance: newBalance, updated_at: new Date().toISOString() }).eq('id', accountId);
}
