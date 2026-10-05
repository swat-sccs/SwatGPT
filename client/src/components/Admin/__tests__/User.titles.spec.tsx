import { screen } from '@testing-library/react';
import { renderAdmin, mockCapabilities, mocks } from '../testing/utils';
import { userDetail } from '../testing/fixtures';
import User from '../User';

const routeOptions = { route: '/d/admin/users/user-1', path: '/d/admin/users/:userId' };

describe('admin user detail without read:conversations', () => {
  it('omits the recent conversations section when the server hides titles', async () => {
    mockCapabilities(['access:admin', 'read:usage']);
    mocks.getAdminUsageUser.mockResolvedValue({
      ...userDetail,
      recentConversations: [],
      conversationsHidden: true,
    });
    renderAdmin(<User />, routeOptions);
    expect(await screen.findByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument();
    expect(screen.queryByText('Recent conversations')).not.toBeInTheDocument();
    expect(screen.queryByText('Dining hall hours')).not.toBeInTheDocument();
  });
});
