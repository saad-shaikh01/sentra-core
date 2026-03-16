# SM-BE-011 — Authorize.net ARB Webhook Receiver

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Ticket ID      | SM-BE-011                                  |
| Title          | Authorize.net ARB Webhook Receiver         |
| Phase          | 1 — Backend                                |
| Priority       | P0 — Critical                              |
| Status         | [ ] Not Started                            |
| Estimate       | 6 hours                                    |
| Assignee       | TBD                                        |

---

## Purpose

Authorize.net sends asynchronous notifications for subscription payments, voids, refunds, and fraud decisions. Without a webhook receiver, these events are never processed: subscription payments go unrecorded, invoice statuses remain UNPAID after payment, and sale statuses never advance from PENDING to ACTIVE. This ticket builds the webhook receiver with HMAC-SHA512 signature verification and handlers for all relevant event types.

---

## User / Business Outcome

- Subscription payment confirmations are automatically recorded without manual staff action.
- Sale status advances from PENDING to ACTIVE when the first subscription payment succeeds.
- Invoice statuses are updated to PAID when corresponding payments arrive.
- Payment failures trigger notifications (handled in SM-BE-012).
- Financial data in the CRM reflects real-time gateway state.

---

## Exact Scope

### In Scope

1. Create `WebhooksModule` with `WebhooksController` and `WebhooksService`.
2. Register `WebhooksModule` in `AppModule`.
3. Implement HMAC-SHA512 signature verification using `AUTHORIZE_NET_SIGNATURE_KEY` env var.
4. Configure raw body parsing for the `/webhooks/authorize-net` route.
5. Handle the following Authorize.net event types:
   - `net.authorize.payment.authcapture.created` → PAYMENT_RECEIVED
   - `net.authorize.payment.capture.created` → PAYMENT_RECEIVED
   - `net.authorize.payment.void.created` → NOTE or STATUS_CHANGE
   - `net.authorize.payment.refund.created` → REFUND_ISSUED
   - `net.authorize.payment.fraud.approved` → NOTE
   - `net.authorize.payment.fraud.declined` → PAYMENT_FAILED
6. For each payment success event: look up sale, create `PaymentTransaction`, update `Invoice` status, update `Sale` status if applicable.
7. Log `SaleActivity` for all handled events.
8. Return HTTP 200 immediately for all processed and unhandled events (Authorize.net expects 200 or it retries).

### Out of Scope

- Subscription plan change events (future phase).
- Email notifications triggered by webhook events (handled in SM-BE-012 which listens to service events).
- Google Pub/Sub or Webhooks.site alternative delivery modes.
- Idempotency guarantee for duplicate delivery (basic deduplication by `transactionId` only).

---

## Backend Tasks

### 1. Create WebhooksModule Directory Structure

```
apps/backend/core-service/src/modules/webhooks/
├── webhooks.module.ts
├── webhooks.controller.ts
├── webhooks.service.ts
└── dto/
    └── authorize-net-webhook.dto.ts
```

### 2. Configure Raw Body Middleware

**File:** `apps/backend/core-service/src/main.ts`

Authorize.net signature verification requires access to the raw (unparsed) request body. The signature is computed over the raw bytes, not the parsed JSON.

Add the following before calling `app.useGlobalPipes()`:

```typescript
import * as bodyParser from 'body-parser';

// Raw body for webhook signature verification
app.use(
  '/webhooks/authorize-net',
  bodyParser.raw({ type: 'application/json' }),
);

// Regular JSON parsing for all other routes
app.use(bodyParser.json());
```

**Alternative approach (if the app already uses a global JSON bodyParser):** Use NestJS middleware to save the raw body on the request object before parsing. Implement a custom middleware:

```typescript
// apps/backend/core-service/src/common/middleware/raw-body.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Save raw body before Express parses JSON
    req['rawBody'] = '';
    req.on('data', (chunk) => {
      req['rawBody'] += chunk;
    });
    req.on('end', () => next());
  }
}
```

