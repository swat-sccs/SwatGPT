import { screen, fireEvent, waitFor } from '@testing-library/react';
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
