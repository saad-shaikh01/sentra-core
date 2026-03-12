import type { ReactNode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCommSocket } from './use-comm-socket';
import { useUIStore } from '@/stores/ui-store';

type SocketHandler = (payload?: unknown) => void | Promise<void>;

type MockSocket = {
  handlers: Record<string, SocketHandler | undefined>;
  on: jest.Mock<MockSocket, [string, SocketHandler]>;
  disconnect: jest.Mock<void, []>;
};

const mockIo = jest.fn();
const mockUseUnreadCount = jest.fn();
const mockFetch = jest.fn();
const mockToastSuccess = jest.fn();
const sockets: MockSocket[] = [];

function createMockSocket(): MockSocket {
  const socket = {} as MockSocket;
  socket.handlers = {};
  socket.on = jest.fn<MockSocket, [string, SocketHandler]>((event: string, handler: SocketHandler) => {
    socket.handlers[event] = handler;
    return socket;
  });
  socket.disconnect = jest.fn<void, []>();
  return socket;
}

jest.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

jest.mock('./use-comm', () => ({
  commKeys: {
    all: ['comm'],
    unreadCount: () => ['comm', 'unread-count'],
    threads: (params?: unknown) => ['comm', 'threads', params],
    thread: (id: string) => ['comm', 'threads', id],
    messages: (params?: unknown) => ['comm', 'messages', params],
    identities: () => ['comm', 'identities'],
  },
  useUnreadCount: () => mockUseUnreadCount(),
}));

jest.mock('@/lib/feature-flags', () => ({
  COMM_ENABLED: true,
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithClient(children: ReactNode) {
  const queryClient = createQueryClient();
  const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

  return {
    queryClient,
    invalidateQueriesSpy,
    ...render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>),
  };
}

function SocketProbe() {
  useCommSocket();
  return <div>socket-mounted</div>;
}

describe('useCommSocket unread synchronization', () => {
  beforeEach(() => {
    sockets.length = 0;
    mockIo.mockReset();
    mockUseUnreadCount.mockReset();
    mockFetch.mockReset();
    mockToastSuccess.mockReset();
    mockIo.mockImplementation(() => {
      const socket = createMockSocket();
      sockets.push(socket);
      return socket;
    });
    mockUseUnreadCount.mockReturnValue({ data: { total: 0, byIdentity: {} } });
    window.localStorage.clear();
    window.localStorage.setItem('accessToken', 'test-token');
    window.localStorage.setItem('refreshToken', 'refresh-token');
    useUIStore.setState({
      commUnreadCount: 0,
      commUnreadTimestamp: null,
      commConnectionStatus: 'disconnected',
      commSyncProgress: {},
      commIdentityErrors: {},
    });
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      writable: true,
      value: mockFetch,
    });
  });

  it('increments unread count when a message:new event arrives', async () => {
    renderWithClient(<SocketProbe />);

    await act(async () => {
      await sockets[0].handlers['message:new']?.({ threadId: 'thread-1' });
    });

    expect(useUIStore.getState().commUnreadCount).toBe(1);
  });

  it('re-fetches unread count when the socket reconnects', async () => {
    const { invalidateQueriesSpy } = renderWithClient(<SocketProbe />);

    await act(async () => {
      await sockets[0].handlers.disconnect?.();
      await sockets[0].handlers.connect?.();
    });

    await waitFor(() =>
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['comm', 'unread-count'] }),
    );
  });

  it('attempts token refresh when connect_error is an auth failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: jest.fn(),
    });

    renderWithClient(<SocketProbe />);

    await act(async () => {
      await sockets[0].handlers.connect_error?.(new Error('401 unauthorized'));
    });

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer refresh-token',
      },
    });
  });

  it('re-initializes the socket with a refreshed token after a successful refresh', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token',
      }),
    });

    renderWithClient(<SocketProbe />);

    await act(async () => {
      await sockets[0].handlers.connect_error?.(new Error('jwt expired'));
    });

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(2));
    expect(sockets[0].disconnect).toHaveBeenCalled();
    expect(mockIo.mock.calls[1][1]).toMatchObject({
      auth: { token: 'fresh-access-token' },
    });
    expect(window.localStorage.getItem('accessToken')).toBe('fresh-access-token');
    expect(window.localStorage.getItem('refreshToken')).toBe('fresh-refresh-token');
  });

  it('sets the connection status to error when refresh fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: jest.fn(),
    });

    renderWithClient(<SocketProbe />);

    await act(async () => {
      await sockets[0].handlers.connect_error?.(new Error('unauthorized'));
    });

    await waitFor(() => expect(useUIStore.getState().commConnectionStatus).toBe('error'));
    expect(mockIo).toHaveBeenCalledTimes(1);
  });

  it('shows a toast and clears sync progress when sync:complete arrives', async () => {
    useUIStore.getState().setCommSyncProgress('identity-1', 10, 20);

    renderWithClient(<SocketProbe />);

    await act(async () => {
      await sockets[0].handlers['sync:complete']?.({
        identityId: 'identity-1',
        email: 'agent@example.com',
        count: 42,
      });
    });

    expect(useUIStore.getState().commSyncProgress['identity-1']).toBeUndefined();
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Inbox sync complete for agent@example.com',
      '42 messages synced',
    );
  });
});