Register in `AppModule` for the webhook path only:
```typescript
configure(consumer: MiddlewareConsumer) {
  consumer.apply(RawBodyMiddleware).forRoutes('/webhooks/authorize-net');
}
```

Use whichever approach is consistent with how the existing codebase handles raw body needs.

### 3. Create Authorize.net Webhook DTO

**File:** `apps/backend/core-service/src/modules/webhooks/dto/authorize-net-webhook.dto.ts`

```typescript
export interface AuthorizeNetWebhookPayload {
  notificationId: string;
  eventType: string;
  eventDate: string;
  webhookId: string;
  payload: {
    responseCode?: number;
    authCode?: string;
    avsResponse?: string;
    authAmount?: number;
    entityName?: string;
    id?: string;             // transId from Authorize.net
    subscriptionId?: string;
    subscriptionPayNum?: number;
    invoiceNumber?: string;
  };
}
```

### 4. Implement Signature Verification in WebhooksService

**File:** `apps/backend/core-service/src/modules/webhooks/webhooks.service.ts`

```typescript
import * as crypto from 'crypto';

verifyAuthorizeNetSignature(rawBody: string, signatureHeader: string): boolean {
  const signatureKey = this.configService.get<string>('AUTHORIZE_NET_SIGNATURE_KEY');

  if (!signatureKey) {
    this.logger.error('AUTHORIZE_NET_SIGNATURE_KEY is not configured');
    return false;
  }

  // Header format: "sha512=<hex-digest>"
  const [algorithm, providedHex] = signatureHeader.split('=');

  if (algorithm !== 'sha512' || !providedHex) {
    return false;
  }

  const computedHmac = crypto
    .createHmac('sha512', signatureKey)
    .update(rawBody, 'utf8')
    .digest('hex')
    .toUpperCase();

  const providedHmacUpper = providedHex.toUpperCase();

  // Use timingSafeEqual to prevent timing attacks
  const computedBuffer = Buffer.from(computedHmac, 'hex');
  const providedBuffer = Buffer.from(providedHmacUpper, 'hex');

  if (computedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, providedBuffer);
}
```

### 5. Implement Webhook Controller

**File:** `apps/backend/core-service/src/modules/webhooks/webhooks.controller.ts`

```typescript
import { Controller, Post, Req, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('authorize-net')
  @HttpCode(200)
  async handleAuthorizeNetWebhook(
    @Req() req: Request,
    @Headers('x-anet-signature') signatureHeader: string,
  ): Promise<{ received: true }> {
    const rawBody = req['rawBody'] as string ?? req.body?.toString() ?? '';

    // Verify signature
    const isValid = this.webhooksService.verifyAuthorizeNetSignature(
      rawBody,
      signatureHeader ?? '',
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Parse payload
    let payload: AuthorizeNetWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Return 200 to prevent retries for malformed payloads
      return { received: true };
    }

    // Process asynchronously — do not await to avoid gateway timeout
    this.webhooksService.processEvent(payload).catch((err) => {
      this.logger.error('Webhook processing error', err);
    });

    return { received: true };
  }
}
```

**Important:** Return HTTP 200 immediately, even for unhandled event types. Processing errors must be logged but must not cause a non-200 response (which would trigger Authorize.net to retry).

### 6. Implement Event Handlers in WebhooksService

**File:** `apps/backend/core-service/src/modules/webhooks/webhooks.service.ts`

```typescript
async processEvent(payload: AuthorizeNetWebhookPayload): Promise<void> {
  switch (payload.eventType) {
    case 'net.authorize.payment.authcapture.created':
    case 'net.authorize.payment.capture.created':
      await this.handlePaymentReceived(payload);
      break;

    case 'net.authorize.payment.void.created':
      await this.handlePaymentVoided(payload);
      break;

    case 'net.authorize.payment.refund.created':
      await this.handleRefundCreated(payload);
      break;

    case 'net.authorize.payment.fraud.approved':
      await this.handleFraudApproved(payload);
      break;

    case 'net.authorize.payment.fraud.declined':
      await this.handleFraudDeclined(payload);
      break;

    default:
      this.logger.warn(`Unhandled Authorize.net event type: ${payload.eventType}`);
      break;
  }
}
```

