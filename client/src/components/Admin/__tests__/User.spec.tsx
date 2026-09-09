import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { userDetail, controls } from '../testing/fixtures';
import User from '../User';

const routeOptions = { route: '/d/admin/users/user-1', path: '/d/admin/users/:userId' };

describe('admin user detail', () => {
  it('shows a loading state', async () => {
    mockCapabilities();
    mocks.getAdminUsageUser.mockReturnValue(pending());
    mocks.getAdminUserControls.mockReturnValue(pending());
    renderAdmin(<User />, routeOptions);
    expect((await screen.findAllByRole('status')).length).toBeGreaterThan(0);
  });

  it('renders the user, tiles, conversations and controls', async () => {
    mockCapabilities();
    mocks.getAdminUsageUser.mockResolvedValue(userDetail);
    mocks.getAdminUserControls.mockResolvedValue(controls);
    mocks.banAdminUser.mockResolvedValue({ ...controls, banned: true, banExpiresAt: null });
    renderAdmin(<User />, routeOptions);
    expect(await screen.findByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument();
    expect(mocks.getAdminUsageUser).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(screen.getByText('Dining hall hours')).toBeInTheDocument();
    expect(await screen.findByText(/Current balance: 50,000 credits/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ban user' }));
    await waitFor(() =>
      expect(mocks.banAdminUser).toHaveBeenCalledWith('user-1', {
        durationMs: 24 * 60 * 60 * 1000,
        reason: 'spam',
      }),
    );
    expect(await screen.findByRole('button', { name: 'Lift ban' })).toBeInTheDocument();
  });

  it('hides moderation without manage:controls', async () => {
    mockCapabilities(['access:admin', 'read:usage']);
    mocks.getAdminUsageUser.mockResolvedValue(userDetail);
    renderAdmin(<User />, routeOptions);
    await screen.findByRole('heading', { name: /Ada Lovelace/ });
    expect(screen.queryByText('Moderation')).not.toBeInTheDocument();
    expect(mocks.getAdminUserControls).not.toHaveBeenCalled();
  });

  it('shows an error state', async () => {
    mockCapabilities();
    mocks.getAdminUsageUser.mockRejectedValue(new Error('boom'));
    mocks.getAdminUserControls.mockRejectedValue(new Error('boom'));
    renderAdmin(<User />, routeOptions);
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
  });
});
