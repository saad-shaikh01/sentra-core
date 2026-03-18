import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, UserStatus } from '@sentra-core/prisma-client';
import { MailerService } from '../../common/mailer';
import { InvitationsService } from './invitations.service';

describe('InvitationsService', () => {
  let service: InvitationsService;

  const prismaMock = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    userInvitation: {
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://localhost:4200';
      return undefined;
    }),
  };

  const mailerMock = {
    sendInviteEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));

    const module = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: MailerService, useValue: mailerMock },
      ],
    }).compile();

    service = module.get(InvitationsService);
  });

  it('sendInvite throws if the user is already active', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: UserStatus.ACTIVE,
      firstName: 'Jane',
      lastName: 'Doe',
      name: 'Jane Doe',
    });

    await expect(service.sendInvite('user-1', 'org-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('sendInvite throws if the user is deactivated', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: UserStatus.DEACTIVATED,
      firstName: 'Jane',
      lastName: 'Doe',
      name: 'Jane Doe',
    });

    await expect(service.sendInvite('user-1', 'org-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('sendInvite stores a hash and emails the raw token', async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.INVITED,
        firstName: 'Jane',
        lastName: 'Doe',
        name: 'Jane Doe',
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        firstName: 'Admin',
        lastName: 'User',
        name: 'Admin User',
      });
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });

    await service.sendInvite('user-1', 'org-1', 'admin-1');

    const mailerPayload = mailerMock.sendInviteEmail.mock.calls[0][0];
    const rawToken = new URL(mailerPayload.inviteUrl).searchParams.get('token');
    const upsertArgs = prismaMock.userInvitation.upsert.mock.calls[0][0];

    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(upsertArgs.update.tokenHash).not.toBe(rawToken);
  });

  it('sendInvite rolls back when email sending fails', async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        status: UserStatus.INVITED,
        firstName: 'Jane',
        lastName: 'Doe',
        name: 'Jane Doe',
      })
      .mockResolvedValueOnce({
        id: 'admin-1',
        firstName: 'Admin',
        lastName: 'User',
        name: 'Admin User',
      });
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    mailerMock.sendInviteEmail.mockRejectedValue(new Error('smtp down'));

    await expect(service.sendInvite('user-1', 'org-1', 'admin-1')).rejects.toThrow();
    expect(prismaMock.userInvitation.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});