### 7. Implement `handlePaymentReceived()`

```typescript
private async handlePaymentReceived(payload: AuthorizeNetWebhookPayload): Promise<void> {
  const { id: anetTransactionId, subscriptionId, authAmount } = payload.payload;

  // Deduplication: check if this transactionId has already been processed
  const existing = await this.prisma.paymentTransaction.findFirst({
    where: { transactionId: anetTransactionId },
  });
  if (existing) {
    this.logger.warn(`Duplicate webhook for transactionId ${anetTransactionId}. Skipping.`);
    return;
  }

  // Look up the Sale by subscriptionId (if subscription payment)
  let sale = subscriptionId
    ? await this.prisma.sale.findFirst({
        where: { subscriptionId, deletedAt: null },
        include: { invoices: { where: { status: 'UNPAID' }, orderBy: { dueDate: 'asc' } } },
      })
    : null;

  if (!sale) {
    this.logger.warn(
      `No sale found for subscriptionId=${subscriptionId}, transactionId=${anetTransactionId}. Skipping.`,
    );
    return;
  }

  await this.prisma.$transaction(async (tx) => {
    // 1. Create PaymentTransaction record
    const transaction = await tx.paymentTransaction.create({
      data: {
        saleId: sale.id,
        type: TransactionType.CHARGE,  // Use existing CHARGE or AUTH_CAPTURE type — check enum
        amount: authAmount ? new Prisma.Decimal(authAmount) : new Prisma.Decimal(0),
        status: TransactionStatus.SUCCESS,
        transactionId: anetTransactionId,
        responseCode: String(payload.payload.responseCode ?? ''),
        responseMessage: null,
      },
    });

    // 2. Match and update Invoice status
    const unpaidInvoice = sale.invoices[0]; // Match oldest unpaid invoice
    if (unpaidInvoice) {
      await tx.invoice.update({
        where: { id: unpaidInvoice.id },
        data: { status: InvoiceStatus.PAID },
      });

      // Log INVOICE_UPDATED activity
      await this.salesService.logActivityExternal(tx, sale.id, 'system', SaleActivityType.INVOICE_UPDATED, {
        invoiceId: unpaidInvoice.id,
        invoiceNumber: unpaidInvoice.invoiceNumber,
        oldStatus: 'UNPAID',
        newStatus: 'PAID',
        trigger: 'webhook',
      });
    }

    // 3. Advance PENDING sale to ACTIVE on first successful payment
    if (sale.status === SaleStatus.PENDING) {
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.ACTIVE },
      });

      await this.salesService.logActivityExternal(tx, sale.id, 'system', SaleActivityType.STATUS_CHANGE, {
        from: SaleStatus.PENDING,
        to: SaleStatus.ACTIVE,
        trigger: 'subscription_activated',
        transactionId: anetTransactionId,
      });
    }

    // 4. Log PAYMENT_RECEIVED activity
    await this.salesService.logActivityExternal(tx, sale.id, 'system', SaleActivityType.PAYMENT_RECEIVED, {
      transactionId: anetTransactionId,
      amount: authAmount ?? 0,
      subscriptionId: subscriptionId ?? null,
      invoiceId: unpaidInvoice?.id ?? null,
    });
  });
}
```

**Note on `logActivityExternal()`:** The `logActivity()` helper in SM-BE-007 is a private method on `SalesService`. For use in `WebhooksService`, either:
- Make it a public method (or `@Injectable()` helper service).
- OR duplicate the Prisma call inline in `WebhooksService`.
- **Recommended:** Extract `logActivity()` into a dedicated `SaleActivityService` that both `SalesService` and `WebhooksService` can inject.

