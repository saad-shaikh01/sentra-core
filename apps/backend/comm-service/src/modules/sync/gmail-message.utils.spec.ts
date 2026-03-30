import { deriveThreadState, parseGmailMessage } from './gmail-message.utils';

describe('gmail-message.utils', () => {
  it('parseGmailMessage stores Gmail and RFC metadata for outbound messages', () => {
    const parsed = parseGmailMessage(
      {
        id: 'gmail-message-1',
        threadId: 'gmail-thread-1',
        internalDate: String(new Date('2026-03-11T10:00:00.000Z').getTime()),
        labelIds: ['SENT'],
        payload: {
          headers: [
            { name: 'From', value: 'Agent <agent@example.com>' },
            { name: 'To', value: 'Client <client@example.com>' },
            { name: 'Subject', value: 'Hello' },
            { name: 'Date', value: 'Wed, 11 Mar 2026 10:00:00 +0000' },
            { name: 'Message-ID', value: '<sent-1@example.com>' },
            { name: 'References', value: '<root@example.com>' },
          ],
          mimeType: 'text/plain',
          body: {
            data: Buffer.from('Hello there').toString('base64url'),
          },
        },
      },
      {
        _id: 'identity-1',
        organizationId: 'org-1',
      },
    );

    expect(parsed).toMatchObject({
      organizationId: 'org-1',
      gmailMessageId: 'gmail-message-1',
      gmailThreadId: 'gmail-thread-1',
      rfcMessageId: 'sent-1@example.com',
      referenceIds: ['root@example.com'],
      deliveryState: 'sent',
      isSentByIdentity: true,
    });
    expect(parsed.sentAt).toEqual(new Date('2026-03-11T10:00:00.000Z'));
    expect(parsed.gmailInternalDate).toEqual(new Date('2026-03-11T10:00:00.000Z'));
  });

  it('deriveThreadState marks outbound threads as replied or ghosted using phase-one heuristics', () => {
    const repliedState = deriveThreadState(
      [
        {
          from: { email: 'agent@example.com' },
          to: [{ email: 'client@example.com' }],
          cc: [],
          sentAt: new Date('2026-03-11T10:00:00.000Z'),
          isRead: true,
          isSentByIdentity: true,
          subject: 'Hello',
          bodyText: 'Outbound',
          bodyHtml: '<p>Outbound</p>',
          deliveryState: 'sent',
          isBounceDetected: false,
        },
        {
          from: { email: 'client@example.com' },
          to: [{ email: 'agent@example.com' }],
          cc: [],
          sentAt: new Date('2026-03-11T11:00:00.000Z'),
          isRead: false,
          isSentByIdentity: false,
          subject: 'Re: Hello',
          bodyText: 'Inbound reply',
          bodyHtml: '<p>Inbound reply</p>',
          deliveryState: 'none',
          isBounceDetected: false,
        },
      ],
      undefined,
      new Date('2026-03-11T12:00:00.000Z'),
    );

    const ghostedState = deriveThreadState(
      [
        {
          from: { email: 'agent@example.com' },
          to: [{ email: 'client@example.com' }],
          cc: [],
          sentAt: new Date('2026-03-01T10:00:00.000Z'),
          isRead: true,
          isSentByIdentity: true,
          subject: 'Follow up',
          bodyText: 'Checking in',
          bodyHtml: '<p>Checking in</p>',
          deliveryState: 'sent',
          isBounceDetected: false,
        },
      ],
      undefined,
      new Date('2026-03-11T12:00:00.000Z'),
    );

    expect(repliedState.replyState).toBe('replied');
    expect(repliedState.repliedAt).toEqual(new Date('2026-03-11T11:00:00.000Z'));
    expect(ghostedState.replyState).toBe('ghosted');
    expect(ghostedState.deliveryState).toBe('sent');
  });

  it('parseGmailMessage strips injected tracking pixels from stored bodyHtml', () => {
    const parsed = parseGmailMessage(
      {
        id: 'gmail-message-4',
        threadId: 'gmail-thread-4',
        labelIds: ['SENT'],
        payload: {
          headers: [
            { name: 'From', value: 'Agent <agent@example.com>' },
            { name: 'To', value: 'Client <client@example.com>' },
          ],
          mimeType: 'text/html',
          body: {
            data: Buffer.from(
              '<div>Hello</div><img src="https://comm.example.com/api/comm/track/o/raw-token.gif" width="1" height="1">',
            ).toString('base64url'),
          },
        },
      },
      {
        _id: 'identity-1',
        organizationId: 'org-1',
      },
    );

    expect(parsed.bodyHtml).toContain('Hello');
    expect(parsed.bodyHtml).not.toContain('/track/o/');
  });
});
