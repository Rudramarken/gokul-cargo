import { supabase } from '@/lib/supabase';

export async function logAudit(
  businessId: string,
  userId: string | null,
  action: string,
  entityType: string | null,
  entityId: string | null,
  details: Record<string, unknown> | null = null
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      business_id: businessId,
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details ? JSON.stringify(details) : null,
    });
  } catch (e) {
    console.error('Failed to write audit log:', e);
  }
}

export async function createLedgerEntry(
  businessId: string,
  partyId: string,
  transactionDate: string,
  transactionType: string,
  debit: number,
  credit: number,
  description: string,
  referenceType?: string,
  referenceId?: string,
  userId?: string | null
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .insert({
      business_id: businessId,
      party_id: partyId,
      transaction_date: transactionDate,
      transaction_type: transactionType,
      debit,
      credit,
      description,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      created_by: userId ?? null,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Failed to create ledger entry:', error);
    return null;
  }
  return data?.id ?? null;
}

export async function reverseLedgerEntry(
  originalEntryId: string,
  businessId: string,
  userId: string | null,
  reason: string
): Promise<boolean> {
  const { data: original, error: fetchErr } = await supabase
    .from('ledger_entries')
    .select('*')
    .eq('id', originalEntryId)
    .maybeSingle();

  if (fetchErr || !original) return false;
  if (original.is_reversed) return false;

  await supabase
    .from('ledger_entries')
    .update({ is_reversed: true })
    .eq('id', originalEntryId);

  await supabase.from('ledger_entries').insert({
    business_id: businessId,
    party_id: original.party_id,
    transaction_date: new Date().toISOString().split('T')[0],
    transaction_type: 'reversal',
    debit: original.credit,
    credit: original.debit,
    description: `Reversal: ${reason}`,
    reversal_of_entry_id: originalEntryId,
    created_by: userId,
  });

  return true;
}
