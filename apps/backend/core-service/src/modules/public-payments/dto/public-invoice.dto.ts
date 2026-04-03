export interface BrandDto {
  name: string;
  logoUrl?: string;
}

export interface PublicInvoiceDto {
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'UNPAID' | 'PAID' | 'OVERDUE';
  alreadyPaid: boolean;
  saleDescription?: string;
  installmentNote?: string;
  brand: BrandDto;
  paymentToken: string;
  gateway: 'AUTHORIZE_NET' | 'STRIPE' | 'MANUAL' | 'CYBERSOURCE';
  saleId: string; // needed for Stripe PaymentIntent creation on frontend
}
