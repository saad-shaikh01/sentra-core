import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, UserStatus } from '@sentra-core/prisma-client';
import { MailClientService } from '@sentra-core/mail-client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InvitationService } from './invitation.service';
import { IamService } from '../iam';
import { AuthService } from '../auth';

describe('InvitationService HRMS acceptInvite', () => {
  let service: InvitationService;

  const prismaMock = {
    userInvitation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    invitation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mailMock = {
    sendMail: jest.fn(),
  };

  const jwtMock = {
    signAsync: jest.fn(),
  };

  const configMock = {
    get: jest.fn(),
  };

  const iamMock = {
    isInviteV2Enabled: jest.fn().mockReturnValue(false),
    applyInvitationBundlesToUser: jest.fn(),
  };

  const authMock = {
    loginAfterInviteAcceptance: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));

    const module = await Test.createTestingModule({
      providers: [
        InvitationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MailClientService, useValue: mailMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
        { provide: IamService, useValue: iamMock },
        { provide: AuthService, useValue: authMock },
      ],
    }).compile();

    service = module.get(InvitationService);
  });

  it('throws when passwords do not match for hrms invite acceptance', async () => {
    await expect(
      service.acceptInvitation({
        token: 'abc',
        password: 'Password1!',
        confirmPassword: 'Password2!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when the HRMS invitation is already accepted', async () => {
    prismaMock.userInvitation.findFirst.mockResolvedValue(makeHrmsInvitation({
      acceptedAt: new Date(),
    }));

    await expect(
      service.acceptInvitation({
        token: 'a'.repeat(64),
        password: 'Password1!',
        confirmPassword: 'Password1!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when the HRMS invitation is cancelled', async () => {
    prismaMock.userInvitation.findFirst.mockResolvedValue(makeHrmsInvitation({
      cancelledAt: new Date(),
    }));

    await expect(
      service.acceptInvitation({
        token: 'b'.repeat(64),
        password: 'Password1!',
        confirmPassword: 'Password1!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when the HRMS invitation is expired', async () => {
    prismaMock.userInvitation.findFirst.mockResolvedValue(makeHrmsInvitation({
      expiresAt: new Date(Date.now() - 1000),
    }));

    await expect(
      service.acceptInvitation({
        token: 'c'.repeat(64),
        password: 'Password1!',
        confirmPassword: 'Password1!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an HRMS invitation and auto-logins through AuthService', async () => {
    prismaMock.userInvitation.findFirst.mockResolvedValue(makeHrmsInvitation());
    authMock.loginAfterInviteAcceptance.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'user-1' },
      appAccess: [],
    });

    const result = await service.acceptInvitation({
      token: 'd'.repeat(64),
      password: 'Password1!',
      confirmPassword: 'Password1!',
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          isActive: true,
        }),
      }),
    );
    expect(prismaMock.userInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invite-1' },
        data: expect.objectContaining({
          acceptedAt: expect.any(Date),
        }),
      }),
    );
    expect(authMock.loginAfterInviteAcceptance).toHaveBeenCalledWith('user-1');
    expect(result.accessToken).toBe('access');
  });

  it('falls back to the legacy invitation flow when no HRMS invite is found', async () => {
    prismaMock.userInvitation.findFirst.mockResolvedValue(null);
    prismaMock.invitation.findUnique.mockResolvedValue(null);

    await expect(
      service.acceptInvitation({
        token: 'legacy-token',
        password: 'Password1!',
        name: 'Legacy User',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

function makeHrmsInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite-1',
    userId: 'user-1',
    organizationId: 'org-1',
    tokenHash: 'hash',
    invitedBy: 'admin-1',
    invitedAt: new Date(),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    acceptedAt: null,
    cancelledAt: null,
    emailSentAt: new Date(),
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      status: UserStatus.INVITED,
      organization: {
        id: 'org-1',
        name: 'Acme',
      },
    },
    ...overrides,
  };
}
