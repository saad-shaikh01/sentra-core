'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

export interface StripeCardInputHandle {
  tokenize: () => Promise<string>; // resolves to paymentMethodId (pm_xxx)
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '14px',
      color: '#f4f4f5',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      '::placeholder': { color: '#71717a' },
      backgroundColor: 'transparent',
    },
    invalid: { color: '#f87171' },
  },
};

export const StripeCardInput = forwardRef<StripeCardInputHandle>((_, ref) => {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    async tokenize() {
      if (!stripe || !elements) throw new Error('Stripe not loaded');
      const card = elements.getElement(CardElement);
      if (!card) throw new Error('Card element not found');
      const { paymentMethod, error } = await stripe.createPaymentMethod({ type: 'card', card });
      if (error) throw new Error(error.message ?? 'Card tokenization failed');
      return paymentMethod.id;
    },
  }));

  return (
    <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
      <CardElement options={CARD_ELEMENT_OPTIONS} />
    </div>
  );
});

StripeCardInput.displayName = 'StripeCardInput';
