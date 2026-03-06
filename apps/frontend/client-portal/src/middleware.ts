import { NextRequest, NextResponse } from 'next/server';

const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:3001/api';

interface BrandConfig {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  name?: string;
}

async function fetchBrandByDomain(domain: string): Promise<BrandConfig | null> {
  try {
    const res = await fetch(`${CORE_API_URL}/brands/public/by-domain?domain=${encodeURIComponent(domain)}`, {
      next: { revalidate: 300 }, // cache 5 min
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply branding to payment routes
  if (!pathname.startsWith('/pay/')) {
    return NextResponse.next();
  }

  const host = request.headers.get('host') ?? '';
  const domain = host.split(':')[0]; // strip port

  const brand = await fetchBrandByDomain(domain);

  const response = NextResponse.next();

  if (brand) {
    // Pass brand config as response headers (read by layout)
    if (brand.primaryColor) response.headers.set('x-brand-primary', brand.primaryColor);
    if (brand.secondaryColor) response.headers.set('x-brand-secondary', brand.secondaryColor);
    if (brand.logoUrl) response.headers.set('x-brand-logo', brand.logoUrl);
    if (brand.faviconUrl) response.headers.set('x-brand-favicon', brand.faviconUrl);
    if (brand.name) response.headers.set('x-brand-name', brand.name);
  }

  return response;
}

export const config = {
  matcher: ['/pay/:path*'],
};
