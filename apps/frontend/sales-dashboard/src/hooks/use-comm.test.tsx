import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarkThreadRead, useUnreadCount } from './use-comm';
import { useUIStore } from '@/stores/ui-store';

const mockApiFetch = jest.fn();
const mockMarkCommThreadRead = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    fetch: (...args: unknown[]) => mockApiFetch(...args),
    markCommThreadRead: (...args: unknown[]) => mockMarkCommThreadRead(...args),
  },
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/feature-flags', () => ({
  COMM_ENABLED: true,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderWithClient(children: ReactNode) {
  const queryClient = createQueryClient();
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>),
  };
}

function UnreadCountProbe() {
  const unread = useUnreadCount();

  if (unread.isError) {
    return <div>Error state</div>;
  }

  return <div>{unread.data?.total ?? 0}</div>;
}

function MarkReadProbe() {
  const markThreadRead = useMarkThreadRead();

  return (
    <button type="button" onClick={() => markThreadRead.mutate('thread-1')}>
      Mark read
    </button>
  );
}

describe('use-comm unread hooks', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockMarkCommThreadRead.mockReset();
    window.localStorage.clear();
    useUIStore.setState({
      commUnreadCount: 0,
      commUnreadTimestamp: null,
      commConnectionStatus: 'disconnected',
      commSyncProgress: {},
      commIdentityErrors: {},
    });
  });

  it('fetches unread count on mount and reconciles the stored value', async () => {
    window.localStorage.setItem('comm:unread', JSON.stringify({ count: 2, timestamp: 123 }));
    mockApiFetch.mockResolvedValue({ total: 5, byIdentity: { 'identity-1': 5 } });

    renderWithClient(<UnreadCountProbe />);

    expect(screen.getByText('2')).not.toBeNull();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/threads/unread-count', { service: 'comm' }),
    );
    await waitFor(() => expect(screen.getByText('5')).not.toBeNull());
    expect(useUIStore.getState().commUnreadCount).toBe(5);
    expect(JSON.parse(window.localStorage.getItem('comm:unread') ?? '{}').count).toBe(5);
  });

  it('renders an error state when unread count fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('network down'));

    renderWithClient(<UnreadCountProbe />);

    await waitFor(() => expect(screen.getByText('Error state')).not.toBeNull());
  });

  it('decrements unread count after markThreadRead succeeds', async () => {
    useUIStore.setState({ commUnreadCount: 3, commUnreadTimestamp: 321 });
    window.localStorage.setItem('comm:unread', JSON.stringify({ count: 3, timestamp: 321 }));
    mockMarkCommThreadRead.mockResolvedValue(undefined);

    renderWithClient(<MarkReadProbe />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    });

    await waitFor(() => expect(mockMarkCommThreadRead).toHaveBeenCalledWith('thread-1'));
    await waitFor(() => expect(useUIStore.getState().commUnreadCount).toBe(2));
    expect(JSON.parse(window.localStorage.getItem('comm:unread') ?? '{}').count).toBe(2);
  });
});
