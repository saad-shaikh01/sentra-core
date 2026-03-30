import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComposeDrawer } from './compose-drawer';

const mockUseIdentities = jest.fn();
const mockUseSendMessage = jest.fn();
const mockUseForwardMessage = jest.fn();
const mockUseCommSettings = jest.fn();
const mockApiFetch = jest.fn();
const mockUseAuth = jest.fn();

type ActiveState = Record<string, boolean>;
type FakeChain = {
  focus: jest.Mock<FakeChain, []>;
  toggleBold: jest.Mock<FakeChain, []>;
  toggleItalic: jest.Mock<FakeChain, []>;
  toggleUnderline: jest.Mock<FakeChain, []>;
  toggleStrike: jest.Mock<FakeChain, []>;
  toggleBulletList: jest.Mock<FakeChain, []>;
  toggleOrderedList: jest.Mock<FakeChain, []>;
  extendMarkRange: jest.Mock<FakeChain, []>;
  setImage: jest.Mock<FakeChain, [{ src: string }]>;
  setLink: jest.Mock<FakeChain, []>;
  unsetLink: jest.Mock<FakeChain, []>;
  unsetAllMarks: jest.Mock<FakeChain, []>;
  clearNodes: jest.Mock<FakeChain, []>;
  run: jest.Mock<boolean, []>;
};

type FakeEditor = {
  isActive: jest.Mock<boolean, [string]>;
  getAttributes: jest.Mock<Record<string, never>, []>;
  getHTML: jest.Mock<string, []>;
  getText: jest.Mock<string, []>;
  commands: {
    setContent: jest.Mock<void, [string]>;
    clearContent: jest.Mock<void, []>;
  };
  chain: jest.Mock<FakeChain, []>;
  __setValue: (value: string) => void;
  __setOnUpdate: (callback?: (payload: { editor: FakeEditor }) => void) => void;
};

function createFakeEditor(): FakeEditor {
  let html = '<p></p>';
  let text = '';
  let onUpdate: ((payload: { editor: FakeEditor }) => void) | undefined;
  const active: ActiveState = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    bulletList: false,
    orderedList: false,
    link: false,
  };

  const chain = {} as FakeChain;
  chain.focus = jest.fn(() => chain);
  chain.toggleBold = jest.fn(() => {
    active.bold = !active.bold;
    return chain;
  });
  chain.toggleItalic = jest.fn(() => {
    active.italic = !active.italic;
    return chain;
  });
  chain.toggleUnderline = jest.fn(() => {
    active.underline = !active.underline;
    return chain;
  });
  chain.toggleStrike = jest.fn(() => {
    active.strike = !active.strike;
    return chain;
  });
  chain.toggleBulletList = jest.fn(() => {
    active.bulletList = !active.bulletList;
    return chain;
  });
  chain.toggleOrderedList = jest.fn(() => {
    active.orderedList = !active.orderedList;
    return chain;
  });
  chain.extendMarkRange = jest.fn(() => chain);
  chain.setImage = jest.fn(({ src }: { src: string }) => {
    html = `<p><img src="${src}"></p>`;
    onUpdate?.({ editor });
    return chain;
  });
  chain.setLink = jest.fn(() => {
    active.link = true;
    return chain;
  });
  chain.unsetLink = jest.fn(() => {
    active.link = false;
    return chain;
  });
  chain.unsetAllMarks = jest.fn(() => {
    Object.keys(active).forEach((key) => {
      active[key] = false;
    });
    return chain;
  });
  chain.clearNodes = jest.fn(() => chain);
  chain.run = jest.fn(() => true);

  const editor: FakeEditor = {
    isActive: jest.fn((name: string) => Boolean(active[name])),
    getAttributes: jest.fn(() => ({})),
    getHTML: jest.fn(() => html),
    getText: jest.fn(() => text),
    commands: {
      setContent: jest.fn((value: string) => {
        html = value || '<p></p>';
        text = value.replace(/<[^>]+>/g, '');
        onUpdate?.({ editor });
      }),
      clearContent: jest.fn(() => {
        html = '<p></p>';
        text = '';
        onUpdate?.({ editor });
      }),
    },
    chain: jest.fn(() => chain),
    __setValue: (value: string) => {
      text = value;
      html = value ? `<p>${value}</p>` : '<p></p>';
      onUpdate?.({ editor });
    },
    __setOnUpdate: (callback?: (payload: { editor: FakeEditor }) => void) => {
      onUpdate = callback;
    },
  };

  return editor;
}

let fakeEditor = createFakeEditor();

