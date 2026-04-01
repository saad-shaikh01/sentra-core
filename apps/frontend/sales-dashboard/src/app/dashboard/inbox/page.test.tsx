import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockMarkRead = jest.fn();
const mockReplyMutateAsync = jest.fn();
const mockEditor = {
  commands: {
    setContent: jest.fn(),
    clearContent: jest.fn(),
  },
  getHTML: jest.fn(() => '<p></p>'),
  getText: jest.fn(() => ''),
};

jest.mock('@/hooks/use-comm', () => ({
  useThreads: () => ({
    data: {
      pages: [
        {
          data: [
            {
              id: 'thread-1',
              subject: 'Pipeline update',
              snippet: 'Latest status',
              participants: [{ email: 'client@example.com', name: 'Client' }],
              hasUnread: false,
              latestMessageAt: '2026-03-12T10:00:00.000Z',
            },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useThread: () => ({
    data: {
      id: 'thread-1',
      subject: 'Pipeline update',
      hasUnread: false,
      latestMessageAt: '2026-03-12T10:00:00.000Z',
    },
    isLoading: false,
    isError: false,
  }),
  useMessages: () => ({
    data: {
      data: [
        {
          id: 'message-1',
          gmailMessageId: 'gmail-message-1',
          from: { email: 'client@example.com', name: 'Client' },
          to: [{ email: 'agent@example.com' }],
          bodyHtml: '<p>Hello team</p>',
          bodyText: 'Hello team',
          sentAt: '2026-03-12T10:00:00.000Z',
          attachments: [],
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useReplyToMessage: () => ({
    mutateAsync: mockReplyMutateAsync,
    isPending: false,
  }),
  useArchiveThread: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useMarkThreadRead: () => ({
    mutate: mockMarkRead,
  }),
  useMarkThreadUnread: () => ({
    mutate: jest.fn(),
  }),
  useIdentities: () => ({
    data: [
      {
        id: 'identity-1',
        email: 'agent@example.com',
        displayName: 'Agent',
        isDefault: true,
        userId: 'user-1',
        sendAsAliases: [],
        syncState: { status: 'active', lastSyncAt: null, lastError: null },
      },
    ],
  }),
  useCommIntelligenceSummary: () => ({
    data: {
      totals: {
        trackedSends: 4,
        replies: 2,
        estimatedOpens: 3,
        suspiciousOpens: 1,
        bounces: 0,
        sendFailures: 0,
      },
      responseTimes: {
        sampleSize: 2,
        signalQuality: 'weak',
        humanWindow: 'Median 6h',
      },
      queues: {
        needsFollowUp: 1,
        hotLeads: 2,
        overdue: 1,
        openedNoReply: 1,
        suspiciousOnly: 0,
      },
    },
    isLoading: false,
  }),
  useCommSettings: () => ({
    data: {
      trackingEnabled: true,
      openTrackingEnabled: true,
      allowPerMessageTrackingToggle: true,
    },
  }),
  useCommAlerts: () => ({
    data: {
      data: [],
      unreadCount: 0,
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    },
    isLoading: false,
  }),
  useMarkCommAlertRead: () => ({
    mutateAsync: jest.fn(),
  }),
  useMarkAllCommAlertsRead: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useBatchThreadAction: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  useEmailTemplates: () => ({
    data: [],
    isLoading: false,
  }),
  useDefaultSignature: () => ({
    data: null,
    isLoading: false,
  }),
  useUnreadCount: () => ({
    data: { total: 0, byIdentity: {} },
  }),
  useSignatures: () => ({
    data: [],
  }),
  useEntityTimeline: () => ({
    data: { data: [], meta: {} },
  }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

jest.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasPermission: jest.fn((perm) => perm !== 'sales:settings:view'),
  }),
}));

jest.mock('@/hooks/use-debounce', () => ({
  useDebounce: (value: string) => value,
}));

jest.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { clearCommUnread: jest.Mock }) => unknown) =>
    selector({ clearCommUnread: jest.fn() }),
}));

jest.mock('@/lib/format-date', () => ({
  timeAgo: () => '1h ago',
}));

jest.mock('@/lib/feature-flags', () => ({
  COMM_ENABLED: true,
}));

jest.mock('@/lib/api', () => ({
  api: {
    fetch: jest.fn(),
    listIdentities: jest.fn(),
    getCommIntelligenceSummary: jest.fn(),
    getCommSettings: jest.fn(),
    listThreads: jest.fn(),
  },
}));

jest.mock('@/components/shared/comm/compose-drawer', () => ({
  ComposeDrawer: ({
    open,
    mode,
    defaultSubject,
  }: {
    open: boolean;
    mode?: string;
    defaultSubject?: string;
  }) =>
    open ? <div data-testid="compose-drawer" data-mode={mode} data-subject={defaultSubject} /> : null,
}));

jest.mock('@tiptap/react', () => ({
  EditorContent: () => <div data-testid="reply-editor" />,
  useEditor: () => mockEditor,
}));

jest.mock('@tiptap/starter-kit', () => ({ __esModule: true, default: {} }));
jest.mock('@tiptap/extension-underline', () => ({ __esModule: true, default: {} }));
jest.mock('@tiptap/extension-link', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(() => ({})),
  },
}));
jest.mock('@tiptap/extension-image', () => ({ __esModule: true, default: {} }));
jest.mock('dompurify', () => ({
  sanitize: (value: string) => value,
}));

// Import after mocks
import InboxPage from './page';

describe('InboxPage forward flow', () => {
  beforeEach(() => {
    mockReplyMutateAsync.mockReset();
    mockEditor.getHTML.mockReturnValue('<p>Reply all</p>');
    mockEditor.getText.mockReturnValue('Reply all');
  });

  it('renders a Forward button and opens compose with a prefilled forward subject', async () => {
    render(<InboxPage />);

    // Wait for threads to render
    const thread = await screen.findByText('Pipeline update');
    fireEvent.click(thread);

    const forwardButton = await screen.findByRole('button', { name: 'Forward' });
    expect(forwardButton).not.toBeNull();

    fireEvent.click(forwardButton);

    const drawer = screen.getByTestId('compose-drawer');
    expect(drawer.getAttribute('data-mode')).toBe('forward');
    expect(drawer.getAttribute('data-subject')).toBe('Fwd: Pipeline update');
  });

  it('renders Reply All and sends the reply mutation with replyAll=true', async () => {
    render(<InboxPage />);

    const thread = await screen.findByText('Pipeline update');
    fireEvent.click(thread);

    const replyAllButton = await screen.findByRole('button', { name: 'Reply All' });
    await waitFor(() => expect(replyAllButton.hasAttribute('disabled')).toBe(false));
    await act(async () => {
      fireEvent.click(replyAllButton);
    });

    expect(mockReplyMutateAsync).toHaveBeenCalledWith({
      messageId: 'gmail-message-1',
      dto: expect.objectContaining({
        identityId: 'identity-1',
        replyAll: true,
      }),
    });
  });

  it('shows the Phase 3 intelligence snapshot and queue filters', async () => {
    render(<InboxPage />);

    expect(await screen.findByText('Intelligence Snapshot')).not.toBeNull();
    // Expand snapshot
    fireEvent.click(screen.getByText('Intelligence Snapshot'));

    expect(await screen.findByText('Tracked sends')).not.toBeNull();
    // Multiple elements might match if we have queue filters with same text
    expect((await screen.findAllByText('Hot Leads')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Needs Follow-up')).length).toBeGreaterThan(0);
  });
});
