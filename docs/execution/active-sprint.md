# Active Sprint Focus

Last reviewed: February 28, 2026

Keep the next sprint focused on the shortest path to a stable usable core:

1. Repair auth/session reliability: fix token refresh handling, unify default API URLs, and align the password reset request contract.
2. Make payment actions executable: add payment-profile setup, then fix the cancel-subscription route mismatch and sale/invoice cache update behavior.
3. Close tenant-boundary gaps: validate all related foreign keys against the authenticated organization before writes.
4. Improve test signal: replace broken boilerplate tests and fix the Playwright environment assumptions so core flows can be verified repeatably.
