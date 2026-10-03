import type { Offer, PriceState, TotalCost } from '@shopping-navigation/contracts';

export class CurrencyMismatchError extends Error {
  public constructor(expected: string, received: string) {
    super(`Currency mismatch: expected ${expected}, received ${received}`);
    this.name = 'CurrencyMismatchError';
  }
}

export interface CostInput {
  readonly offer: Offer;
  readonly quantity: number;
  readonly currency: string;
  readonly now?: Date;
}

export function calculateTotalCost(input: CostInput): TotalCost {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantity must be a positive integer');
  }
  if (input.offer.price.currency !== input.currency) {
    throw new CurrencyMismatchError(input.currency, input.offer.price.currency);
  }

  const price = input.offer.price;
  if (price.displayPriceMinor < 0 || (price.shippingMinor !== undefined && price.shippingMinor < 0) || (price.taxMinor !== undefined && price.taxMinor < 0)) {
    throw new Error('Price components cannot be negative');
  }
  const now = input.now;
  const capturedAt = now ? Date.parse(price.capturedAt) : Number.NaN;
  const expiresAt = now ? Date.parse(price.expiresAt) : Number.POSITIVE_INFINITY;
  const isExpired = now !== undefined && (!Number.isFinite(capturedAt) || !Number.isFinite(expiresAt) || now.getTime() >= expiresAt || capturedAt > now.getTime());
  const itemMinor = price.displayPriceMinor * input.quantity;
  const shippingMinor = price.shippingMinor;
  const taxMinor = price.taxMinor;
  const discountMinor = price.discountMinor;
  const unknownComponents: ('shipping' | 'tax' | 'discount')[] = [];
  if (shippingMinor === undefined) unknownComponents.push('shipping');
  if (taxMinor === undefined) unknownComponents.push('tax');
  if (discountMinor === undefined) unknownComponents.push('discount');
  if (discountMinor !== undefined && (discountMinor < 0 || discountMinor > itemMinor)) throw new Error('Discount must be between zero and item subtotal');

  const totalMinor = itemMinor + (shippingMinor ?? 0) + (taxMinor ?? 0) - (discountMinor ?? 0);
  const state: PriceState = isExpired || price.priceState === 'stale'
    ? 'stale'
    : unknownComponents.length > 0 || price.priceState === 'unknown'
      ? 'unknown'
      : price.priceState;

  return {
    currency: input.currency,
    itemMinor,
    ...(shippingMinor === undefined ? {} : { shippingMinor }),
    ...(taxMinor === undefined ? {} : { taxMinor }),
    ...(discountMinor === undefined ? {} : { discountMinor }),
    totalMinor,
    state,
    unknownComponents,
  };
}
