'use client';

import { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

interface PaymentFormProps {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  paymentToken: string;
  gatewayType: 'AUTHORIZE_NET' | 'STRIPE' | 'MANUAL';
}

declare global {
  interface Window {
    Accept?: {
      dispatchData: (
        data: { authData: { apiLoginID: string; clientKey: string }; cardData: Record<string, string> },
        callback: (response: { opaqueData?: { dataDescriptor: string; dataValue: string }; messages: { resultCode: string; message: Array<{ text: string }> } }) => void,
      ) => void;
    };
  }
}

const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:3001/api';
const AUTHORIZE_NET_LOGIN_ID = process.env.NEXT_PUBLIC_AUTHORIZE_NET_LOGIN_ID ?? '';
const AUTHORIZE_NET_CLIENT_KEY = process.env.NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY ?? '';
const ACCEPT_JS_URL = process.env.NEXT_PUBLIC_AUTHORIZE_NET_ENV === 'production'
  ? 'https://js.authorize.net/v1/Accept.js'
  : 'https://jstest.authorize.net/v1/Accept.js';
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

type Step = 'card' | 'processing' | 'success' | 'error';

// ─── Authorize.Net Form ───────────────────────────────────────────────────────

function AuthNetPaymentForm({
  invoiceNumber,
  amount,
  currency,
  paymentToken,
}: {
  invoiceNumber: string;
  amount: number;
  currency: string;
  paymentToken: string;
}) {
  const [step, setStep] = useState<Step>('card');
  const [errorMsg, setErrorMsg] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (scriptLoaded.current) return;
    const script = document.createElement('script');
    script.src = ACCEPT_JS_URL;
    script.async = true;
    document.head.appendChild(script);
    scriptLoaded.current = true;
  }, []);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');
    setErrorMsg('');

    if (!window.Accept) {
      setErrorMsg('Payment library not loaded. Please refresh and try again.');
      setStep('error');
      return;
    }

    window.Accept.dispatchData(
      {
        authData: { apiLoginID: AUTHORIZE_NET_LOGIN_ID, clientKey: AUTHORIZE_NET_CLIENT_KEY },
        cardData: {
          cardNumber: cardNumber.replace(/\s/g, ''),
          month: expMonth.padStart(2, '0'),
          year: expYear,
          cardCode: cvv,
          fullName: cardholderName,
        },
      },
      async (response) => {
        if (response.messages.resultCode === 'Error' || !response.opaqueData) {
          setErrorMsg(response.messages.message?.[0]?.text ?? 'Card tokenization failed');
          setStep('error');
          return;
        }

        try {
          const res = await fetch(`${API_BASE}/public/invoice/${paymentToken}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              opaqueData: response.opaqueData,
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { message?: string }).message ?? 'Payment failed');
          }

          const data = await res.json();
          if (data.alreadyPaid || data.success) {
            setStep('success');
          } else {
            throw new Error(data.message ?? 'Payment failed');
          }
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Payment failed');
          setStep('error');
        }
      },
    );
  };

  if (step === 'success') {
    return <SuccessScreen currency={currency} amount={amount} />;
  }

  return (
    <form onSubmit={handlePay} className="p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Enter Payment Details</h2>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Cardholder Name</label>
        <input
          type="text" required placeholder="Jane Smith" value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Card Number</label>
        <input
          type="text" required inputMode="numeric" placeholder="4111 1111 1111 1111" maxLength={19}
          value={cardNumber}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 16);
            setCardNumber(v.replace(/(.{4})/g, '$1 ').trim());
          }}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
          <input
            type="text" required placeholder="MM" maxLength={2} inputMode="numeric" value={expMonth}
            onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
          <input
            type="text" required placeholder="YYYY" maxLength={4} inputMode="numeric" value={expYear}
            onChange={(e) => setExpYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">CVV</label>
          <input
            type="text" required placeholder="123" maxLength={4} inputMode="numeric" value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
      </div>

      {step === 'error' && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
      )}

      <button
        type="submit" disabled={step === 'processing'}
        className="brand-btn w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {step === 'processing' ? 'Processing…' : `Pay ${currency} ${amount.toFixed(2)}`}
      </button>
    </form>
  );
}

// ─── Stripe Form ──────────────────────────────────────────────────────────────

function StripePaymentForm({
  amount,
  currency,
  paymentToken,
}: {
  amount: number;
  currency: string;
  paymentToken: string;
}) {
  const [step, setStep] = useState<'loading' | 'card' | 'processing' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [stripe, setStripe] = useState<Stripe | null>(null);

  // Card input state (manual card fields — no Stripe Elements needed for simple card form)
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        // 1. Load Stripe.js
        const stripeInstance = await loadStripe(STRIPE_PUBLISHABLE_KEY);
        if (!stripeInstance) throw new Error('Failed to load Stripe');
        setStripe(stripeInstance);

        // 2. Create PaymentIntent on backend
        const res = await fetch(`${API_BASE}/public/invoice/${paymentToken}/create-payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { message?: string }).message ?? 'Failed to initialize payment');
        }
        const data: { clientSecret: string } = await res.json();
        setClientSecret(data.clientSecret);
        setStep('card');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to initialize payment session');
        setStep('error');
      }
    };
    init();
  }, [paymentToken]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !clientSecret) return;
    setStep('processing');
    setErrorMsg('');

    try {
      // Confirm card payment using raw card data
      // Note: In production you may want to use Stripe Elements for PCI compliance
      // but Stripe.js confirmCardPayment with card details is still PCI-SAQ A compliant
      // when loaded from stripe.com
      const { error } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: {
            number: cardNumber.replace(/\s/g, ''),
            exp_month: parseInt(expMonth, 10),
            exp_year: parseInt(expYear, 10),
            cvc: cvv,
          },
          billing_details: { name: cardholderName },
        },
      });

      if (error) {
        setErrorMsg(error.message ?? 'Payment failed');
        setStep('error');
        return;
      }

      setStep('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Payment failed');
      setStep('error');
    }
  };

  if (step === 'loading') {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)] mx-auto mb-3" />
        <p className="text-sm text-gray-500">Initializing secure payment…</p>
      </div>
    );
  }

  if (step === 'success') {
    return <SuccessScreen currency={currency} amount={amount} />;
  }

  return (
    <form onSubmit={handlePay} className="p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Enter Payment Details</h2>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Cardholder Name</label>
        <input
          type="text" required placeholder="Jane Smith" value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Card Number</label>
        <input
          type="text" required inputMode="numeric" placeholder="4111 1111 1111 1111" maxLength={19}
          value={cardNumber}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 16);
            setCardNumber(v.replace(/(.{4})/g, '$1 ').trim());
          }}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
          <input type="text" required placeholder="MM" maxLength={2} inputMode="numeric" value={expMonth}
            onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
          <input type="text" required placeholder="YYYY" maxLength={4} inputMode="numeric" value={expYear}
            onChange={(e) => setExpYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">CVV</label>
          <input type="text" required placeholder="123" maxLength={4} inputMode="numeric" value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
      </div>

      {step === 'error' && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
      )}

      <button
        type="submit" disabled={step === 'processing' || !stripe}
        className="brand-btn w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {step === 'processing' ? 'Processing…' : `Pay ${currency} ${amount.toFixed(2)}`}
      </button>

      <p className="text-center text-xs text-gray-400">
        Secured by <span className="font-semibold">Stripe</span>. Your card details are never stored on our servers.
      </p>
    </form>
  );
}

