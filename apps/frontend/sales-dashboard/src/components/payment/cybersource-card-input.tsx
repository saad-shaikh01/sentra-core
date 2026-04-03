'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

export interface CyberSourceCardInputHandle {
  tokenize: () => Promise<{ dataDescriptor: string; dataValue: string }>;
}

// Flex Microform 0.11: Flex is a constructor — `new Flex(captureContext)` returns an instance,
// then call `.microform()` on that instance to get the Microform object.
interface FlexMicroform {
  createField: (type: string, options: Record<string, unknown>) => { load: (selector: string) => void };
  createToken: (
    options: { expirationMonth: string; expirationYear: string },
    callback: (err: unknown, token: string) => void,
  ) => void;
}
interface FlexInstance {
  microform: (options?: Record<string, unknown>) => FlexMicroform;
}
interface FlexConstructor {
  new (captureContext: string): FlexInstance;
}

declare global {
  interface Window {
    Flex?: FlexConstructor;
  }
}

const FLEX_MICROFORM_URL = 'https://flex.cybersource.com/cybersource/assets/microform/0.11/flex-microform.min.js';

function loadFlexScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Flex) { resolve(); return; }
    const existing = document.querySelector(`script[src="${FLEX_MICROFORM_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Flex Microform')));
      return;
    }
    const script = document.createElement('script');
    script.src = FLEX_MICROFORM_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Flex Microform'));
    document.body.appendChild(script);
  });
}

export const CyberSourceCardInput = forwardRef<CyberSourceCardInputHandle>((_, ref) => {
  const [expiry, setExpiry] = useState(''); // MM/YY
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const microformRef = useRef<FlexMicroform | null>(null);
  // Unique IDs so multiple instances don't collide
  const uid = useRef(`cs-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadFlexScript();
        const res = await api.getSalesCyberSourceCaptureContext() as any;
        const captureContext: string = res?.data?.captureContext ?? res?.captureContext ?? res;
        if (cancelled || typeof captureContext !== 'string') return;

        // Flex 0.11: constructor pattern — new Flex(captureContext) → instance → .microform()
        const flexInstance = new window.Flex!(captureContext);
        const microform = flexInstance.microform();

        const fieldStyle = {
          input: { 'font-size': '14px', 'font-family': 'inherit', color: 'inherit' },
          valid: { color: '#22c55e' },
          invalid: { color: '#ef4444' },
        };

        microform.createField('number', { placeholder: '1234 5678 9012 3456', styles: fieldStyle })
          .load(`#${uid.current}-number`);
        microform.createField('securityCode', { placeholder: '123', styles: fieldStyle })
          .load(`#${uid.current}-cvv`);

        microformRef.current = microform;
        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to initialize payment form');
          setStatus('error');
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  const handleExpiryChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setExpiry(digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`);
  };

  useImperativeHandle(ref, () => ({
    tokenize(): Promise<{ dataDescriptor: string; dataValue: string }> {
      return new Promise((resolve, reject) => {
        if (!microformRef.current) {
          reject(new Error('Payment form not ready'));
          return;
        }
        const [month, yearShort] = expiry.split('/');
        const year = yearShort?.length === 2 ? `20${yearShort}` : (yearShort ?? '');
        if (!month || !year) {
          reject(new Error('Please enter expiry date (MM/YY)'));
          return;
        }
        microformRef.current.createToken(
          { expirationMonth: month.padStart(2, '0'), expirationYear: year },
          (err, token) => {
            if (err) {
              reject(new Error(err instanceof Error ? err.message : 'Card tokenization failed'));
            } else {
              resolve({ dataDescriptor: 'COMMON.VCO.ONLINE.PAYMENT', dataValue: token });
            }
          },
        );
      });
    },
  }));

  if (status === 'error') {
    return <p className="text-xs text-destructive">{errorMsg ?? 'Failed to load payment form'}</p>;
  }

  return (
    <div className="space-y-3">
      {status === 'loading' && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Initializing secure card fields...
        </p>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Card Number</Label>
        <div
          id={`${uid.current}-number`}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background"
          style={{ minHeight: '40px' }}
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
          <div
            id={`${uid.current}-cvv`}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background"
            style={{ minHeight: '40px' }}
          />
        </div>
      </div>
    </div>
  );
});

CyberSourceCardInput.displayName = 'CyberSourceCardInput';
