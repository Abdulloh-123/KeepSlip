import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSearch } from '../hooks/useSearch';
import * as supabaseLib from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  searchReceipts: jest.fn(),
}));
jest.useFakeTimers();

const mockSearchReceipts = supabaseLib.searchReceipts as jest.Mock;

const RECEIPT = {
  id: '1', user_id: 'u1', source: 'manual_scan' as const,
  merchant_name: 'Woolworths', date: '2026-05-10', total_amount: 55,
  currency: 'AUD', category: 'Food & Drink', is_business: false,
  line_items: [], image_url: null, pdf_url: null,
  email_source: null, email_message_id: null, attachment_type: null, raw_text: null, created_at: '',
};

describe('useSearch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty results and no loading for empty query', () => {
    const { result } = renderHook(() => useSearch(''));
    expect(result.current.results).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  it('debounces — does not call searchReceipts immediately', () => {
    renderHook(() => useSearch('woolworths'));
    expect(mockSearchReceipts).not.toHaveBeenCalled();
  });

  it('calls searchReceipts after 300ms debounce', async () => {
    mockSearchReceipts.mockResolvedValue([RECEIPT]);
    const { result } = renderHook(() => useSearch('woolworths'));

    act(() => { jest.advanceTimersByTime(300); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSearchReceipts).toHaveBeenCalledWith('woolworths');
    expect(result.current.results).toHaveLength(1);
  });

  it('sets error and returns empty results on fetch error', async () => {
    mockSearchReceipts.mockRejectedValue(new Error('DB error'));
    const { result } = renderHook(() => useSearch('bunnings'));

    act(() => { jest.advanceTimersByTime(300); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.results).toHaveLength(0);
    expect(result.current.error?.message).toBe('DB error');
  });

  it('clears results when query is cleared', async () => {
    mockSearchReceipts.mockResolvedValue([RECEIPT]);
    const { result, rerender } = renderHook(({ q }) => useSearch(q), {
      initialProps: { q: 'woolworths' },
    });
    act(() => { jest.advanceTimersByTime(300); });
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    rerender({ q: '' });
    expect(result.current.results).toHaveLength(0);
  });
});
