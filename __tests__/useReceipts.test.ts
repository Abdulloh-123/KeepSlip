import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useReceipts } from '../hooks/useReceipts';
import * as supabaseLib from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  fetchReceipts: jest.fn(),
  fetchMonthlyReceiptSummary: jest.fn(),
  fetchYearlyReceiptSummary: jest.fn(),
}));

const mockFetchReceipts = supabaseLib.fetchReceipts as jest.Mock;
const mockFetchMonthlyReceiptSummary = supabaseLib.fetchMonthlyReceiptSummary as jest.Mock;
const mockFetchYearlyReceiptSummary = supabaseLib.fetchYearlyReceiptSummary as jest.Mock;

const now = new Date();
const thisMonthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10);
const lastMonthDate = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-10`;

const JUNE_RECEIPT = {
  id: '1', user_id: 'u1', source: 'manual_scan' as const,
  merchant_name: 'Bunnings', date: thisMonthDate, total_amount: 84.5,
  currency: 'AUD', category: 'Tools & Materials', is_business: false,
  line_items: [], image_url: null, pdf_url: null,
  email_source: null, email_message_id: null, attachment_type: null, raw_text: null, created_at: '',
};

const LAST_MONTH_RECEIPT = {
  ...JUNE_RECEIPT, id: '2', date: lastMonthDate, total_amount: 20,
};

describe('useReceipts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchMonthlyReceiptSummary.mockResolvedValue({ spend: 0, count: 0 });
    mockFetchYearlyReceiptSummary.mockResolvedValue({ spend: 0, count: 0 });
  });

  it('loads receipts on mount', async () => {
    mockFetchReceipts.mockResolvedValue([JUNE_RECEIPT]);
    const { result } = renderHook(() => useReceipts());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.receipts).toHaveLength(1);
  });

  it('sets error when fetch fails', async () => {
    mockFetchReceipts.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useReceipts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe('network error');
  });

  it('uses the month-scoped summary for current month spend', async () => {
    mockFetchReceipts.mockResolvedValue([JUNE_RECEIPT, LAST_MONTH_RECEIPT]);
    mockFetchMonthlyReceiptSummary.mockResolvedValue({ spend: 84.5, count: 1 });
    mockFetchYearlyReceiptSummary.mockResolvedValue({ spend: 104.5, count: 2 });
    const { result } = renderHook(() => useReceipts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.thisMonthSpend).toBe(84.5);
    expect(result.current.thisMonthCount).toBe(1);
    expect(result.current.thisYearSpend).toBe(104.5);
    expect(result.current.thisYearCount).toBe(2);
  });

  it('returns zero spend when no receipts this month', async () => {
    mockFetchReceipts.mockResolvedValue([LAST_MONTH_RECEIPT]);
    const { result } = renderHook(() => useReceipts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.thisMonthSpend).toBe(0);
    expect(result.current.thisMonthCount).toBe(0);
  });

  it('refresh re-fetches receipts', async () => {
    mockFetchReceipts.mockResolvedValue([JUNE_RECEIPT]);
    mockFetchMonthlyReceiptSummary.mockResolvedValue({ spend: 84.5, count: 1 });
    mockFetchYearlyReceiptSummary.mockResolvedValue({ spend: 84.5, count: 1 });
    const { result } = renderHook(() => useReceipts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetchReceipts.mockResolvedValue([JUNE_RECEIPT, LAST_MONTH_RECEIPT]);
    mockFetchMonthlyReceiptSummary.mockResolvedValue({ spend: 104.5, count: 2 });
    mockFetchYearlyReceiptSummary.mockResolvedValue({ spend: 120.5, count: 3 });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.receipts).toHaveLength(2);
    expect(result.current.thisMonthSpend).toBe(104.5);
    expect(result.current.thisYearSpend).toBe(120.5);
  });
});
