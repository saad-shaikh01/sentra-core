import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { CommIdentityDocument } from '../../schemas/comm-identity.schema';
import { CommMessageDocument } from '../../schemas/comm-message.schema';
import { GmailApiService } from '../sync/gmail-api.service';
import { AttachmentsService } from './attachments.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  PutObjectCommand: jest.fn().mockImplementation((input: Record<string, unknown>) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input: Record<string, unknown>) => ({ input })),
}));

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let configService: {
    get: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1710000000000);
    mockSend.mockReset().mockResolvedValue({});
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          WASABI_BUCKET: 'comm-bucket',
          WASABI_REGION: 'us-east-1',
          WASABI_ENDPOINT: 'https://s3.wasabisys.com',
          WASABI_ACCESS_KEY_ID: 'access-key',
          WASABI_SECRET_ACCESS_KEY: 'secret-key',
          BUNNY_CDN_BASE_URL: 'https://cdn.example.com',
        };

        return values[key] ?? defaultValue;
      }),
    };

    service = new AttachmentsService(
      {} as Model<CommMessageDocument>,
      {} as Model<CommIdentityDocument>,
      {} as GmailApiService,
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uploadAttachment stores the file in Wasabi and returns the Bunny CDN URL', async () => {
    const result = await service.uploadAttachment('org-1', {
      originalname: 'logo.png',
      buffer: Buffer.from('image-bytes'),
      size: 128,
      mimetype: 'image/png',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'comm-bucket',
          Key: 'org-1/outbound/1710000000000-logo.png',
          Body: Buffer.from('image-bytes'),
          ContentType: 'image/png',
          Metadata: {
            filename: 'logo.png',
            mimetype: 'image/png',
          },
        }),
      }),
    );
    expect(result).toEqual({
      s3Key: 'org-1/outbound/1710000000000-logo.png',
      cdnUrl: 'https://cdn.example.com/org-1/outbound/1710000000000-logo.png',
      filename: 'logo.png',
      size: 128,
      mimeType: 'image/png',
    });
  });

  it('uploadAttachment throws when Wasabi or Bunny CDN is not configured', async () => {
    configService.get.mockImplementation((key: string, defaultValue?: string) => {
      const values: Record<string, string> = {
        WASABI_BUCKET: 'comm-bucket',
        WASABI_REGION: 'us-east-1',
        WASABI_ENDPOINT: 'https://s3.wasabisys.com',
        WASABI_ACCESS_KEY_ID: 'access-key',
        WASABI_SECRET_ACCESS_KEY: 'secret-key',
      };

      return values[key] ?? defaultValue;
    });

    service = new AttachmentsService(
      {} as Model<CommMessageDocument>,
      {} as Model<CommIdentityDocument>,
      {} as GmailApiService,
      configService as unknown as ConfigService,
    );

    await expect(
      service.uploadAttachment('org-1', {
        originalname: 'logo.png',
        buffer: Buffer.from('image-bytes'),
        size: 128,
        mimetype: 'image/png',
      }),
    ).rejects.toThrow('Wasabi or Bunny CDN is not configured');
  });

  it('fetchAttachmentBuffers loads each key from Wasabi with metadata', async () => {
    mockSend
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(Uint8Array.from(Buffer.from('first'))),
        },
        ContentType: 'application/pdf',
        ContentLength: 5,
        Metadata: {
          filename: 'contract.pdf',
          mimetype: 'application/pdf',
        },
      })
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(Uint8Array.from(Buffer.from('second'))),
        },
        Metadata: {
          filename: 'notes.txt',
          mimetype: 'text/plain',
        },
      });

    const result = await service.fetchAttachmentBuffers([
      'org-1/outbound/contract.pdf',
      'org-1/outbound/notes.txt',
    ]);

    expect(mockSend).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'comm-bucket',
          Key: 'org-1/outbound/contract.pdf',
        }),
      }),
    );
    expect(mockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'comm-bucket',
          Key: 'org-1/outbound/notes.txt',
        }),
      }),
    );
    expect(result).toEqual([
      {
        buffer: Buffer.from('first'),
        filename: 'contract.pdf',
        mimeType: 'application/pdf',
        size: 5,
        s3Key: 'org-1/outbound/contract.pdf',
      },
      {
        buffer: Buffer.from('second'),
        filename: 'notes.txt',
        mimeType: 'text/plain',
        size: 6,
        s3Key: 'org-1/outbound/notes.txt',
      },
    ]);
  });
});
