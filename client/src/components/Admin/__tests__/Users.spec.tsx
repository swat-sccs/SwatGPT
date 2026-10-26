import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { TAdminUsageUsersResponse } from 'librechat-data-provider';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { user } from '../testing/fixtures';
import Users from '../Users';

describe('admin users', () => {
  it('shows a loading state', async () => {
    mockCapabilities();
    mocks.getAdminUsageUsers.mockReturnValue(pending());
    renderAdmin(<Users />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('lists users and re-sorts through the API', async () => {
    mockCapabilities();
    mocks.getAdminUsageUsers.mockResolvedValue({
      users: [user, { ...user, id: 'user-2', name: 'Grace Hopper', banned: true }],
      total: 2,
      limit: 25,
      offset: 0,
    });
    renderAdmin(<Users />);
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Banned')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
    expect(mocks.getAdminUsageUsers).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'tokens', offset: 0 }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Requests' }));
    await waitFor(() =>
      expect(mocks.getAdminUsageUsers).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'requests' }),
      ),
    );

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(mocks.getAdminUsageUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'grace' }),
      ),
    );
  });

  it('returns to the first page when the time range changes', async () => {
    mockCapabilities();
    mocks.getAdminUsageUsers.mockImplementation(async (params) => ({
      users: [user],
      total: 60,
      limit: 25,
      offset: params?.offset ?? 0,
    }));
    renderAdmin(<Users />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(mocks.getAdminUsageUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 25 }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '24 h' }));
    await waitFor(() =>
      expect(mocks.getAdminUsageUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 0, from: expect.any(String) }),
      ),
    );
    expect(await screen.findByText('Showing 1–1 of 60')).toBeInTheDocument();
  });

  it('keeps the footer on the visible page until the next page arrives', async () => {
    mockCapabilities();
    let release: (value: TAdminUsageUsersResponse) => void = () => undefined;
    const secondPage = new Promise<TAdminUsageUsersResponse>((resolve) => {
      release = resolve;
    });
    mocks.getAdminUsageUsers
      .mockResolvedValueOnce({ users: [user], total: 60, limit: 25, offset: 0 })
      .mockReturnValueOnce(secondPage);
    renderAdmin(<Users />);
    expect(await screen.findByText('Showing 1–1 of 60')).toBeInTheDocument();

    const next = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(next);
    await waitFor(() => expect(next).toBeDisabled());
    expect(screen.getByText('Showing 1–1 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    release({
      users: [user, { ...user, id: 'user-2', name: 'Grace Hopper' }],
      total: 60,
      limit: 25,
      offset: 25,
    });
    expect(await screen.findByText('Showing 26–27 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it('rolls the range end forward when retrying after a failure', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T12:00:30.000Z'));
    mockCapabilities();
    mocks.getAdminUsageUsers.mockRejectedValueOnce(new Error('boom'));
    renderAdmin(<Users />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mocks.getAdminUsageUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: '2026-10-01T12:00:00.000Z' }),
    );

    mocks.getAdminUsageUsers.mockResolvedValue({ users: [user], total: 1, limit: 25, offset: 0 });
    now.mockReturnValue(Date.parse('2026-10-01T13:05:10.000Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(mocks.getAdminUsageUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: '2026-10-01T13:05:00.000Z' }),
    );
  });

  it('shows an empty state', async () => {
    mockCapabilities();
    mocks.getAdminUsageUsers.mockResolvedValue({ users: [], total: 0, limit: 25, offset: 0 });
    renderAdmin(<Users />);
    expect(await screen.findByText('Nothing to show')).toBeInTheDocument();
  });

  it('shows an error state', async () => {
    mockCapabilities();
    mocks.getAdminUsageUsers.mockRejectedValue(new Error('boom'));
    renderAdmin(<Users />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
