import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { flag, flagRow } from '../testing/fixtures';
import Flags, { countBySource } from '../Flags';

describe('admin flags', () => {
  it('shows a loading state', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockReturnValue(pending());
    renderAdmin(<Flags />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('lists unresolved flags, resolves one and includes resolved ones on toggle', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockResolvedValue({
      flags: [flagRow],
      nextCursor: null,
    });
    mocks.resolveAdminFlag.mockResolvedValue({ ...flag, resolvedAt: '2026-09-09T00:00:00.000Z' });
    renderAdmin(<Flags />);
    expect(await screen.findByText('Contains a phone number')).toBeInTheDocument();
    expect(screen.getByText('Dining hall hours · Ada Lovelace')).toBeInTheDocument();
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
      flags: [flagRow, { ...flagRow, id: 'flag-2', reason: 'Second flag' }],
      nextCursor: null,
    });
    mocks.resolveAdminFlag.mockRejectedValue(new Error('500'));
    renderAdmin(<Flags />, { showToast });

    const row = (await screen.findByText('Contains a phone number')).closest('li') as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Open conversation' })).toBeInTheDocument();
    expect(row.querySelector('time')).toHaveAttribute('datetime', flag.createdAt);
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

  it('counts loaded flags by source', () => {
    const manual = { ...flag, id: 'flag-2', source: 'manual' as const };
    expect(countBySource([flag, manual, { ...manual, id: 'flag-3' }])).toEqual({
      all: 3,
      manual: 2,
      keyword: 1,
    });
    expect(countBySource([])).toEqual({ all: 0, manual: 0, keyword: 0 });
  });

  it('filters the loaded queue by source with counted chips', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockResolvedValue({
      flags: [flagRow, { ...flagRow, id: 'flag-2', source: 'manual', reason: 'Reported by staff' }],
      nextCursor: null,
    });
    renderAdmin(<Flags />);
    await screen.findByText('Contains a phone number');

    const chips = screen.getByRole('group', { name: 'Flag source' });
    expect(within(chips).getByRole('button', { name: 'All (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(within(chips).getByRole('button', { name: 'Manual (1)' }));
    expect(screen.getByText('Reported by staff')).toBeInTheDocument();
    expect(screen.queryByText('Contains a phone number')).not.toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: 'Manual (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(chips).getByRole('button', { name: 'All (2)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(mocks.getAdminFlags).toHaveBeenCalledTimes(1);

    fireEvent.click(within(chips).getByRole('button', { name: 'Keyword (1)' }));
    expect(screen.getByText('Contains a phone number')).toBeInTheDocument();
    expect(screen.queryByText('Reported by staff')).not.toBeInTheDocument();
  });

  it('explains an empty source filter without calling the queue empty', async () => {
    mockCapabilities();
    mocks.getAdminFlags.mockResolvedValue({ flags: [flagRow], nextCursor: null });
    renderAdmin(<Flags />);
    await screen.findByText('Contains a phone number');

    fireEvent.click(screen.getByRole('button', { name: 'Manual (0)' }));
    expect(screen.getByText('No loaded flags come from this source')).toBeInTheDocument();
    expect(screen.queryByText('The review queue is empty')).not.toBeInTheDocument();
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
