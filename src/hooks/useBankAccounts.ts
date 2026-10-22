import { useState, useEffect, useCallback } from 'react';
import type { BankAccount, AccountType } from '@/types/database';

const STORAGE_KEY = 'gokul_bank_accounts';

const SEED_ACCOUNTS: BankAccount[] = [
  {
    id: 'f26cb434-7d13-4a26-b583-0016e63fd471',
    business_id: '1c533ea7-d775-46c4-9d64-61065acde6b6',
    account_name: 'HDFC Current A/c',
    account_type: 'bank',
    bank_name: 'HDFC Bank',
    account_holder: 'Gokul Cargo Movers',
    account_number: '1234567890',
    ifsc_code: 'HDFC0001234',
    branch: 'MG Road',
    upi_id: 'gokul@hdfc',
    opening_balance: 50000,
    current_balance: 50000,
    is_active: true,
    created_at: '2026-10-21T20:52:58.742Z',
    updated_at: '2026-10-21T20:53:09.279Z',
  },
  {
    id: '3cf53ff4-2c4a-4c45-b11c-57f2f36af245',
    business_id: '1c533ea7-d775-46c4-9d64-61065acde6b6',
    account_name: 'Petty Cash Box',
    account_type: 'cash',
    bank_name: null,
    account_holder: null,
    account_number: null,
    ifsc_code: null,
    branch: null,
    upi_id: null,
    opening_balance: 5000,
    current_balance: 5000,
    is_active: true,
    created_at: '2026-10-21T20:52:58.742Z',
    updated_at: '2026-10-21T20:53:09.279Z',
  },
];

function loadAccounts(): BankAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BankAccount[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* fall through to seed */ }
  const seed = [...SEED_ACCOUNTS];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); } catch {}
  return seed;
}

function persist(accounts: BankAccount[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts)); } catch {}
}

function genId(): string {
  return 'acct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export function useBankAccounts(activeOnly = false) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const all = loadAccounts();
    const filtered = activeOnly ? all.filter((a) => a.is_active) : all;
    filtered.sort((a, b) => {
      if (a.account_type !== b.account_type) return a.account_type < b.account_type ? -1 : 1;
      return a.account_name.localeCompare(b.account_name);
    });
    setAccounts(filtered);
    setLoading(false);
  }, [activeOnly]);

  useEffect(() => { refetch(); }, [refetch]);

  return { accounts, loading, refetch };
}

export async function saveBankAccount(
  _businessId: string,
  account: Partial<BankAccount> & { account_name: string; account_type: AccountType }
): Promise<BankAccount | null> {
  const all = loadAccounts();
  const isBank = account.account_type === 'bank';

  if (account.id) {
    const idx = all.findIndex((a) => a.id === account.id);
    if (idx === -1) return null;
    all[idx] = {
      ...all[idx],
      account_name: account.account_name,
      account_type: account.account_type,
      bank_name: isBank ? (account.bank_name ?? null) : null,
      account_holder: isBank ? (account.account_holder ?? null) : null,
      account_number: isBank ? (account.account_number ?? null) : null,
      ifsc_code: isBank ? (account.ifsc_code ?? null) : null,
      branch: isBank ? (account.branch ?? null) : null,
      upi_id: isBank ? (account.upi_id ?? null) : null,
      is_active: account.is_active ?? true,
      updated_at: new Date().toISOString(),
    };
    persist(all);
    return all[idx];
  }

  const newAccount: BankAccount = {
    id: genId(),
    business_id: _businessId,
    account_name: account.account_name,
    account_type: account.account_type,
    bank_name: isBank ? (account.bank_name ?? null) : null,
    account_holder: isBank ? (account.account_holder ?? null) : null,
    account_number: isBank ? (account.account_number ?? null) : null,
    ifsc_code: isBank ? (account.ifsc_code ?? null) : null,
    branch: isBank ? (account.branch ?? null) : null,
    upi_id: isBank ? (account.upi_id ?? null) : null,
    opening_balance: account.opening_balance ?? 0,
    current_balance: account.opening_balance ?? 0,
    is_active: account.is_active ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  all.push(newAccount);
  persist(all);
  return newAccount;
}

export async function deleteBankAccount(id: string): Promise<void> {
  const all = loadAccounts();
  const acct = all.find((a) => a.id === id);
  if (acct?.account_type === 'cash') {
    throw new Error('Cannot delete cash account');
  }
  persist(all.filter((a) => a.id !== id));
}

export async function updateAccountBalance(accountId: string, delta: number): Promise<void> {
  const all = loadAccounts();
  const idx = all.findIndex((a) => a.id === accountId);
  if (idx === -1) return;
  all[idx].current_balance = Number(all[idx].current_balance) + delta;
  all[idx].updated_at = new Date().toISOString();
  persist(all);
}

export async function ensureCashAccount(businessId: string): Promise<BankAccount | null> {
  const all = loadAccounts();
  const existing = all.find((a) => a.account_type === 'cash');
  if (existing) return existing;

  const cash: BankAccount = {
    id: genId(),
    business_id: businessId,
    account_name: 'Cash',
    account_type: 'cash',
    bank_name: null,
    account_holder: null,
    account_number: null,
    ifsc_code: null,
    branch: null,
    upi_id: null,
    opening_balance: 0,
    current_balance: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  all.push(cash);
  persist(all);
  return cash;
}
