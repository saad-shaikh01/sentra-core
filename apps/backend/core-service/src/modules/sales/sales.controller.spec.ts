import { ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { SalesController } from './sales.controller';
import { CreateChargebackDto, CreateRefundDto, CreateSaleDto, QuerySalesDto, UpdateSaleDto } from './dto';
import { UserRole, JwtPayload } from '@sentra-core/types';

describe('SalesController', () => {
  let controller: SalesController;
  let salesServiceMock: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    refund: jest.Mock;
    recordChargeback: jest.Mock;
  };

  beforeEach(() => {
    salesServiceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      refund: jest.fn(),
      recordChargeback: jest.fn(),
    };

    controller = new SalesController(salesServiceMock as never, {} as never);
  });

  it('passes actor role through to create()', async () => {
    const dto = { clientId: '11111111-1111-1111-1111-111111111111', brandId: '22222222-2222-2222-2222-222222222222' } as CreateSaleDto;
    const user = {
      sub: 'user-1',
      orgId: 'org-1',
      role: UserRole.FRONTSELL_AGENT,
      email: 'agent@example.com',
    } as JwtPayload;
    salesServiceMock.create.mockResolvedValue({ id: 'sale-1' });

    await controller.create(dto, user);

    expect(salesServiceMock.create).toHaveBeenCalledWith(user.orgId, user.sub, user.role, dto);
  });

  it('blocks PROJECT_MANAGER from create() at the controller level', async () => {
    const dto = { clientId: '11111111-1111-1111-1111-111111111111', brandId: '22222222-2222-2222-2222-222222222222' } as CreateSaleDto;
    const user = {
      sub: 'user-1',
      orgId: 'org-1',
      role: UserRole.PROJECT_MANAGER,
      email: 'pm@example.com',
    } as JwtPayload;

    expect(() => controller.create(dto, user)).toThrow(ForbiddenException);
    expect(salesServiceMock.create).not.toHaveBeenCalled();
  });

  it('passes actor role through to update()', async () => {
    const dto = { description: 'updated' } as UpdateSaleDto;
    const user = {
      sub: 'user-1',
      orgId: 'org-1',
      role: UserRole.UPSELL_AGENT,
      email: 'agent@example.com',
    } as JwtPayload;
    salesServiceMock.update.mockResolvedValue({ id: 'sale-1' });

    await controller.update('sale-1', dto, user);

    expect(salesServiceMock.update).toHaveBeenCalledWith('sale-1', user.orgId, user.sub, user.role, dto);
  });

  it('defines sales endpoint roles to match the permission matrix', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.create)).toEqual([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.FRONTSELL_AGENT,
      UserRole.UPSELL_AGENT,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.update)).toEqual([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.FRONTSELL_AGENT,
      UserRole.UPSELL_AGENT,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.findAll)).toEqual([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.PROJECT_MANAGER,
      UserRole.FRONTSELL_AGENT,
      UserRole.UPSELL_AGENT,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.findOne)).toEqual([
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.PROJECT_MANAGER,
      UserRole.FRONTSELL_AGENT,
      UserRole.UPSELL_AGENT,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.refund)).toEqual([
      UserRole.OWNER,
      UserRole.ADMIN,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.recordChargeback)).toEqual([
      UserRole.OWNER,
      UserRole.ADMIN,
    ]);
  });

  it('passes actor id through to refund()', async () => {
    const dto = { type: 'FULL', transactionId: 'txn-1' } as CreateRefundDto;
    const user = {
      sub: 'user-1',
      orgId: 'org-1',
      role: UserRole.ADMIN,
      email: 'admin@example.com',
    } as JwtPayload;
    salesServiceMock.refund.mockResolvedValue({ message: 'Refund issued successfully' });

    await controller.refund('sale-1', dto, user);

    expect(salesServiceMock.refund).toHaveBeenCalledWith('sale-1', user.orgId, user.sub, dto);
  });

  it('passes actor id through to recordChargeback()', async () => {
    const dto = {
      amount: 150,
      notes: 'Customer disputed the charge',
    } as CreateChargebackDto;
    const user = {
      sub: 'user-1',
      orgId: 'org-1',
      role: UserRole.ADMIN,
      email: 'admin@example.com',
    } as JwtPayload;
    salesServiceMock.recordChargeback.mockResolvedValue({ message: 'Chargeback recorded successfully' });

    await controller.recordChargeback('sale-1', dto, user);

    expect(salesServiceMock.recordChargeback).toHaveBeenCalledWith('sale-1', user.orgId, user.sub, dto);
  });

  it('allows PROJECT_MANAGER through the read-only controller methods', async () => {
    const user = {
      sub: 'user-1',
      orgId: 'org-1',
      role: UserRole.PROJECT_MANAGER,
      email: 'pm@example.com',
    } as JwtPayload;
    const query = {} as QuerySalesDto;
    salesServiceMock.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    salesServiceMock.findOne.mockResolvedValue({ id: 'sale-1' });

    await expect(controller.findAll(query, user)).resolves.toEqual(
      expect.objectContaining({ data: [] }),
    );
    await expect(controller.findOne('sale-1', user.orgId)).resolves.toEqual({ id: 'sale-1' });
  });
});
