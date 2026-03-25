'use client';

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface OpaqueData {
  dataDescriptor: string;
  dataValue: string;
}

export interface AuthNetCardInputHandle {
  tokenize: () => Promise<OpaqueData>;
}

declare global {
  interface Window {
    Accept?: {
      dispatchData: (
        secureData: {
          authData: { clientKey: string; apiLoginID: string };
          cardData: { cardNumber: string; month: string; year: string; cardCode: string };
        },
        callback: (response: {
          messages: { resultCode: string; message: Array<{ code: string; text: string }> };
          opaqueData?: OpaqueData;
        }) => void,
      ) => void;
    };
  }
}

function loadAcceptJs(env: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Accept) { resolve(); return; }
    const src = env === 'PRODUCTION'
      ? 'https://js.authorize.net/v1/Accept.js'
      : 'https://jstest.authorize.net/v1/Accept.js';
    const script = document.createElement('script');
    script.src = src;
    script.charset = 'utf-8';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Accept.js'));
    document.body.appendChild(script);
  });
}

export const AuthNetCardInput = forwardRef<AuthNetCardInputHandle>((_, ref) => {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState(''); // MM/YY
  const [cvv, setCvv] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_AUTHORIZE_NET_ENV ?? 'SANDBOX';
    loadAcceptJs(env).then(() => setReady(true)).catch(() => {});
  }, []);

  // Format expiry input as MM/YY
  const handleExpiryChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) {
      setExpiry(digits);
    } else {
      setExpiry(`${digits.slice(0, 2)}/${digits.slice(2)}`);
    }
  };

  useImperativeHandle(ref, () => ({
    tokenize(): Promise<OpaqueData> {
      return new Promise((resolve, reject) => {
        if (!ready || !window.Accept) {
          reject(new Error('Accept.js not loaded yet'));
          return;
        }
        const [month, yearShort] = expiry.split('/');
        const year = yearShort?.length === 2 ? `20${yearShort}` : yearShort ?? '';

        if (!cardNumber.replace(/\s/g, '') || !month || !year || !cvv) {
          reject(new Error('Please fill in all card fields'));
          return;
        }

        window.Accept.dispatchData(
          {
            authData: {
              clientKey: process.env.NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY ?? '',
              apiLoginID: process.env.NEXT_PUBLIC_AUTHORIZE_NET_API_LOGIN_ID ?? '',
            },
            cardData: {
              cardNumber: cardNumber.replace(/\s/g, ''),
              month,
              year,
              cardCode: cvv,
            },
          },
          (response) => {
            if (response.messages.resultCode === 'Error') {
              reject(new Error(response.messages.message[0]?.text ?? 'Card tokenization failed'));
            } else if (response.opaqueData) {
              resolve(response.opaqueData);
            } else {
              reject(new Error('No opaque data returned'));
            }
          },
        );
      });
    },
  }));

  // Format card number with spaces every 4 digits
  const handleCardNumberChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    setCardNumber(digits.replace(/(.{4})/g, '$1 ').trim());
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Card Number</Label>
        <Input
          placeholder="1234 5678 9012 3456"
          value={cardNumber}
          onChange={(e) => handleCardNumberChange(e.target.value)}
          maxLength={19}
          inputMode="numeric"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Expiry (MM/YY)</Label>
          <Input
            placeholder="12/26"
            value={expiry}
            onChange={(e) => handleExpiryChange(e.target.value)}
            maxLength={5}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">CVV</Label>
          <Input
            placeholder="123"
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
            inputMode="numeric"
          />
        </div>
      </div>
    </div>
  );
});

AuthNetCardInput.displayName = 'AuthNetCardInput';
