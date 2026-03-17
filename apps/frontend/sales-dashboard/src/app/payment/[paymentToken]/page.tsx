'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import { CheckCircle2, AlertCircle, Loader2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

type PageState = 'loading' | 'ready' | 'already-paid' | 'success' | 'error' | 'not-found' | 'unavailable';

interface InvoiceData {
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate?: string;
  status: string;
  alreadyPaid: boolean;
  saleDescription?: string;
  paymentToken: string;
  brand: {
    name: string;
    logoUrl?: string;
  };
}

const AUTHORIZE_NET_ENV = process.env.NEXT_PUBLIC_AUTHORIZE_NET_ENV ?? 'sandbox';
const API_LOGIN_ID = process.env.NEXT_PUBLIC_AUTHORIZE_NET_API_LOGIN_ID ?? '';
const CLIENT_KEY = process.env.NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY ?? '';
const ACCEPT_JS_URL =
  AUTHORIZE_NET_ENV === 'production'
    ? 'https://js.authorize.net/v1/Accept.js'
    : 'https://jstest.authorize.net/v1/Accept.js';

declare const Accept: {
  dispatchData: (
    data: {
      authData: { apiLoginID: string; clientKey: string };
      cardData: { cardNumber: string; month: string; year: string; cardCode: string };
    },
    callback: (response: { messages: { resultCode: string; message: { code: string; text: string }[] }; opaqueData: { dataDescriptor: string; dataValue: string } }) => void,
  ) => void;
};

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export default function PublicPaymentPage() {
  const { paymentToken } = useParams<{ paymentToken: string }>();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ invoiceNumber: string; amount: number; currency: string } | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!paymentToken) return;
    api.getPublicInvoice(paymentToken)
      .then((data: any) => {
        const inv = data?.data ?? data;
        setInvoice(inv);
        if (inv.alreadyPaid) {
          setPageState('already-paid');
        } else {
          setPageState('ready');
        }
      })
      .catch((e: Error) => {
        if (e.message?.includes('404') || e.message?.includes('not found')) {
          setPageState('not-found');
        } else {
          setPageState('error');
        }
      });
  }, [paymentToken]);

  const handlePay = () => {
    if (!scriptLoaded) {
      setFormError('Payment system is not yet loaded. Please wait and try again.');
      return;
    }
    if (!cardNumber || !expMonth || !expYear || !cvv) {
      setFormError('Please fill in all card details');
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      Accept.dispatchData(
        {
          authData: { apiLoginID: API_LOGIN_ID, clientKey: CLIENT_KEY },
          cardData: {
            cardNumber: cardNumber.replace(/\s/g, ''),
            month: expMonth.padStart(2, '0'),
            year: expYear.length === 2 ? `20${expYear}` : expYear,
            cardCode: cvv,
          },
        },
        async (response) => {
          if (response.messages.resultCode !== 'Ok') {
            const msg = response.messages.message[0]?.text ?? 'Tokenization failed';
            setFormError(msg);
            setSubmitting(false);
            return;
          }

          try {
            const result = await api.payPublicInvoice(paymentToken, {
              opaqueData: response.opaqueData,
              payer: name ? { name } : undefined,
            }) as any;

            const payload = result?.data ?? result;

            if (payload?.alreadyPaid) {
              setPageState('already-paid');
            } else if (payload?.success) {
              setSuccessData({
                invoiceNumber: invoice!.invoiceNumber,
                amount: invoice!.amount,
                currency: invoice!.currency,
              });
              setPageState('success');
            } else {
              setFormError(payload?.message ?? 'Payment failed. Please try again.');
            }
          } catch (e: unknown) {
            setFormError(e instanceof Error ? e.message : 'Payment failed. Please try again.');
          } finally {
            setSubmitting(false);
          }
        },
      );
    } catch {
      setFormError('Payment system unavailable. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Script
        src={ACCEPT_JS_URL}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setPageState('unavailable')}
      />

      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          {invoice ? (
            <div className="text-center mb-6">
              {invoice.brand.logoUrl ? (
                <img src={invoice.brand.logoUrl} alt={invoice.brand.name} className="h-10 mx-auto mb-2 object-contain" />
              ) : (
                <h1 className="text-xl font-bold">{invoice.brand.name}</h1>
              )}
              <p className="text-sm text-muted-foreground">Secure Payment</p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            {pageState === 'loading' && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {pageState === 'not-found' && (
              <div className="text-center py-8 space-y-2">
                <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
                <p className="font-semibold">Payment link not found</p>
                <p className="text-sm text-muted-foreground">This link may have expired or is invalid. Please contact support.</p>
              </div>
            )}

            {pageState === 'unavailable' && (
              <div className="text-center py-8 space-y-2">
                <AlertCircle className="h-10 w-10 text-amber-400 mx-auto" />
                <p className="font-semibold">Payment temporarily unavailable</p>
                <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
              </div>
            )}

            {pageState === 'already-paid' && (
              <div className="text-center py-8 space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
                <p className="font-semibold">This invoice has already been paid</p>
                {invoice ? (
                  <p className="text-sm text-muted-foreground">Invoice {invoice.invoiceNumber} · {formatCurrency(invoice.amount, invoice.currency)}</p>
                ) : null}
              </div>
            )}

            {pageState === 'success' && successData && (
              <div className="text-center py-8 space-y-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
                <p className="font-bold text-lg">Payment Successful!</p>
                <p className="text-sm text-muted-foreground">
                  Invoice {successData.invoiceNumber} · {formatCurrency(successData.amount, successData.currency)}
                </p>
                <p className="text-sm text-muted-foreground">Thank you for your payment.</p>
              </div>
            )}

            {(pageState === 'error') && (
              <div className="text-center py-8 space-y-3">
                <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
                <p className="font-semibold">Something went wrong</p>
                <p className="text-sm text-muted-foreground">Unable to load the payment page.</p>
                <Button variant="outline" onClick={() => window.location.reload()}>Try Again</Button>
              </div>
            )}

            {pageState === 'ready' && invoice && (
              <>
                {/* Invoice summary */}
                <div className="mb-6 p-4 rounded-lg border border-white/10 bg-white/5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Invoice</p>
                      <p className="font-mono font-semibold">{invoice.invoiceNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Amount Due</p>
                      <p className="text-xl font-bold">{formatCurrency(invoice.amount, invoice.currency)}</p>
                    </div>
                  </div>
                  {invoice.dueDate ? (
                    <p className="text-xs text-muted-foreground">
                      Due {new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  ) : null}
                  {invoice.saleDescription ? (
                    <p className="text-xs text-muted-foreground mt-1">{invoice.saleDescription}</p>
                  ) : null}
                </div>

                {/* Card form */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Name on Card</Label>
                    <Input
                      placeholder="John Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Card Number *</Label>
                    <Input
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                      maxLength={16}
                      disabled={submitting}
                      autoComplete="cc-number"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Month *</Label>
                      <Input
                        placeholder="MM"
                        value={expMonth}
                        onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                        maxLength={2}
                        disabled={submitting}
                        autoComplete="cc-exp-month"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Year *</Label>
                      <Input
                        placeholder="YY"
                        value={expYear}
                        onChange={(e) => setExpYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                        disabled={submitting}
                        autoComplete="cc-exp-year"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>CVV *</Label>
                      <Input
                        placeholder="123"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                        disabled={submitting}
                        autoComplete="cc-csc"
                      />
                    </div>
                  </div>

                  {formError ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> {formError}
                    </p>
                  ) : null}

                  <Button
                    className="w-full"
                    onClick={handlePay}
                    disabled={submitting || !scriptLoaded}
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      <><CreditCard className="h-4 w-4 mr-2" /> Pay {formatCurrency(invoice.amount, invoice.currency)}</>
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    Secured by Authorize.net · Your card details are encrypted
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
