import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { LeadsController } from './leads.controller';

describe('LeadsController', () => {
  const serviceMock = {
    import: jest.fn(),
  };

  const controller = new LeadsController(serviceMock as never);

  it('rejects missing import files', async () => {
    await expect(
      controller.importLeads(
        undefined,
        { brandId: 'brand-1' },
        { orgId: 'org-1', sub: 'user-1' } as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported import file types', async () => {
    await expect(
      controller.importLeads(
        {
          originalname: 'leads.txt',
          mimetype: 'text/plain',
          size: 128,
          buffer: Buffer.from('hello'),
        } as any,
        { brandId: 'brand-1' },
        { orgId: 'org-1', sub: 'user-1' } as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects files larger than 5 MB', async () => {
    await expect(
      controller.importLeads(
        {
          originalname: 'leads.csv',
          mimetype: 'text/csv',
          size: 6 * 1024 * 1024,
          buffer: Buffer.from('name,email'),
        } as any,
        { brandId: 'brand-1' },
        { orgId: 'org-1', sub: 'user-1' } as never,
      ),
    ).rejects.toThrow(PayloadTooLargeException);
  });
});
