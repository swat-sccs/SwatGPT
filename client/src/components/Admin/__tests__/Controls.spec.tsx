import { screen, within, fireEvent, waitFor } from '@testing-library/react';
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

  it('resumes without persisting a half-typed notice', async () => {
    mockCapabilities();
    mocks.getAdminPause.mockResolvedValue({ ...pause, paused: true });
    mocks.setAdminPause.mockImplementation(async (payload) => ({
      ...pause,
      paused: payload.paused,
      message: payload.message ?? pause.message,
    }));
    renderAdmin(<Controls />);
    expect(await screen.findByText('Paused')).toBeInTheDocument();

    const field = screen.getByLabelText('Message shown to users');
    fireEvent.change(field, { target: { value: 'Back in a few min' } });
    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(mocks.setAdminPause).toHaveBeenCalledWith({ paused: false }));
    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(field).toHaveValue('Back in a few min');
    expect(screen.getByRole('button', { name: 'Save message' })).not.toBeDisabled();
  });

  it('shows a pause failure inside the confirm dialog and clears it on reopen', async () => {
    const showToast = jest.fn();
    mockCapabilities();
    mocks.getAdminPause.mockResolvedValue(pause);
    mocks.setAdminPause.mockRejectedValueOnce(new Error('500'));
    renderAdmin(<Controls />, { showToast });

    fireEvent.click(await screen.findByRole('switch'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pause SwatGPT' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The action failed. Please try again.',
    );
    expect(showToast).toHaveBeenCalledWith({
      message: 'The action failed. Please try again.',
      status: 'error',
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch'));
    expect(within(await screen.findByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
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
