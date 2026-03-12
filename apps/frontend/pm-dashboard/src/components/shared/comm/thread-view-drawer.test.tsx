import type { HTMLAttributes, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThreadViewDrawer } from './thread-view-drawer';

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
  useThread: () => ({
    data: {
      id: 'thread-1',
      subject: 'Project kickoff',
      hasUnread: false,
      latestMessageAt: '2026-03-12T10:00:00.000Z',
      entityLinks: [],
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
          to: [{ email: 'pm@example.com' }],
          bodyHtml: '<p>Kickoff details</p>',
          bodyText: 'Kickoff details',
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
  useIdentities: () => ({
    data: [
      {
        id: 'identity-1',
        email: 'pm@example.com',
        displayName: 'Project Manager',
        isDefault: true,
        sendAsAliases: [],
        syncState: { status: 'active', lastSyncAt: null, lastError: null },
      },
    ],
  }),
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock('@/lib/format-date', () => ({
  timeAgo: () => '1h ago',
}));

jest.mock('@/lib/api', () => ({
  api: {
    fetch: jest.fn(),
  },
}));

jest.mock('./compose-drawer', () => ({
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
jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

describe('ThreadViewDrawer forward flow', () => {
  beforeEach(() => {
    mockReplyMutateAsync.mockReset();
    mockEditor.getHTML.mockReturnValue('<p>Reply all</p>');
    mockEditor.getText.mockReturnValue('Reply all');
  });

  it('renders a Forward button and opens compose with a prefilled forward subject', () => {
    render(<ThreadViewDrawer threadId="thread-1" onClose={jest.fn()} />);

    const forwardButton = screen.getByRole('button', { name: 'Forward' });
    expect(forwardButton).not.toBeNull();

    fireEvent.click(forwardButton);

    const drawer = screen.getByTestId('compose-drawer');
    expect(drawer.getAttribute('data-mode')).toBe('forward');
    expect(drawer.getAttribute('data-subject')).toBe('Fwd: Project kickoff');
  });

  it('renders Reply All and sends the reply mutation with replyAll=true', async () => {
    render(<ThreadViewDrawer threadId="thread-1" onClose={jest.fn()} />);

    const replyAllButton = screen.getByRole('button', { name: 'Reply All' });
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
});
