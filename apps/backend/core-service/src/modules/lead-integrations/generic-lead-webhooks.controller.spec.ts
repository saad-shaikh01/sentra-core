import { GenericLeadWebhooksController } from './generic-lead-webhooks.controller';

describe('GenericLeadWebhooksController', () => {
  const serviceMock = {
    listGenericLeadWebhooks: jest.fn(),
    createGenericLeadWebhook: jest.fn(),
    updateGenericLeadWebhook: jest.fn(),
    removeGenericLeadWebhook: jest.fn(),
  };

  const controller = new GenericLeadWebhooksController(serviceMock as never);

  it('lists generic webhooks for the current organization', async () => {
    serviceMock.listGenericLeadWebhooks.mockResolvedValue([{ id: 'webhook-1' }]);

    await expect(controller.list('org-1')).resolves.toEqual([{ id: 'webhook-1' }]);
    expect(serviceMock.listGenericLeadWebhooks).toHaveBeenCalledWith('org-1');
  });
});
