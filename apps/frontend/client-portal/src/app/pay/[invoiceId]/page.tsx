import { notFound } from 'next/navigation';
import { PaymentForm } from './payment-form';

const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:3001/api';

// Required env vars for payment gateways:
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — Stripe publishable key (pk_test_... or pk_live_...)
// NEXT_PUBLIC_AUTHORIZE_NET_LOGIN_ID — Authorize.Net API Login ID
// NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY — Authorize.Net Client Key
// NEXT_PUBLIC_AUTHORIZE_NET_ENV — 'production' or 'sandbox' (default: sandbox)

interface PublicInvoice {
  id: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  status: string;
  notes?: string;
  paymentToken?: string;
  sale: {
    id: string;
    currency: string;
    description?: string;
    gateway?: string;
    brand: {
      name: string;
      logoUrl?: string;
      faviconUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
    };
    client: {
      contactName?: string;
      email: string;
    };
  };
}

async function getInvoice(invoiceId: string): Promise<PublicInvoice | null> {
  try {
    const res = await fetch(`${CORE_API_URL}/invoices/public/${invoiceId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function PayPage({ params }: { params: { invoiceId: string } }) {
  const invoice = await getInvoice(params.invoiceId);

  if (!invoice) {
    notFound();
  }

  const { brand } = invoice.sale;
  const primary = brand.primaryColor ?? '#6366F1';
  const secondary = brand.secondaryColor ?? '#4F46E5';
  const isPaid = invoice.status === 'PAID';
  const amount = parseFloat(invoice.amount);

  return (
    <>
      <style>{`
        :root {
          --brand-primary: ${primary};
          --brand-secondary: ${secondary};
        }
        .brand-btn {
          background-color: var(--brand-primary);
          color: white;
        }
        .brand-btn:hover {
          background-color: var(--brand-secondary);
        }
        .brand-accent {
          color: var(--brand-primary);
        }
        .brand-border {
          border-color: var(--brand-primary);
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Brand Header */}
          <div className="text-center mb-8">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.name} className="h-12 mx-auto mb-3 object-contain" />
            ) : (
              <h1 className="text-2xl font-bold brand-accent">{brand.name}</h1>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Invoice Summary */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Invoice</p>
                  <p className="font-bold text-gray-900">{invoice.invoiceNumber}</p>
                  {invoice.notes && <p className="text-sm text-gray-500 mt-1">{invoice.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Amount Due</p>
                  <p className="text-2xl font-bold brand-accent">
                    {invoice.sale.currency} {amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Due {new Date(invoice.dueDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                  ${isPaid ? 'bg-green-100 text-green-700' : invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {invoice.status}
                </span>
                <span className="text-sm text-gray-500">
                  {invoice.sale.client.contactName ?? invoice.sale.client.email}
                </span>
              </div>
            </div>

            {/* Payment Form */}
            {isPaid ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-green-100 mx-auto mb-3">
                  <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-gray-900">Payment Received</p>
                <p className="text-sm text-gray-500 mt-1">This invoice has already been paid. Thank you!</p>
              </div>
            ) : (
              <PaymentForm
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                amount={amount}
                currency={invoice.sale.currency}
                paymentToken={invoice.paymentToken ?? invoice.id}
                gatewayType={(invoice.sale.gateway ?? 'AUTHORIZE_NET') as 'AUTHORIZE_NET' | 'STRIPE' | 'MANUAL'}
              />
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            {invoice.sale.gateway === 'STRIPE'
              ? 'Payments secured by Stripe. Your card details are never stored on our servers.'
              : invoice.sale.gateway === 'MANUAL'
              ? 'Invoice payment processed by your account manager.'
              : 'Payments secured by Authorize.Net. Your card details are never stored on our servers.'}
          </p>
        </div>
      </div>
    </>
  );
}
