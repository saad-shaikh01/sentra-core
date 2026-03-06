/**
 * Feature flags — COMM-FE-020
 *
 * NEXT_PUBLIC_COMM_ENABLED: set to 'false' to disable all comm features.
 * Defaults to enabled when not set (backwards-compatible).
 */
export const COMM_ENABLED = process.env.NEXT_PUBLIC_COMM_ENABLED !== 'false';
