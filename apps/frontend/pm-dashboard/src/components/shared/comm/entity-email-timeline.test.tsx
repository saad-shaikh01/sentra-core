import type { ButtonHTMLAttributes } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EntityEmailTimeline } from './entity-email-timeline';

const mockUseEntityTimeline = jest.fn();

jest.mock('@/hooks/use-comm', () => ({
  useEntityTimeline: (...args: unknown[]) => mockUseEntityTimeline(...args),
}));

jest.mock('@/components/shared/comm/thread-view-drawer', () => ({
  ThreadViewDrawer: () => null,
}));

jest.mock('@/lib/format-date', () => ({
  timeAgo: jest.fn(() => 'just now'),
}));

jest.mock('@/lib/feature-flags', () => ({
  COMM_ENABLED: true,
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

describe('EntityEmailTimeline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseEntityTimeline.mockReset();
    mockUseEntityTimeline.mockReturnValue({
      data: {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isFetching: false,
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('debounces search input before updating the query params', () => {
    render(<EntityEmailTimeline entityType="lead" entityId="lead-1" />);

    fireEvent.change(screen.getByPlaceholderText('Search email timeline'), {
      target: { value: 'invoice' },
    });

    expect(mockUseEntityTimeline.mock.lastCall?.[2]).toEqual({
      page: 1,
      limit: 10,
      search: undefined,
      filter: 'all',
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mockUseEntityTimeline.mock.lastCall?.[2]).toEqual({
      page: 1,
      limit: 10,
      search: 'invoice',
      filter: 'all',
    });
  });

  it('changes the active filter when the unread tab is clicked', () => {
    render(<EntityEmailTimeline entityType="lead" entityId="lead-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

    expect(screen.getByRole('button', { name: 'Unread' }).getAttribute('aria-pressed')).toBe('true');
    expect(mockUseEntityTimeline.mock.lastCall?.[2]).toEqual({
      page: 1,
      limit: 10,
      search: undefined,
      filter: 'unread',
    });
  });

  it('shows the load more button when more pages exist', () => {
    mockUseEntityTimeline.mockReturnValue({
      data: {
        data: [
          {
            id: 'message-1',
            from: { email: 'client@example.com' },
            subject: 'Subject',
            snippet: 'Snippet',
          },
        ],
        meta: { total: 2, page: 1, limit: 10, totalPages: 2 },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      isFetching: false,
    });

    render(<EntityEmailTimeline entityType="lead" entityId="lead-1" />);

    expect(screen.getByRole('button', { name: 'Load more' })).not.toBeNull();
  });

  it('renders the error state when the timeline query fails', () => {
    mockUseEntityTimeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
      isFetching: false,
    });

    render(<EntityEmailTimeline entityType="lead" entityId="lead-1" />);

    expect(screen.getByText('Failed to load emails.')).not.toBeNull();
  });
});
