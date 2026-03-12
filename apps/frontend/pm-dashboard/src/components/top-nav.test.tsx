import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { TopNav } from './top-nav';

const mockUseUIStore = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/projects',
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    data: {
      meta: {
        total: 0,
      },
    },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: [],
  }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getAvailableApps: jest.fn(),
  },
}));

jest.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { commUnreadCount: number }) => unknown) =>
    selector(mockUseUIStore()),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>{children}</button>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  SelectValue: () => <span>PM Dashboard</span>,
}));

describe('TopNav comm unread badge', () => {
  beforeEach(() => {
    mockUseUIStore.mockReset();
  });

  it('renders the comm unread badge with the count from Zustand', () => {
    mockUseUIStore.mockReturnValue({ commUnreadCount: 7 });

    render(<TopNav />);

    expect(screen.getByLabelText('Email unread count: 7')).not.toBeNull();
    expect(screen.getByText('7')).not.toBeNull();
  });

  it('renders 99+ when the comm unread count exceeds 99', () => {
    mockUseUIStore.mockReturnValue({ commUnreadCount: 150 });

    render(<TopNav />);

    expect(screen.getByLabelText('Email unread count: 99+')).not.toBeNull();
    expect(screen.getByText('99+')).not.toBeNull();
  });
});