Document the chosen approach in the PR.

### 8. Implement `handlePaymentVoided()`

```typescript
private async handlePaymentVoided(payload: AuthorizeNetWebhookPayload): Promise<void> {
  const { id: anetTransactionId, subscriptionId } = payload.payload;

  const sale = await this.findSaleByTransactionOrSubscription(
    anetTransactionId,
    subscriptionId,
  );
  if (!sale) return;

  await this.prisma.paymentTransaction.create({
    data: {
      saleId: sale.id,
      type: TransactionType.VOID,  // Add VOID to enum if needed
      amount: new Prisma.Decimal(0),
      status: TransactionStatus.SUCCESS,
      transactionId: anetTransactionId,
      responseCode: null,
      responseMessage: null,
    },
  });

  await this.salesService.logActivityExternal(
    this.prisma, sale.id, 'system', SaleActivityType.NOTE, {
      event: 'payment_voided',
      transactionId: anetTransactionId,
    },
  );
}
```

### 9. Implement `handleRefundCreated()`

```typescript
private async handleRefundCreated(payload: AuthorizeNetWebhookPayload): Promise<void> {
  const { id: anetTransactionId, subscriptionId, authAmount } = payload.payload;

  const sale = await this.findSaleByTransactionOrSubscription(
    anetTransactionId,
    subscriptionId,
  );
  if (!sale) return;

  await this.prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.create({
      data: {
        saleId: sale.id,
        type: TransactionType.REFUND,
        amount: authAmount ? new Prisma.Decimal(authAmount) : new Prisma.Decimal(0),
        status: TransactionStatus.SUCCESS,
        transactionId: anetTransactionId,
        responseCode: null,
        responseMessage: 'Refund via gateway webhook',
      },
    });

    await this.salesService.logActivityExternal(tx, sale.id, 'system', SaleActivityType.REFUND_ISSUED, {
      amount: authAmount ?? 0,
      type: 'gateway_webhook',
      transactionId: anetTransactionId,
    });
  });
}
```

### 10. Implement `handleFraudApproved()` and `handleFraudDeclined()`

```typescript
private async handleFraudApproved(payload: AuthorizeNetWebhookPayload): Promise<void> {
  const { id: anetTransactionId, subscriptionId } = payload.payload;
  const sale = await this.findSaleByTransactionOrSubscription(anetTransactionId, subscriptionId);
  if (!sale) return;

  await this.salesService.logActivityExternal(
    this.prisma, sale.id, 'system', SaleActivityType.NOTE, {
      event: 'fraud_review_approved',
      transactionId: anetTransactionId,
    },
  );
}

private async handleFraudDeclined(payload: AuthorizeNetWebhookPayload): Promise<void> {
  const { id: anetTransactionId, subscriptionId, authAmount } = payload.payload;
  const sale = await this.findSaleByTransactionOrSubscription(anetTransactionId, subscriptionId);
  if (!sale) return;

  await this.salesService.logActivityExternal(
    this.prisma, sale.id, 'system', SaleActivityType.PAYMENT_FAILED, {
      amount: authAmount ?? 0,
      reason: 'Fraud review declined',
      transactionId: anetTransactionId,
    },
  );
}
```

### 11. Implement `findSaleByTransactionOrSubscription()` Helper

```typescript
private async findSaleByTransactionOrSubscription(
  transactionId: string | undefined,
  subscriptionId: string | undefined,
): Promise<Sale | null> {
  if (subscriptionId) {
    const sale = await this.prisma.sale.findFirst({
      where: { subscriptionId, deletedAt: null },
      include: { invoices: { where: { status: 'UNPAID' }, orderBy: { dueDate: 'asc' } } },
    });
    if (sale) return sale;
  }

  if (transactionId) {
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { transactionId },
      include: { sale: { include: { invoices: { where: { status: 'UNPAID' } } } } },
    });
    if (transaction?.sale) return transaction.sale;
  }

  this.logger.warn(
    `Could not find sale for subscriptionId=${subscriptionId}, transactionId=${transactionId}`,
  );
  return null;
}
```

