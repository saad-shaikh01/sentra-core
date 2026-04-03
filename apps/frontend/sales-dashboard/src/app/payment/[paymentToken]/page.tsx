'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Script from 'next/script';
import { CheckCircle2, AlertCircle, Loader2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

type PageState = 'loading' | 'ready' | 'already-paid' | 'success' | 'error' | 'not-found' | 'unavailable';
type GatewayType = 'AUTHORIZE_NET' | 'STRIPE' | 'MANUAL' | 'CYBERSOURCE';

interface InvoiceData {
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate?: string;
  status: string;
  alreadyPaid: boolean;
  saleDescription?: string;
  paymentToken: string;
  gateway: GatewayType;
  brand: {
    name: string;
    logoUrl?: string;
  };
}

// ─── Authorize.Net config ──────────────────────────────────────────────────
const AUTHORIZE_NET_ENV = process.env.NEXT_PUBLIC_AUTHORIZE_NET_ENV ?? 'sandbox';
const API_LOGIN_ID = process.env.NEXT_PUBLIC_AUTHORIZE_NET_API_LOGIN_ID ?? '';
const CLIENT_KEY = process.env.NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY ?? '';
const ACCEPT_JS_URL =
  AUTHORIZE_NET_ENV === 'production'
    ? 'https://js.authorize.net/v1/Accept.js'
    : 'https://jstest.authorize.net/v1/Accept.js';

// ─── CyberSource Microform config ──────────────────────────────────────────
const FLEX_MICROFORM_URL = 'https://flex.cybersource.com/cybersource/assets/microform/0.11/flex-microform.min.js';

declare const Accept: {
  dispatchData: (
    data: {
      authData: { apiLoginID: string; clientKey: string };
      cardData: { cardNumber: string; month: string; year: string; cardCode: string };
    },
    callback: (response: {
      messages: { resultCode: string; message: { code: string; text: string }[] };
      opaqueData: { dataDescriptor: string; dataValue: string };
    }) => void,
  ) => void;
};

// Flex Microform 0.11: Flex is a constructor — new Flex(captureContext) → instance → .microform()
interface FlexMicroformInstance {
  createField: (type: string, options: Record<string, unknown>) => { load: (selector: string) => void };
  createToken: (
    options: { expirationMonth: string; expirationYear: string },
    callback: (err: unknown, token: string) => void,
  ) => void;
}
declare const Flex: new (captureContext: string) => {
  microform: (options?: Record<string, unknown>) => FlexMicroformInstance;
};

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export default function PublicPaymentPage() {
  const { paymentToken } = useParams<{ paymentToken: string }>();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);

  // Authorize.Net fields
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');

  // CyberSource Microform state
  const [captureContext, setCaptureContext] = useState<string | null>(null);
  const microformRef = useRef<FlexMicroformInstance | null>(null);
  const [csExpMonth, setCsExpMonth] = useState('');
  const [csExpYear, setCsExpYear] = useState('');
  const [csName, setCsName] = useState('');
  const [microformReady, setMicroformReady] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ invoiceNumber: string; amount: number; currency: string } | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Load invoice data
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

  // For CyberSource: fetch capture context once invoice + script are ready
  useEffect(() => {
    if (invoice?.gateway !== 'CYBERSOURCE' || !paymentToken || !scriptLoaded || captureContext) return;

    api.getCaptureContext(paymentToken)
      .then((res: any) => {
        const ctx = res?.data?.captureContext ?? res?.captureContext ?? res;
        setCaptureContext(typeof ctx === 'string' ? ctx : null);
      })
      .catch(() => {
        setFormError('Unable to initialize payment form. Please refresh and try again.');
      });
  }, [invoice?.gateway, paymentToken, scriptLoaded, captureContext]);

  // Initialize CyberSource Microform once capture context is available
  useEffect(() => {
    if (!captureContext || invoice?.gateway !== 'CYBERSOURCE') return;

    try {
      // Flex 0.11: constructor pattern — new Flex(captureContext) → instance → .microform()
      const microform = new Flex(captureContext).microform();

      const number = microform.createField('number', {
        placeholder: '1234 5678 9012 3456',
        styles: {
          input: {
            'font-size': '14px',
            'font-family': 'inherit',
            color: 'inherit',
          },
          ':focus': { color: 'inherit' },
          ':disabled': { cursor: 'not-allowed' },
          valid: { color: '#22c55e' },
          invalid: { color: '#ef4444' },
        },
      });

      const securityCode = microform.createField('securityCode', {
        placeholder: '123',
        styles: {
          input: {
            'font-size': '14px',
            'font-family': 'inherit',
            color: 'inherit',
          },
        },
      });

      number.load('#cs-number-container');
      securityCode.load('#cs-cvv-container');

      microformRef.current = microform;
      setMicroformReady(true);
    } catch {
      setFormError('Payment form initialization failed. Please refresh and try again.');
    }
  }, [captureContext, invoice?.gateway]);

  // ─── Submit handlers ──────────────────────────────────────────────────────

  const finalizePay = async (opaqueData: { dataDescriptor: string; dataValue: string }, payerName?: string) => {
    try {
      const result = await api.payPublicInvoice(paymentToken, {
        opaqueData,
        payer: payerName ? { name: payerName } : undefined,
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
  };

  const handleAuthorizeNetPay = () => {
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
          await finalizePay(response.opaqueData, name);
        },
      );
    } catch {
      setFormError('Payment system unavailable. Please try again.');
      setSubmitting(false);
    }
  };

  const handleCyberSourcePay = () => {
    if (!microformReady || !microformRef.current) {
      setFormError('Payment form is not ready. Please wait and try again.');
      return;
    }
    if (!csExpMonth || !csExpYear) {
      setFormError('Please enter your card expiration date');
      return;
    }

    setFormError(null);
    setSubmitting(true);

    microformRef.current.createToken(
      {
        expirationMonth: csExpMonth.padStart(2, '0'),
        expirationYear: csExpYear.length === 2 ? `20${csExpYear}` : csExpYear,
      },
      async (err, token) => {
        if (err) {
          const msg = err instanceof Error ? err.message : 'Card tokenization failed. Please check your details.';
          setFormError(msg);
          setSubmitting(false);
          return;
        }
        // Send transient token JWT as opaqueData.dataValue (same field the backend expects)
        await finalizePay(
          { dataDescriptor: 'COMMON.VCO.ONLINE.PAYMENT', dataValue: token },
          csName,
        );
      },
    );
  };

  const handlePay = () => {
    if (invoice?.gateway === 'CYBERSOURCE') {
      handleCyberSourcePay();
    } else {
      handleAuthorizeNetPay();
    }
  };

  const isCyberSource = invoice?.gateway === 'CYBERSOURCE';
  const isPayReady = isCyberSource ? microformReady : scriptLoaded;

  return (
    <>
      {/* Load the appropriate script based on gateway */}
      {(!invoice || invoice.gateway !== 'CYBERSOURCE') && (
        <Script
          src={ACCEPT_JS_URL}
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
          onError={() => setPageState('unavailable')}
        />
      )}
      {invoice?.gateway === 'CYBERSOURCE' && (
        <Script
          src={FLEX_MICROFORM_URL}
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
          onError={() => setPageState('unavailable')}
        />
      )}

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

            {pageState === 'error' && (
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

                {/* ── Authorize.Net card form ── */}
                {!isCyberSource && (
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
                  </div>
                )}

                {/* ── CyberSource Microform ── */}
                {isCyberSource && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Name on Card</Label>
                      <Input
                        placeholder="John Smith"
                        value={csName}
                        onChange={(e) => setCsName(e.target.value)}
                        disabled={submitting}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Card Number *</Label>
                      {/* CyberSource Microform renders an iframe here */}
                      <div
                        id="cs-number-container"
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background"
                        style={{ minHeight: '40px' }}
                      />
                      {!microformReady && captureContext && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading secure card field...
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label>Month *</Label>
                        <Input
                          placeholder="MM"
                          value={csExpMonth}
                          onChange={(e) => setCsExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          maxLength={2}
                          disabled={submitting}
                          autoComplete="cc-exp-month"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Year *</Label>
                        <Input
                          placeholder="YYYY"
                          value={csExpYear}
                          onChange={(e) => setCsExpYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          maxLength={4}
                          disabled={submitting}
                          autoComplete="cc-exp-year"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>CVV *</Label>
                        {/* CyberSource Microform renders an iframe here */}
                        <div
                          id="cs-cvv-container"
                          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background"
                          style={{ minHeight: '40px' }}
                        />
                      </div>
                    </div>

                    {!captureContext && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Initializing secure payment form...
                      </p>
                    )}
                  </div>
                )}

                {/* Error + Submit */}
                <div className="space-y-4 mt-4">
                  {formError ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> {formError}
                    </p>
                  ) : null}

                  <Button
                    className="w-full"
                    onClick={handlePay}
                    disabled={submitting || !isPayReady}
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      <><CreditCard className="h-4 w-4 mr-2" /> Pay {formatCurrency(invoice.amount, invoice.currency)}</>
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    {isCyberSource
                      ? 'Secured by CyberSource · Your card details are encrypted'
                      : 'Secured by Authorize.net · Your card details are encrypted'}
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
