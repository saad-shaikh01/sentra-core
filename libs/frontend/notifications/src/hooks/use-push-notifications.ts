'use client';

/**
 * Push notifications — stub implementation.
 * Returns static values so feature flag gating can depend on isSupported.
 * A full implementation would call navigator.serviceWorker + PushManager.
 */
export function usePushNotifications() {
  return {
    isSupported: false,
    isRegistered: false,
    requestPermission: async () => {
      // stub — no-op
    },
  };
}
