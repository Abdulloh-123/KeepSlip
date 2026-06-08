import { useState, useEffect, useCallback } from 'react';
import { fetchMonthlyReceiptSummary, fetchReceipts } from '@/lib/supabase';
import type { Receipt } from '@/types/receipt';

export function useReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [thisMonthSpend, setThisMonthSpend] = useState(0);
  const [thisMonthCount, setThisMonthCount] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, summary] = await Promise.all([
        fetchReceipts(),
        fetchMonthlyReceiptSummary(),
      ]);
      setReceipts(data);
      setThisMonthSpend(summary.spend);
      setThisMonthCount(summary.count);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { receipts, loading, error, refresh: load, thisMonthSpend, thisMonthCount };
}
