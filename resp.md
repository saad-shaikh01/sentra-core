PS D:\Repositories\new crm\sentra-core> npx nx serve core-service

> nx run types:build  [existing outputs match the cache, left as is]

Compiling TypeScript files for project "types"...
Package type is set to "module" but "cjs" format is included. Going to use "esm" format instead. You can change the package type to "commonjs" or remove type in the package.json file.

> nx run core-service:build

ERROR in ./src/modules/payment-gateway/gateways/stripe.gateway.ts:24:43
TS2322: Type '"2025-01-27.acacia"' is not assignable to type '"2026-02-25.clover"'.
    22 |       throw new Error('STRIPE_SECRET_KEY is not configured. Cannot use Stripe gateway.');
    23 |     }
PS D:\Repositories\new crm\sentra-core> npx nx serve core-service
PS D:\Repositories\new crm\sentra-core> npx nx serve core-service

> nx run types:build  [existing outputs match the cache, left as is]

Compiling TypeScript files for project "types"...
Done compiling TypeScript files for project "types".
Package type is set to "module" but "cjs" format is included. Going to use "esm" format instead. You can change the package type to "commonjs" or remove type in the package.json file.

> nx run core-service:build

ERROR in ./src/modules/invoices/invoices.controller.ts:88:75
TS2339: Property 'SALES_AGENT' does not exist on type 'typeof UserRole'.
    86 |   @Post(':id/pay')
    87 |   @Throttle({ default: { ttl: 60000, limit: 10 } })
  > 88 |   @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.SALES_AGENT)
       |                                                                           ^^^^^^^^^^^
    89 |   pay(
    90 |     @Param('id') id: string,
    91 |     @CurrentUser('orgId') orgId: string,

ERROR in ./src/modules/invoices/invoices.service.ts:313:27
TS2339: Property 'SALES_AGENT' does not exist on type 'typeof UserRole'.
    311 |
    312 |     // SALES_AGENT: must be the assigned agent on this sale, and only allowed on MANUAL gateway
  > 313 |     if (role === UserRole.SALES_AGENT) {
        |                           ^^^^^^^^^^^
    314 |       if (sale.salesAgentId !== userId) {
    315 |         throw new ForbiddenException('You are not the assigned agent for this sale');
    316 |       }

webpack compiled with 2 errors (abdac851c999eb00)

—————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————

 NX   Cancelled running target serve for project core-service (1m)


PS D:\Repositories\new crm\sentra-core> 