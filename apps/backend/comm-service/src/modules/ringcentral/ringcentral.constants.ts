export const RINGCENTRAL_EVENTS_QUEUE = 'ringcentral-events';
export const RINGCENTRAL_SUBSCRIPTIONS_QUEUE = 'ringcentral-subscriptions';

export const RINGCENTRAL_TELEPHONY_EVENT_FILTER =
  '/restapi/v1.0/account/~/extension/~/telephony/sessions';
export const RINGCENTRAL_SMS_EVENT_FILTER =
  '/restapi/v1.0/account/~/extension/~/message-store/instant?type=SMS';
export const RINGCENTRAL_SUBSCRIPTION_RENEWAL_FILTER =
  '/restapi/v1.0/subscription/~?threshold=900&interval=300';

export const DEFAULT_RINGCENTRAL_WEBHOOK_EVENT_FILTERS = [
  RINGCENTRAL_TELEPHONY_EVENT_FILTER,
  RINGCENTRAL_SMS_EVENT_FILTER,
  RINGCENTRAL_SUBSCRIPTION_RENEWAL_FILTER,
] as const;