jest.mock('@tiptap/react', () => ({
  EditorContent: ({ editor }: { editor: FakeEditor | null }) => (
    <textarea
      data-testid="compose-editor"
      value={editor?.getText() ?? ''}
      onChange={(event) => editor?.__setValue(event.target.value)}
    />
  ),
  EditorContext: {
    Provider: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
  useCurrentEditor: () => ({ editor: fakeEditor }),
  useEditor: (options?: { onUpdate?: (payload: { editor: FakeEditor }) => void }) => {
    fakeEditor.__setOnUpdate(options?.onUpdate);
    return fakeEditor;
  },
}));

jest.mock('@tiptap/starter-kit', () => ({ __esModule: true, default: {} }));
jest.mock('@tiptap/extension-underline', () => ({ __esModule: true, default: {} }));
jest.mock('@tiptap/extension-image', () => ({ __esModule: true, default: {} }));
jest.mock('@tiptap/extension-link', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(() => ({})),
  },
}));

jest.mock('@/hooks/use-comm', () => ({
  useIdentities: () => mockUseIdentities(),
  useSendMessage: () => mockUseSendMessage(),
  useForwardMessage: () => mockUseForwardMessage(),
  useCommSettings: () => mockUseCommSettings(),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    fetch: (...args: unknown[]) => mockApiFetch(...args),
  },
}));

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('ComposeDrawer', () => {
  const mutateAsync = jest.fn();
  const forwardMutateAsync = jest.fn();

  const addToRecipient = (email: string) => {
    fireEvent.change(screen.getByPlaceholderText('recipient@example.com'), {
      target: { value: email },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('recipient@example.com'), {
      key: 'Enter',
    });
  };

  const addBccRecipient = (email: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'BCC' }));
    fireEvent.change(screen.getByPlaceholderText('bcc@example.com'), {
      target: { value: email },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('bcc@example.com'), {
      key: 'Enter',
    });
  };

  beforeEach(() => {
    fakeEditor = createFakeEditor();
    mutateAsync.mockReset();
    mockUseIdentities.mockReturnValue({
      data: [
        {
          id: 'identity-1',
          email: 'agent@example.com',
          displayName: 'Agent',
          isDefault: true,
          sendAsAliases: [],
          syncState: { status: 'active', lastSyncAt: null, lastError: null },
        },
      ],
    });
    mockUseSendMessage.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mockUseForwardMessage.mockReturnValue({
      mutateAsync: forwardMutateAsync,
      isPending: false,
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
    });
    mockUseCommSettings.mockReturnValue({
      data: {
        trackingEnabled: true,
        openTrackingEnabled: true,
        allowPerMessageTrackingToggle: true,
      },
    });
    mockApiFetch.mockReset().mockResolvedValue({
      data: {
        s3Key: 'org-1/outbound/logo.png',
        cdnUrl: 'https://cdn.example.com/org-1/outbound/logo.png',
        filename: 'logo.png',
        mimeType: 'image/png',
        size: 128,
      },
    });
    window.localStorage.clear();
    jest.useRealTimers();
    forwardMutateAsync.mockReset();
  });

  it('renders the rich text editor toolbar', async () => {
    render(<ComposeDrawer open onClose={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Bold' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Italic' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Link' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Insert Image' })).not.toBeNull();
    expect(screen.getByTestId('compose-editor')).not.toBeNull();
  });

  it('toggles the bold toolbar button state', () => {
    const { rerender } = render(<ComposeDrawer open onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    rerender(<ComposeDrawer open onClose={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('includes editor HTML in the send payload as bodyHtml', async () => {
    mutateAsync.mockResolvedValue(undefined);
    render(<ComposeDrawer open onClose={jest.fn()} />);

    addToRecipient('client@example.com');
    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'Hello' },
    });
    fireEvent.change(screen.getByTestId('compose-editor'), {
      target: { value: 'Hello from editor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyHtml: '<p>Hello from editor</p>',
          trackingEnabled: true,
        }),
      );
    });
  });

  it('uses the forward mutation with the forwarded subject and body when mode is forward', async () => {
    forwardMutateAsync.mockResolvedValue(undefined);
    render(
      <ComposeDrawer
        open
        onClose={jest.fn()}
        mode="forward"
        forwardMessageId="message-1"
        defaultSubject="Fwd: Original subject"
        defaultBodyHtml="<div>Quoted body</div>"
      />,
    );

    addToRecipient('client@example.com');

    expect((screen.getByPlaceholderText('Email subject') as HTMLInputElement).value).toBe('Fwd: Original subject');

    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));

    await waitFor(() => {
      expect(forwardMutateAsync).toHaveBeenCalledWith({
        messageId: 'message-1',
        dto: expect.objectContaining({
          identityId: 'identity-1',
          to: ['client@example.com'],
          bodyHtml: '<div>Quoted body</div>',
        }),
      });
    });
  });

  it('uploads an image from the file picker and includes the CDN image in bodyHtml', async () => {
    mutateAsync.mockResolvedValue(undefined);
    render(<ComposeDrawer open onClose={jest.fn()} />);

    const file = new File(['image'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('compose-image-input'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/attachments/upload',
        expect.objectContaining({
          method: 'POST',
          service: 'comm',
        }),
      );
    });

    addToRecipient('client@example.com');
    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyHtml: '<p><img src="https://cdn.example.com/org-1/outbound/logo.png"></p>',
        }),
      );
    });
  });

  it('uploads a file attachment, shows a chip, and includes attachmentS3Keys in the send payload', async () => {
    mutateAsync.mockResolvedValue(undefined);
    render(<ComposeDrawer open onClose={jest.fn()} />);

    const file = new File(['pdf'], 'proposal.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('compose-attachment-input'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/attachments/upload',
        expect.objectContaining({
          method: 'POST',
          service: 'comm',
        }),
      );
    });

    expect(screen.getByText('logo.png')).not.toBeNull();

    addToRecipient('client@example.com');
    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentS3Keys: ['org-1/outbound/logo.png'],
        }),
      );
    });
  });

  it('renders an error message when the send mutation fails', async () => {
    mutateAsync.mockRejectedValue(new Error('failed'));
    render(<ComposeDrawer open onClose={jest.fn()} />);

    addToRecipient('client@example.com');
    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'Hello' },
    });
    fireEvent.change(screen.getByTestId('compose-editor'), {
      target: { value: 'Hello from editor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText('Failed to send email. Please try again.')).not.toBeNull();
  });

  it('renders an error message when image upload fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('upload failed'));
    render(<ComposeDrawer open onClose={jest.fn()} />);

    const file = new File(['image'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('compose-image-input'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('Failed to upload image. Please try again.')).not.toBeNull();
  });

  it('renders an error message when attachment upload fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('upload failed'));
    render(<ComposeDrawer open onClose={jest.fn()} />);

    const file = new File(['pdf'], 'proposal.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('compose-attachment-input'), {
      target: { files: [file] },
    });

    expect(await screen.findByText('Failed to upload attachment. Please try again.')).not.toBeNull();
  });

  it('adds a recipient chip when typing an email and pressing Enter', () => {
    render(<ComposeDrawer open onClose={jest.fn()} />);

    addToRecipient('client@example.com');

    expect(screen.getByText('client@example.com')).not.toBeNull();
  });

  it('shows an inline error and does not add a chip for an invalid email', () => {
    render(<ComposeDrawer open onClose={jest.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('recipient@example.com'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('recipient@example.com'), {
      key: 'Enter',
    });

    expect(screen.getByText('Invalid email: not-an-email')).not.toBeNull();
    expect(screen.queryByLabelText('Remove not-an-email')).toBeNull();
  });

  it('splits a pasted comma-separated list into recipient chips', () => {
    render(<ComposeDrawer open onClose={jest.fn()} />);

    fireEvent.paste(screen.getByPlaceholderText('recipient@example.com'), {
      clipboardData: {
        getData: () => 'a@b.com,c@d.com',
      },
    });

    expect(screen.getByText('a@b.com')).not.toBeNull();
    expect(screen.getByText('c@d.com')).not.toBeNull();
  });

  it('shows the BCC chip input when the BCC toggle is clicked', () => {
    render(<ComposeDrawer open onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'BCC' }));

    expect(screen.getByPlaceholderText('bcc@example.com')).not.toBeNull();
  });

  it('includes BCC chips in the send payload', async () => {
    mutateAsync.mockResolvedValue(undefined);
    render(<ComposeDrawer open onClose={jest.fn()} />);

    addToRecipient('client@example.com');
    addBccRecipient('hidden@example.com');
    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'Hello' },
    });
    fireEvent.change(screen.getByTestId('compose-editor'), {
      target: { value: 'Hello from editor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          bcc: ['hidden@example.com'],
        }),
      );
    });
  });

  it('writes a draft to localStorage after editor changes debounce', async () => {
    jest.useFakeTimers();
    render(<ComposeDrawer open onClose={jest.fn()} />);

    addToRecipient('draft@example.com');
    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'Draft subject' },
    });
    fireEvent.change(screen.getByTestId('compose-editor'), {
      target: { value: 'Draft body' },
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('comm:draft:user-1')).toBe(
        JSON.stringify({
          to: ['draft@example.com'],
          cc: [],
          bcc: [],
          subject: 'Draft subject',
          bodyHtml: '<p>Draft body</p>',
        }),
      );
    });
  });

  it('shows a restore draft banner when reopening with a saved draft', () => {
    window.localStorage.setItem(
      'comm:draft:user-1',
      JSON.stringify({
        to: ['restore@example.com'],
        cc: [],
        bcc: [],
        subject: 'Restore me',
        bodyHtml: '<p>Saved draft</p>',
      }),
    );

    render(<ComposeDrawer open onClose={jest.fn()} />);

    expect(screen.getByText('Restore draft?')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Discard' })).not.toBeNull();
  });

  it('removes the saved draft when discard is clicked', () => {
    window.localStorage.setItem(
      'comm:draft:user-1',
      JSON.stringify({
        to: ['discard@example.com'],
        cc: [],
        bcc: [],
        subject: 'Discard me',
        bodyHtml: '<p>Discard body</p>',
      }),
    );

    render(<ComposeDrawer open onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(window.localStorage.getItem('comm:draft:user-1')).toBeNull();
  });
});
