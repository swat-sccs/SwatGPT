import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { pause } from '../testing/fixtures';
import Controls from '../Controls';

describe('admin controls', () => {
  it('shows a loading state', async () => {
    mockCapabilities();
    mocks.getAdminPause.mockReturnValue(pending());
    renderAdmin(<Controls />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('confirms before pausing and saves the message', async () => {
    mockCapabilities();
    mocks.getAdminPause.mockResolvedValue(pause);
    mocks.setAdminPause.mockImplementation(async (payload) => ({
      ...pause,
      paused: payload.paused,
      message: payload.message ?? pause.message,
    }));
    renderAdmin(<Controls />);
    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(screen.getByText(/by sccs-admin/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch'));
    expect(mocks.setAdminPause).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Pause SwatGPT' }));
    await waitFor(() =>
      expect(mocks.setAdminPause).toHaveBeenCalledWith({
        paused: true,
        message: pause.message,
      }),
    );
    expect(await screen.findByText('Paused')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Message shown to users'), {
      target: { value: 'Back soon' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save message' }));
    await waitFor(() =>
      expect(mocks.setAdminPause).toHaveBeenLastCalledWith({ paused: true, message: 'Back soon' }),
    );
  });

  it('hides controls without manage:controls', async () => {
    mockCapabilities(['access:admin', 'read:usage']);
    renderAdmin(<Controls />);
    expect(await screen.findByRole('note')).toHaveTextContent('manage:controls');
    expect(mocks.getAdminPause).not.toHaveBeenCalled();
  });

  it('shows an error state', async () => {
    mockCapabilities();
    mocks.getAdminPause.mockRejectedValue(new Error('boom'));
    renderAdmin(<Controls />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
