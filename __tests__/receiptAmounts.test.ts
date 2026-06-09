import { getLineItemSubtotal, getReceiptAmount } from '../lib/receiptAmounts';

describe('receipt amount helpers', () => {
  it('uses the saved total when it is positive', () => {
    expect(getReceiptAmount(45.15, [{ description: 'Item', amount: 12 }])).toBe(45.15);
  });

  it('falls back to line item subtotal when total is zero', () => {
    const lineItems = [
      { description: 'Rice', amount: 69.96 },
      { description: 'Lamb', amount: 55.93 },
      { description: 'Bag', amount: 0.1 },
    ];

    expect(getLineItemSubtotal(lineItems)).toBe(125.99);
    expect(getReceiptAmount(0, lineItems)).toBe(125.99);
  });

  it('returns zero for empty or invalid amounts', () => {
    expect(getReceiptAmount(undefined, [])).toBe(0);
    expect(getReceiptAmount('not-a-number', [{ description: 'Item', amount: NaN }])).toBe(0);
  });
});
