import { DiscountType, SaleActivityType, SaleStatus } from '@sentra-core/prisma-client';

describe('sales Prisma enum generation', () => {
  it('exposes SaleStatus.DRAFT', () => {
    expect(SaleStatus.DRAFT).toBe('DRAFT');
  });

  it('exposes DiscountType values', () => {
    expect(DiscountType.PERCENTAGE).toBe('PERCENTAGE');
    expect(DiscountType.FIXED_AMOUNT).toBe('FIXED_AMOUNT');
  });

  it('exposes the new SaleActivityType values', () => {
    expect(SaleActivityType.INVOICE_CREATED).toBe('INVOICE_CREATED');
    expect(SaleActivityType.INVOICE_UPDATED).toBe('INVOICE_UPDATED');
    expect(SaleActivityType.DISCOUNT_APPLIED).toBe('DISCOUNT_APPLIED');
    expect(SaleActivityType.MANUAL_ADJUSTMENT).toBe('MANUAL_ADJUSTMENT');
  });
});
