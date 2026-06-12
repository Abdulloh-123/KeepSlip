import { useState, useEffect, useCallback } from 'react';
import {
  fetchMonthlyReceiptSummary,
  fetchReceipts,
  fetchYearlyReceiptSummary,
} from '@/lib/supabase';
import { trackError } from '@/lib/analytics';
import type { Receipt } from '@/types/receipt';

export function useReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [thisMonthSpend, setThisMonthSpend] = useState(0);
  const [thisMonthCount, setThisMonthCount] = useState(0);
  const [thisYearSpend, setThisYearSpend] = useState(0);
  const [thisYearCount, setThisYearCount] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, monthSummary, yearSummary] = await Promise.all([
        fetchReceipts(),
        fetchMonthlyReceiptSummary(),
        fetchYearlyReceiptSummary(),
      ]);
      setReceipts(data);
      setThisMonthSpend(monthSummary.spend);
      setThisMonthCount(monthSummary.count);
      setThisYearSpend(yearSummary.spend);
      setThisYearCount(yearSummary.count);
    } catch (e) {
      setError(e as Error);
      void trackError(e, { screen: 'receipts_home', properties: { phase: 'load_receipts' } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return {
    receipts,
    loading,
    error,
    refresh: load,
    thisMonthSpend,
    thisMonthCount,
    thisYearSpend,
    thisYearCount,
  };
}
