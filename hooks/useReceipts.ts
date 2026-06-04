import { useState, useEffect, useCallback } from 'react';
import { fetchReceipts } from '@/lib/supabase';
import type { Receipt } from '@/types/receipt';

export function useReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchReceipts();
      setReceipts(data);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const thisMonth = receipts.filter((r) => {
    const [y, m] = r.date.split('-').map(Number);
    return y === now.getFullYear() && m - 1 === now.getMonth();
  });
  const thisMonthSpend = thisMonth.reduce((sum, r) => sum + r.total_amount, 0);
  const thisMonthCount = thisMonth.length;

  return { receipts, loading, error, refresh: load, thisMonthSpend, thisMonthCount };
}
