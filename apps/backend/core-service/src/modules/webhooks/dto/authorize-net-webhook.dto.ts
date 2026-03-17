export interface AuthorizeNetWebhookPayload {
  notificationId: string;
  eventType: string;
  eventDate: string;
  webhookId: string;
  payload: {
    responseCode?: number;
    authAmount?: number;
    entityName?: string;
    id?: string;
    subscriptionId?: string;
    subscriptionPayNum?: number;
    invoiceNumber?: string;
  };
}
