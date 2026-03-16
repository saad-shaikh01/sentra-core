# SM-FE-009 — Brand-Aware Public Payment Page (No Auth Required)

## Ticket Metadata

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Ticket ID    | SM-FE-009                                                   |
| Title        | Brand-Aware Public Payment Page (No Auth Required)          |
| Phase        | Phase 2 — Frontend                                          |
| Priority     | High                                                        |
| Status       | [ ] Not Started                                             |
| Depends On   | SM-BE-014 (public invoice detail endpoint), SM-BE-015 (public payment charge endpoint) |

---

## Purpose

Provide a client-facing payment page that resolves a branded invoice and accepts card payment with no login required. The page is accessible from a short link sent to the client (e.g., in an email or WhatsApp message).

---

## User / Business Outcome

Clients can pay invoices from any device without creating an account. The page reflects the correct brand identity so clients know who they are paying.

---

## Exact Scope

1. Next.js page at `/payment/[paymentToken]` (public, no auth middleware)
2. Page fetches invoice details from `GET /public/invoice/:token`
3. Renders brand logo + name, invoice number, amount, due date, service description
4. Integrates Authorize.net Accept.js (loaded via `<script>` tag, not npm) for card tokenization
5. User fills in card number, expiry, CVV → clicks "Pay Now" → Accept.js tokenizes → sends opaqueData to `POST /public/invoice/:token/pay`
6. Shows success state (with invoice number + amount paid)
7. Shows failure state with user-friendly message + retry option
8. Shows "already paid" state if invoice is already PAID
9. Applies brand: use brand.name in page title and header; use brand.logoUrl as logo image
10. Fully responsive (mobile-first)
11. Exclude from authenticated app layout (no sidebar, no nav bar, standalone page)

---

## Out of Scope

- Saved cards / card management
- Multiple invoice payment in one session
- Client account creation from payment page
- PDF invoice download (Phase 3)

---

## Frontend Tasks

1. Create Next.js page: `app/payment/[paymentToken]/page.tsx` (or `pages/payment/[paymentToken].tsx` depending on app router vs pages router — check existing project structure)
2. Exclude from auth middleware (check `middleware.ts` or auth HOC — add `/payment/*` to public routes)
3. Create components:
   - `PaymentPageLayout` — standalone layout (no sidebar, no top nav)
   - `InvoiceSummaryCard` — shows brand logo, invoice number, amount, due date, service description
   - `PaymentForm` — card fields (Accept.js hosted fields or raw inputs that Accept.js tokenizes)
   - `PaymentStatus` — success / failure / already-paid states
4. Load Accept.js script:
   - Test: `https://jstest.authorize.net/v1/Accept.js`
   - Production: `https://js.authorize.net/v1/Accept.js`
   - Use Next.js `<Script>` component with `strategy="beforeInteractive"` or lazy-load before submit
5. Card tokenization flow:
   ```
   User fills card fields
   → User clicks "Pay Now"
   → Frontend calls Accept.dispatchData({ cardData: { cardNumber, month, year, cardCode }, authData: { apiLoginID, clientKey } })
   → Accept.js returns opaqueData callback
   → Frontend posts { opaqueData, payer } to POST /public/invoice/:token/pay
   → Handle response
   ```
6. Environment variables needed: `NEXT_PUBLIC_AUTHORIZE_NET_API_LOGIN_ID`, `NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY`, `NEXT_PUBLIC_AUTHORIZE_NET_ENV` (sandbox|production)
7. API calls use `fetch` (no React Query needed — simple one-time calls on this page)
8. Write component tests:
   - Renders invoice summary correctly (mock API response)
   - Shows "already paid" when alreadyPaid:true
   - Shows success state after successful payment
   - Shows error + retry after failed payment
   - Renders brand logo (or fallback if no logoUrl)
   - Page renders with no authenticated session (no auth header in API calls)

---

## Backend Tasks

None for this ticket. All backend work is in SM-BE-014 and SM-BE-015.

---

## Schema / Migration Impact

None.

---

## API / Contracts Affected

- Consumes: `GET /public/invoice/:token` → `PublicInvoiceDto`
- Consumes: `POST /public/invoice/:token/pay` → `PublicPaymentDto` → payment response

---

## Acceptance Criteria

1. Navigating to `/payment/{validToken}` with no auth session renders the invoice summary page
2. Brand name and logo (if available) render in the page header
3. Clicking "Pay Now" with valid card details tokenizes via Accept.js and sends opaqueData to backend
4. Successful payment renders success state with invoice number and amount charged
5. Failed payment renders error message with "Try Again" button
6. Invoice already paid renders "This invoice has already been paid" state
7. Invalid token (404 from API) renders a friendly error page ("Payment link not found")
8. Page is fully usable on mobile (320px viewport)
9. No authenticated session required — no auth headers sent, no redirect to login
10. Page uses correct Accept.js environment (test vs production) based on `NEXT_PUBLIC_AUTHORIZE_NET_ENV`

---

## Edge Cases

1. Brand has no logo → show brand name in text only
2. API returns 404 → show "Link expired or not found" message (no retry, just contact support message)
3. Accept.js fails to load (network error) → show "Payment temporarily unavailable" error
4. User submits form twice before response → disable button after first click, re-enable only on failure
5. `alreadyPaid: true` — do not show payment form; show paid confirmation instead

---

## Testing Requirements

- Component tests (React Testing Library): all acceptance criteria
- E2E test (Playwright/Cypress optional): full payment flow with Authorize.net sandbox
- Visual test: brand logo renders; success state; failure state; mobile layout
- Manual QA: open link on mobile browser, complete payment with Authorize.net test card `4111111111111111`

---

## Verification Steps

- [ ] `/payment/{validToken}` loads with no auth redirect
- [ ] Brand name + logo render from API response
- [ ] Invoice number, amount, due date display correctly
- [ ] Accept.js loads (check browser console for errors)
- [ ] Test card payment completes successfully (Authorize.net sandbox)
- [ ] Success state shown after payment
- [ ] Failed card (use Authorize.net test decline card) shows error + retry button
- [ ] Already-paid invoice shows "already paid" state, no payment form
- [ ] 404 token shows friendly error
- [ ] Mobile responsive (320px viewport — check in browser devtools)
- [ ] No session cookie or Authorization header is sent with API requests

---

## Rollback / Risk Notes

- Risk: Accept.js requires the `clientKey` in the frontend. This is a publishable key (not the transaction key) — safe for frontend exposure. Never expose `transactionKey` or `loginId`+`transactionKey` combo in frontend.
- Risk: If Accept.js CDN is down, payments cannot proceed. Phase 2 mitigation: fallback hosted payment page on Authorize.net.
- Risk: Payment page URL (the token) must be treated as a secret link — do not index via search engines (add `noindex` meta tag and exclude from sitemap).
