import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { flag } from '../testing/fixtures';
import Flags from '../Flags';

describe('admin flags', () => {
  it('shows a loading state', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockReturnValue(pending());
    renderAdmin(<Flags />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('lists unresolved flags, resolves one and includes resolved ones on toggle', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockResolvedValue({ flags: [flag], nextCursor: null });
    mocks.resolveAdminFlag.mockResolvedValue({ ...flag, resolvedAt: '2026-09-09T00:00:00.000Z' });
    renderAdmin(<Flags />);
    expect(await screen.findByText('Contains a phone number')).toBeInTheDocument();
    expect(mocks.getAdminFlags).toHaveBeenCalledWith(expect.objectContaining({ resolved: false }));

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(mocks.resolveAdminFlag).toHaveBeenCalledWith('flag-1'));

    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(mocks.getAdminFlags.mock.calls.length).toBeGreaterThan(1));
    const unfiltered = mocks.getAdminFlags.mock.calls.at(-1)?.[0];
    expect(unfiltered?.resolved).toBeUndefined();
    expect(mocks.getAdminFlags).not.toHaveBeenCalledWith(
      expect.objectContaining({ resolved: true }),
    );
  });

  it('reports a failed resolve on the flag that failed', async () => {
    const showToast = jest.fn();
    mockCapabilities();
    mocks.getAdminFlags.mockResolvedValue({
      flags: [flag, { ...flag, id: 'flag-2', reason: 'Second flag' }],
      nextCursor: null,
    });
    mocks.resolveAdminFlag.mockRejectedValue(new Error('500'));
    renderAdmin(<Flags />, { showToast });

    const row = (await screen.findByText('Contains a phone number')).closest('li') as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Open conversation' })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Resolve' }));

    expect(await within(row).findByRole('alert')).toHaveTextContent(
      'The action failed. Please try again.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(showToast).toHaveBeenCalledWith({
      message: 'The action failed. Please try again.',
      status: 'error',
    });
  });

  it('shows an empty queue', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockResolvedValue({ flags: [], nextCursor: null });
    renderAdmin(<Flags />);
    expect(await screen.findByText('The review queue is empty')).toBeInTheDocument();
  });

  it('shows an error state', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockRejectedValue(new Error('boom'));
    renderAdmin(<Flags />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
