import { screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('lists unresolved flags, resolves one and toggles resolved', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockResolvedValue({ flags: [flag], nextCursor: null });
    mocks.resolveAdminFlag.mockResolvedValue({ ...flag, resolvedAt: '2026-09-09T00:00:00.000Z' });
    renderAdmin(<Flags />);
    expect(await screen.findByText('Contains a phone number')).toBeInTheDocument();
    expect(mocks.getAdminFlags).toHaveBeenCalledWith(expect.objectContaining({ resolved: false }));

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(mocks.resolveAdminFlag).toHaveBeenCalledWith('flag-1'));

    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() =>
      expect(mocks.getAdminFlags).toHaveBeenCalledWith(expect.objectContaining({ resolved: true })),
    );
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
