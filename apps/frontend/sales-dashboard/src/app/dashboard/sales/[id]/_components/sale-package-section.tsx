'use client';

import { ISalePackage } from '@sentra-core/types';
import { CheckCircle2, Package } from 'lucide-react';

interface SalePackageSectionProps {
  salePackage: ISalePackage;
  currency?: string;
}

export function SalePackageSection({ salePackage, currency = 'USD' }: SalePackageSectionProps) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: salePackage.currency || currency }).format(n);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Package</h3>
      </div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-semibold text-base">{salePackage.name}</p>
          {salePackage.category && (
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 border border-primary/20 text-primary">
              {salePackage.category}
            </span>
          )}
        </div>
        <p className="text-xl font-bold text-primary">{fmt(salePackage.price)}</p>
      </div>
      {salePackage.services.length > 0 && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          {salePackage.services.sort((a, b) => a.order - b.order).map((service) => (
            <div key={service.id} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
              <span className="text-sm">{service.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