### 12. Register WebhooksModule in AppModule

**File:** `apps/backend/core-service/src/app/app.module.ts`

```typescript
import { WebhooksModule } from '../modules/webhooks/webhooks.module';

@Module({
  imports: [
    // ... existing modules ...
    WebhooksModule,
  ],
})
export class AppModule {}
```

---

## Frontend Tasks

None.

---

## Schema / Migration Impact

- No new models.
- Potential need to add `VOID` to `TransactionType` enum if the `handlePaymentVoided()` path is implemented and `VOID` does not exist. Check the enum first.
- `REFUND` may have been added in SM-BE-009. Coordinate to avoid duplicate migration.

---

## API / Contracts Affected

### New Endpoint: `POST /webhooks/authorize-net`

- **No authentication guard.** This endpoint must NOT require a JWT.
- **Signature verification** is the authentication mechanism.
- Returns HTTP 200 for all requests that pass signature verification, including unhandled event types.
- Returns HTTP 401 for requests with invalid or missing signature.

---

## Acceptance Criteria

1. `POST /webhooks/authorize-net` with a valid HMAC-SHA512 signature returns HTTP 200 with `{ received: true }`.
2. `POST /webhooks/authorize-net` with an invalid signature returns HTTP 401.
3. `POST /webhooks/authorize-net` with `AUTHORIZE_NET_SIGNATURE_KEY` not configured returns HTTP 401 (fail closed).
4. A `net.authorize.payment.authcapture.created` event creates a `PaymentTransaction` record with `status: 'SUCCESS'`.
5. A `net.authorize.payment.authcapture.created` event advances a PENDING sale to ACTIVE status.
6. A `net.authorize.payment.authcapture.created` event updates the oldest UNPAID invoice to PAID.
7. A `net.authorize.payment.authcapture.created` event logs a `PAYMENT_RECEIVED` activity.
8. A `net.authorize.payment.refund.created` event logs a `REFUND_ISSUED` activity.
9. A `net.authorize.payment.fraud.declined` event logs a `PAYMENT_FAILED` activity.
10. Duplicate `net.authorize.payment.authcapture.created` events with the same `transactionId` are deduplicated: the second event is silently ignored (no duplicate `PaymentTransaction` record).
11. An event for an unknown `subscriptionId` is logged as a warning and returns HTTP 200 without throwing an error.
12. Unhandled event types return HTTP 200 without error.
13. Processing errors in `processEvent()` do not cause a non-200 HTTP response (errors are logged, not propagated to the response).

---

## Edge Cases

1. **Authorize.net retries on non-200 response:** If the endpoint throws an unhandled exception and returns 500, Authorize.net will retry. The retry will hit deduplication and be skipped. However, the initial error must be investigated. Ensure all `processEvent()` errors are caught and logged.
2. **Event arrives before the Sale is created:** This can happen if there is a race condition between the subscription creation API call and the webhook. The `findSaleByTransactionOrSubscription` will return null. Log a warning and skip. The event is effectively lost. Phase 2 can add a retry queue.
3. **Invoice matching by oldest-unpaid:** This simple heuristic works for sequential installments but may fail if an out-of-sequence payment arrives. For Phase 1, this is acceptable. Document the limitation.
4. **`authAmount` in payload is null or 0:** Store `0` as the transaction amount and log a warning. Do not throw.
5. **Webhook arrives after sale is soft-deleted:** `findSaleByTransactionOrSubscription` includes `deletedAt: null`. The sale will not be found. Log a warning and skip.
6. **Raw body is unavailable:** If the raw body middleware fails to attach the body, signature verification will fail. The endpoint returns 401. Ensure the middleware is correctly registered before the JSON parser.

---

## Dependencies

