import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { conversation } from '../testing/fixtures';
import Conversations from '../Conversations';

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

  it('shows an empty state', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockResolvedValue({ conversations: [], nextCursor: null });
    renderAdmin(<Conversations />);
    expect(await screen.findByText('Nothing to show')).toBeInTheDocument();
  });

  it('shows an error state', async () => {
    mockCapabilities();
    mocks.getAdminConversations.mockRejectedValue(new Error('boom'));
    renderAdmin(<Conversations />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
