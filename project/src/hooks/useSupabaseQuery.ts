import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useSupabaseQuery<T>(
  table: string,
  options: {
    select?: string;
    filters?: Record<string, string | boolean | null>;
    eq?: Record<string, string | null>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    enabled?: boolean;
  } = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase.from(table).select(options.select ?? '*');

    if (options.eq) {
      for (const [key, value] of Object.entries(options.eq)) {
        if (value !== null && value !== undefined) {
          query = query.eq(key, value);
        }
      }
    }

    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value !== null && value !== undefined) {
          query = query.eq(key, value);
        }
      }
    }

    if (options.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data: result, error: err } = await query;

    if (err) {
      setError(err.message);
      setData([]);
    } else {
      setData((result ?? []) as T[]);
    }
    setLoading(false);
  }, [table, options.select, JSON.stringify(options.eq), JSON.stringify(options.filters), options.order?.column, options.order?.ascending, options.limit, options.enabled]);

  useEffect(() => {
    if (options.enabled === false) {
      setLoading(false);
      return;
    }
    refetch();
  }, [refetch, options.enabled]);

  return { data, loading, error, refetch };
}

export function useBusinessId() {
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase
          .from('business_members')
          .select('business_id')
          .eq('user_id', session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            setBusinessId(data?.business_id ?? null);
          });
      }
    });
  }, []);

  return businessId;
}

export async function fetchBusinessId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', session.user.id)
    .maybeSingle();
  return data?.business_id ?? null;
}
