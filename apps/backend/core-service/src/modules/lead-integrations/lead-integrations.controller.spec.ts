import { LeadIntegrationsController } from './lead-integrations.controller';

describe('LeadIntegrationsController', () => {
  const serviceMock = {
    listFacebookIntegrations: jest.fn(),
    createFacebookIntegration: jest.fn(),
    updateFacebookIntegration: jest.fn(),
    removeFacebookIntegration: jest.fn(),
  };

  const controller = new LeadIntegrationsController(serviceMock as never);

  it('lists integrations for the current organization', async () => {
    serviceMock.listFacebookIntegrations.mockResolvedValue([{ id: 'fb-1' }]);

    await expect(controller.list('org-1')).resolves.toEqual([{ id: 'fb-1' }]);
    expect(serviceMock.listFacebookIntegrations).toHaveBeenCalledWith('org-1');
  });
});