- **SM-BE-007** — `logActivity()` helper (or a shared `SaleActivityService`).
- **SM-BE-009** — `TransactionType.REFUND` must exist.
- `AUTHORIZE_NET_SIGNATURE_KEY` must be added to `.env.example` and documented.

---

## Testing Requirements

### Unit Tests

**File:** `apps/backend/core-service/src/modules/webhooks/__tests__/webhooks.service.spec.ts`

- Test `verifyAuthorizeNetSignature()` with valid signature: returns `true`.
- Test `verifyAuthorizeNetSignature()` with tampered body: returns `false`.
- Test `verifyAuthorizeNetSignature()` with missing key: returns `false`.
- Test `handlePaymentReceived()`: verify `paymentTransaction.create` called, invoice updated, sale status updated.
- Test `handlePaymentReceived()` deduplication: if `paymentTransaction` already exists for `transactionId`, method returns early.
- Test `handleFraudDeclined()`: verify `PAYMENT_FAILED` activity logged.
- Test `processEvent()` with unknown event type: no exception thrown.

### Integration Tests

**File:** `apps/backend/core-service/src/modules/webhooks/__tests__/webhooks.integration.spec.ts`

- `POST /webhooks/authorize-net` with valid signature and `authcapture.created` event — HTTP 200; verify sale status, invoice status, and activity records.
- `POST /webhooks/authorize-net` with invalid signature — HTTP 401.
- `POST /webhooks/authorize-net` with unknown `subscriptionId` — HTTP 200, no crash.

### Manual QA Checks

- [ ] Set `AUTHORIZE_NET_SIGNATURE_KEY` in `.env`.
- [ ] Send a test webhook payload with correctly computed HMAC-SHA512 signature. Confirm HTTP 200.
- [ ] Send same payload with wrong signature. Confirm HTTP 401.
- [ ] After processing a `authcapture.created` event for a PENDING sale, confirm sale status is ACTIVE.
- [ ] Confirm oldest UNPAID invoice is now PAID.
- [ ] Confirm `PAYMENT_RECEIVED` activity logged.
- [ ] Send the same event twice (same `transactionId`). Confirm only one `PaymentTransaction` record exists.

---

## Verification Steps

- [ ] `WebhooksModule` created with `WebhooksController` and `WebhooksService`.
- [ ] `WebhooksModule` registered in `AppModule`.
- [ ] Raw body middleware registered for `/webhooks/authorize-net` route only.
- [ ] `verifyAuthorizeNetSignature()` uses `crypto.timingSafeEqual` for comparison.
- [ ] Controller returns HTTP 200 for all verified requests (including unhandled event types).
- [ ] Controller returns HTTP 401 for invalid signature.
- [ ] `processEvent()` errors are caught and logged, not propagated to HTTP response.
- [ ] `handlePaymentReceived()` deduplication by `transactionId` implemented.
- [ ] PENDING sale advances to ACTIVE on first payment.
- [ ] `AUTHORIZE_NET_SIGNATURE_KEY` documented in `.env.example`.
- [ ] All unit tests pass.
- [ ] All integration tests pass.
- [ ] `npx tsc --noEmit` passes.
- [ ] PR reviewed and approved.

---

## Rollback / Risk Notes

- **No schema migration** for core event handling. Schema changes limited to potential enum additions (coordinate with SM-BE-009 and SM-BE-010).
- **Risk: Raw body middleware conflicts with existing body parsing.** Test thoroughly that the raw body middleware does not interfere with other endpoints' JSON parsing. Apply the middleware only to the webhook path.
- **Risk: Signature key mismatch between environments.** Ensure `AUTHORIZE_NET_SIGNATURE_KEY` is consistent with the key configured in the Authorize.net merchant portal for each environment. A wrong key causes all webhooks to return 401 silently.
- **Risk: Event loss on error.** Processing errors result in lost events. Implement structured logging and alerting for webhook processing failures. Phase 2 can add a dead-letter queue.
