import type { LineItem } from '@/types/receipt';

export function getLineItemSubtotal(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  const subtotal = lineItems.reduce((sum, item) => {
    const record = item && typeof item === 'object' ? item as Partial<LineItem> : {};
    const amount = Number(record.amount ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return Number(subtotal.toFixed(2));
}

export function getReceiptAmount(totalAmount: unknown, lineItems: unknown): number {
  const total = Number(totalAmount ?? 0);
  if (Number.isFinite(total) && total > 0) return total;

  const subtotal = getLineItemSubtotal(lineItems);
  if (subtotal > 0) return subtotal;

  return Number.isFinite(total) && total >= 0 ? total : 0;
}
