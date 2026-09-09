import { screen } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks, CHAT_HOME } from '../testing/utils';
import { Gate } from '../access';

const SECRET = 'secret';

describe('admin access gate', () => {
  it('renders a loading status while capabilities load', () => {
    mocks.getAdminCapabilities.mockReturnValue(pending());
    renderAdmin(
      <Gate>
        <div>{SECRET}</div>
      </Gate>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it('redirects to the chat when access:admin is missing', async () => {
    mockCapabilities(['read:usage']);
    renderAdmin(
      <Gate>
        <div>{SECRET}</div>
      </Gate>,
    );
    expect(await screen.findByText(CHAT_HOME)).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it('redirects to the chat when the capabilities request fails', async () => {
    mocks.getAdminCapabilities.mockRejectedValue(new Error('forbidden'));
    renderAdmin(
      <Gate>
        <div>{SECRET}</div>
      </Gate>,
    );
    expect(await screen.findByText(CHAT_HOME)).toBeInTheDocument();
  });

  it('renders children when access:admin is granted', async () => {
    mockCapabilities(['access:admin']);
    renderAdmin(
      <Gate>
        <div>{SECRET}</div>
      </Gate>,
    );
    expect(await screen.findByText(SECRET)).toBeInTheDocument();
  });
});
