import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { conversation } from '../testing/fixtures';
import Conversations, { normalizeFilters, validateFilters } from '../Conversations';

describe('admin conversations', () => {
  it('shows a loading state', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockReturnValue(pending());
    renderAdmin(<Conversations />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('lists conversations, applies filters and loads more', async () => {
    mockCapabilities();
    mocks.getAdminConversations
      .mockResolvedValueOnce({ conversations: [conversation], nextCursor: 'c2' })
      .mockResolvedValue({
        conversations: [{ ...conversation, conversationId: 'convo-2', title: 'Second' }],
        nextCursor: null,
      });
    renderAdmin(<Conversations />);
    expect(await screen.findByText('Dining hall hours')).toBeInTheDocument();
    expect(screen.getByText('Flagged')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(mocks.getAdminConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'c2' }),
    );

    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'sharples' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(mocks.getAdminConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'sharples' }),
      ),
    );
  });

  it('validates filters locally instead of letting the server reject them', () => {
    expect(validateFilters({ userId: 'not-an-id' })).toEqual({
      userId: 'com_admin_filter_user_id_invalid',
    });
    expect(validateFilters({ userId: '507f1f77bcf86cd799439011' })).toEqual({});
    expect(
      validateFilters({ from: '2026-09-09T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' }),
    ).toEqual({ range: 'com_admin_filter_range_invalid' });
    expect(normalizeFilters({ search: '  a ' })).toEqual({ search: undefined });
    expect(normalizeFilters({ search: ' sharples ' })).toEqual({ search: 'sharples' });
  });

  it('blocks an invalid user id with an inline message and clears it on edit', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockResolvedValue({
      conversations: [conversation],
      nextCursor: null,
    });
    renderAdmin(<Conversations />);
    await screen.findByText('Dining hall hours');

    const field = screen.getByLabelText('User ID');
    fireEvent.change(field, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a 24-character hexadecimal user ID.',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Enter a 24-character hexadecimal user ID.');
    expect(mocks.getAdminConversations).toHaveBeenCalledTimes(1);

    fireEvent.change(field, { target: { value: '507f1f77bcf86cd799439011' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(mocks.getAdminConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({ userId: '507f1f77bcf86cd799439011' }),
      ),
    );
  });

  it('rejects a from date after the to date', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockResolvedValue({ conversations: [], nextCursor: null });
    renderAdmin(<Conversations />);
    await screen.findByText('Nothing to show');

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-09T10:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-08T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(screen.getByRole('alert')).toHaveTextContent('From must be earlier than To.');
    expect(mocks.getAdminConversations).toHaveBeenCalledTimes(1);
  });

  it('drops a search shorter than the server minimum instead of sending it', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockResolvedValue({ conversations: [], nextCursor: null });
    renderAdmin(<Conversations />);
    await screen.findByText('Nothing to show');

    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: ' a ' } });
    fireEvent.change(screen.getByLabelText('User ID'), {
      target: { value: '507f1f77bcf86cd799439011' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(mocks.getAdminConversations).toHaveBeenCalledTimes(2));
    expect(mocks.getAdminConversations.mock.calls[1][0]).toEqual(
      expect.objectContaining({ search: undefined, userId: '507f1f77bcf86cd799439011' }),
    );
  });

  it('shows the server reason for a rejected request without a retry button', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockRejectedValue({
      response: { status: 400, data: { error: 'search must be at most 200 characters' } },
    });
    renderAdmin(<Conversations />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'search must be at most 200 characters',
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockResolvedValue({ conversations: [], nextCursor: null });
    renderAdmin(<Conversations />);
    expect(await screen.findByText('Nothing to show')).toBeInTheDocument();
  });

  it('shows a generic error state with retry for unexpected failures', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockRejectedValue({ response: { status: 500 } });
    renderAdmin(<Conversations />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this data.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