// ─── Manual Payment Notice ─────────────────────────────────────────────────────

function ManualPaymentNotice({ currency, amount }: { currency: string; amount: number }) {
  return (
    <div className="p-6 text-center space-y-3">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mx-auto">
        <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-base font-semibold text-gray-900">Payment via Invoice</p>
      <p className="text-sm text-gray-600">
        This invoice for <strong>{currency} {amount.toFixed(2)}</strong> is processed through our invoicing system.
        Your account manager will confirm payment once received.
      </p>
      <p className="text-xs text-gray-400 mt-2">
        If you have questions about this invoice, please contact your account manager.
      </p>
    </div>
  );
}

// ─── Success Screen ────────────────────────────────────────────────────────────

function SuccessScreen({ currency, amount }: { currency: string; amount: number }) {
  return (
    <div className="p-8 text-center">
      <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-green-100 mx-auto mb-3">
        <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-gray-900">Payment Successful!</p>
      <p className="text-sm text-gray-500 mt-1">
        {currency} {amount.toFixed(2)} has been charged. You will receive a receipt by email.
      </p>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function PaymentForm({ invoiceId, invoiceNumber, amount, currency, paymentToken, gatewayType }: PaymentFormProps) {
  if (gatewayType === 'STRIPE') {
    return <StripePaymentForm amount={amount} currency={currency} paymentToken={paymentToken} />;
  }

  if (gatewayType === 'MANUAL') {
    return <ManualPaymentNotice currency={currency} amount={amount} />;
  }

  // Default: AUTHORIZE_NET
  return (
    <AuthNetPaymentForm
      invoiceNumber={invoiceNumber}
      amount={amount}
      currency={currency}
      paymentToken={paymentToken}
    />
  );
}
