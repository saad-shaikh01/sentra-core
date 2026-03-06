'use client';

import { useState, useEffect, useRef } from 'react';

interface PaymentFormProps {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  saleId: string;
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

type Step = 'card' | 'processing' | 'success' | 'error';

export function PaymentForm({ invoiceId, invoiceNumber, amount, currency, saleId }: PaymentFormProps) {
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
          const res = await fetch(`${API_BASE}/sales/${saleId}/charge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount,
              invoiceNumber,
              invoiceId,
              opaqueData: response.opaqueData,
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { message?: string }).message ?? 'Payment failed');
          }

          setStep('success');
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Payment failed');
          setStep('error');
        }
      },
    );
  };

  if (step === 'success') {
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

  return (
    <form onSubmit={handlePay} className="p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Enter Payment Details</h2>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Cardholder Name</label>
        <input
          type="text"
          required
          placeholder="Jane Smith"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Card Number</label>
        <input
          type="text"
          required
          inputMode="numeric"
          placeholder="4111 1111 1111 1111"
          maxLength={19}
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
            type="text"
            required
            placeholder="MM"
            maxLength={2}
            inputMode="numeric"
            value={expMonth}
            onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
          <input
            type="text"
            required
            placeholder="YYYY"
            maxLength={4}
            inputMode="numeric"
            value={expYear}
            onChange={(e) => setExpYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">CVV</label>
          <input
            type="text"
            required
            placeholder="123"
            maxLength={4}
            inputMode="numeric"
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
      </div>

      {step === 'error' && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={step === 'processing'}
        className="brand-btn w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {step === 'processing' ? 'Processing…' : `Pay ${currency} ${amount.toFixed(2)}`}
      </button>
    </form>
  );
}
