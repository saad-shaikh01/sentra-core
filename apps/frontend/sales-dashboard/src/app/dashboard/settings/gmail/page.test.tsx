import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserRole } from '@sentra-core/types';
import type { ReactNode } from 'react';
import GmailSettingsPageWrapper from './page';

const mockUseSearchParams = jest.fn();
const mockUseIdentities = jest.fn();
const mockUseDisconnectIdentity = jest.fn();
const mockUseInitiateOAuth = jest.fn();
const mockUseAuth = jest.fn();
const mockRefetch = jest.fn();
const mockApiFetch = jest.fn();
const mockUIState: {
  commSyncProgress: Record<string, unknown>;
  commIdentityErrors: Record<string, string>;
} = {
  commSyncProgress: {},
  commIdentityErrors: {},
};

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock('@/components/shared', () => ({
  PageHeader: ({
    title,
    description,
    action,
  }: {
    title: string;
    description: string;
    action?: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    className?: string;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} data-variant={variant} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/hooks/use-comm', () => ({
  useIdentities: () => mockUseIdentities(),
  useDisconnectIdentity: () => mockUseDisconnectIdentity(),
  useInitiateOAuth: () => mockUseInitiateOAuth(),
  commKeys: {
    identities: () => ['comm', 'identities'],
  },
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
}));

jest.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { commSyncProgress: Record<string, unknown>; commIdentityErrors: Record<string, string> }) => unknown) =>
    selector(mockUIState),
}));

jest.mock('@/lib/api', () => ({
  api: {
    setDefaultIdentity: jest.fn(),
    fetch: (...args: unknown[]) => mockApiFetch(...args),
  },
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/format-date', () => ({
  timeAgo: () => 'just now',
}));

describe('GmailSettingsPage', () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue({
      get: jest.fn().mockReturnValue(null),
    });
    mockUseDisconnectIdentity.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    mockUseInitiateOAuth.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    mockApiFetch.mockResolvedValue({
      data: [
        { id: 'brand-1', name: 'Brand One' },
        { id: 'brand-2', name: 'Brand Two' },
      ],
    });
    mockUIState.commSyncProgress = {};
    mockUIState.commIdentityErrors = {};
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the privileged visibility copy and opens the connect modal with brand options', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: UserRole.ADMIN },
    });
    mockUseIdentities.mockReturnValue({
      data: [
        {
          id: 'identity-1',
          email: 'owner@example.com',
          displayName: 'Owner Mailbox',
          isDefault: true,
          sendAsAliases: [],
          syncState: { status: 'active', lastSyncAt: null, lastError: null },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<GmailSettingsPageWrapper />);

    expect(
      screen.getByText('Showing all Gmail identities connected in your organization.'),
    ).toBeTruthy();
    expect(screen.getByText('Owner Mailbox')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /connect gmail/i }));

    expect(screen.getByText('Connect Gmail Account')).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'Brand One' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Brand Two' })).toBeTruthy();
  });

  it('renders the identities load error state and retries on click', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: UserRole.FRONTSELL_AGENT },
    });
    mockUseIdentities.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('network down'),
      refetch: mockRefetch,
    });

    render(<GmailSettingsPageWrapper />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Showing only the Gmail identities assigned to you.')).toBeTruthy();
    expect(screen.getByText('Failed to load Gmail identities')).toBeTruthy();
    expect(screen.getByText('network down')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders the brand load error inside the connect modal when the brands API fails', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: UserRole.ADMIN },
    });
    mockUseIdentities.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockApiFetch.mockRejectedValue(new Error('brands unavailable'));

    render(<GmailSettingsPageWrapper />);

    fireEvent.click(screen.getByRole('button', { name: /connect gmail/i }));

    expect(await screen.findByText('brands unavailable')).toBeTruthy();
  });

  it('shows the degraded identity banner and reconnects with the identity brand id', async () => {
    const reconnectSpy = jest.fn().mockResolvedValue({});
    mockUseInitiateOAuth.mockReturnValue({
      mutateAsync: reconnectSpy,
      isPending: false,
    });
    mockUseAuth.mockReturnValue({
      user: { role: UserRole.ADMIN },
    });
    mockUseIdentities.mockReturnValue({
      data: [
        {
          id: 'identity-1',
          brandId: 'brand-1',
          email: 'owner@example.com',
          displayName: 'Owner Mailbox',
          isDefault: true,
          sendAsAliases: [],
          syncState: { status: 'error', lastSyncAt: null, lastError: 'oauth refresh failed' },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUIState.commIdentityErrors = { 'identity-1': 'oauth refresh failed' };

    render(<GmailSettingsPageWrapper />);

    expect(await screen.findByText('This account has an error: oauth refresh failed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /reconnect/i }));

    await waitFor(() => {
      expect(reconnectSpy).toHaveBeenCalledWith('brand-1');
    });
  });

  it('shows disconnect confirmation and calls the disconnect mutation on confirm', async () => {
    const disconnectSpy = jest.fn().mockResolvedValue(undefined);
    mockUseDisconnectIdentity.mockReturnValue({
      mutateAsync: disconnectSpy,
      isPending: false,
    });
    mockUseAuth.mockReturnValue({
      user: { role: UserRole.ADMIN },
    });
    mockUseIdentities.mockReturnValue({
      data: [
        {
          id: 'identity-1',
          brandId: 'brand-1',
          email: 'owner@example.com',
          displayName: 'Owner Mailbox',
          isDefault: true,
          sendAsAliases: [],
          syncState: { status: 'active', lastSyncAt: null, lastError: null },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<GmailSettingsPageWrapper />);

    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    fireEvent.click(screen.getByRole('button', { name: /^disconnect$/i }));

    await waitFor(() => {
      expect(disconnectSpy).toHaveBeenCalledWith('identity-1');
    });
  });
});
