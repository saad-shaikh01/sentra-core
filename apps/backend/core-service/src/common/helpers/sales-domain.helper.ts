import {
  InvoiceStatus,
  SalePaymentStatus,
  SaleStatus,
  TransactionStatus,
  TransactionType,
} from '@sentra-core/types';

type NumericLike = number | string | { toString(): string } | null | undefined;
type DateLike = Date | string | null | undefined;

type InvoiceLike = {
  amount: NumericLike;
  status: string;
  dueDate: DateLike;
  paidAt?: DateLike;
};

type TransactionLike = {
  amount: NumericLike;
  status: string;
  type: string;
};

type SaleLike = {
  totalAmount: NumericLike;
  discountedTotal?: NumericLike;
  invoices?: InvoiceLike[];
  transactions?: TransactionLike[];
};

const COLLECTION_TRANSACTION_TYPES = new Set<string>([
  TransactionType.ONE_TIME,
  TransactionType.RECURRING,
]);

export const BOOKED_SALE_STATUSES: SaleStatus[] = [
  SaleStatus.DRAFT,
  SaleStatus.PENDING,
  SaleStatus.ACTIVE,
  SaleStatus.COMPLETED,
  SaleStatus.ON_HOLD,
];

export function toNumber(value: NumericLike): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getSaleNetAmount(sale: Pick<SaleLike, 'totalAmount' | 'discountedTotal'>): number {
  return toNumber(sale.discountedTotal ?? sale.totalAmount);
}

export function deriveInvoiceStatus(invoice: Pick<InvoiceLike, 'status' | 'dueDate' | 'paidAt'>): InvoiceStatus {
  if (invoice.status === InvoiceStatus.PAID || toDate(invoice.paidAt)) {
    return InvoiceStatus.PAID;
  }

  const dueDate = toDate(invoice.dueDate);
  if (dueDate && dueDate.getTime() < Date.now()) {
    return InvoiceStatus.OVERDUE;
  }

  return InvoiceStatus.UNPAID;
}

export function getCollectedAmountFromTransactions(transactions: TransactionLike[] = []): number {
  let collected = 0;

  for (const transaction of transactions) {
    if (transaction.status !== TransactionStatus.SUCCESS) {
      continue;
    }

    const amount = toNumber(transaction.amount);
    if (COLLECTION_TRANSACTION_TYPES.has(transaction.type)) {
      collected += amount;
      continue;
    }

    if (transaction.type === TransactionType.REFUND) {
      collected -= amount;
    }
  }

  return collected;
}

export function computeSaleFinancialSnapshot(sale: SaleLike) {
  const netAmount = getSaleNetAmount(sale);
  const paidInvoiceTotal = (sale.invoices ?? [])
    .filter((invoice) => deriveInvoiceStatus(invoice) === InvoiceStatus.PAID)
    .reduce((sum, invoice) => sum + toNumber(invoice.amount), 0);
  const collectedFromTransactions = getCollectedAmountFromTransactions(sale.transactions ?? []);
  const hasTransactionEvidence = (sale.transactions ?? []).some(
    (transaction) =>
      transaction.status === TransactionStatus.SUCCESS &&
      (COLLECTION_TRANSACTION_TYPES.has(transaction.type) || transaction.type === TransactionType.REFUND),
  );

  const rawCollected = hasTransactionEvidence ? collectedFromTransactions : paidInvoiceTotal;
  const collectedAmount = Math.min(netAmount, Math.max(0, rawCollected));
  const outstandingAmount = Math.max(0, Math.round((netAmount - collectedAmount) * 100) / 100);
  const totalInvoiceCount = sale.invoices?.length ?? 0;
  const paidInvoiceCount = (sale.invoices ?? []).filter(
    (invoice) => deriveInvoiceStatus(invoice) === InvoiceStatus.PAID,
  ).length;

  let paymentStatus = SalePaymentStatus.UNPAID;
  if (collectedAmount > 0 && outstandingAmount > 0.009) {
    paymentStatus = SalePaymentStatus.PARTIALLY_PAID;
  } else if (netAmount > 0 && outstandingAmount <= 0.009) {
    paymentStatus = SalePaymentStatus.PAID;
  }

  return {
    netAmount,
    collectedAmount: Math.round(collectedAmount * 100) / 100,
    outstandingAmount,
    paymentStatus,
    paidInvoiceCount,
    totalInvoiceCount,
  };
}

export function isBookedSaleStatus(status: string | null | undefined): boolean {
  return status != null && BOOKED_SALE_STATUSES.includes(status as SaleStatus);
}
