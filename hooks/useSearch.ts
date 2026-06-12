import { useState, useEffect, useRef } from 'react';
import { searchReceipts } from '@/lib/supabase';
import { trackError, trackEvent } from '@/lib/analytics';
import type { Receipt } from '@/types/receipt';

export function useSearch(query: string, retryKey = 0) {
  const [results, setResults] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const seq = ++requestSeq.current;

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchReceipts(query);
        if (seq !== requestSeq.current) return;
        setResults(data);
        void trackEvent('search_completed', {
          query_length: query.trim().length,
          result_count: data.length,
        }, 'search');
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setResults([]);
        setError(e as Error);
        void trackError(e, {
          screen: 'search',
          properties: {
            query_length: query.trim().length,
            retry_key: retryKey,
          },
        });
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, retryKey]);

  return { results, loading, error };
}
