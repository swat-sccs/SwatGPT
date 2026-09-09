import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { conversationDetail, flag } from '../testing/fixtures';
import Conversation from '../Conversation';

const routeOptions = {
  route: '/d/admin/conversations/convo-1',
  path: '/d/admin/conversations/:conversationId',
};

describe('admin conversation reader', () => {
  it('shows a loading state', async () => {
    mockCapabilities();
    mocks.getAdminConversation.mockReturnValue(pending());
    renderAdmin(<Conversation />, routeOptions);
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('renders messages, metadata, flags, export and flagging', async () => {
    mockCapabilities();
    mocks.getAdminConversation.mockResolvedValue(conversationDetail);
    mocks.flagAdminConversation.mockResolvedValue({ ...flag, id: 'flag-2', source: 'manual' });
    mocks.resolveAdminFlag.mockResolvedValue({ ...flag, resolvedAt: '2026-09-09T00:00:00.000Z' });
    renderAdmin(<Conversation />, routeOptions);

    expect(await screen.findByText('When does Sharples open?')).toBeInTheDocument();
    expect(screen.getByText('Sharples opens at 7:30 AM on weekdays.')).toBeInTheDocument();
    expect(screen.getByText('7,000 in / 40 out')).toBeInTheDocument();
    expect(screen.getByText('tools: dash_hours')).toBeInTheDocument();
    expect(screen.getByText('3 KB chunks')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Thumbs up' })).toBeInTheDocument();
    expect(screen.getByText('Contains a phone number')).toBeInTheDocument();

    const exportLink = screen.getByRole('link', { name: /Export JSONL/ });
    expect(exportLink).toHaveAttribute('href', '/api/admin/conversations/convo-1/export');

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(mocks.resolveAdminFlag).toHaveBeenCalledWith('flag-1'));

    fireEvent.click(screen.getByRole('button', { name: /^Flag$/ }));
    const reason = await screen.findByLabelText('Reason');
    fireEvent.change(reason, { target: { value: 'needs review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Flag conversation' }));
    await waitFor(() =>
      expect(mocks.flagAdminConversation).toHaveBeenCalledWith('convo-1', {
        reason: 'needs review',
      }),
    );
  });

  it('hides the export button without export:conversations', async () => {
    mockCapabilities(['access:admin', 'read:conversations']);
    mocks.getAdminConversation.mockResolvedValue(conversationDetail);
    renderAdmin(<Conversation />, routeOptions);
    await screen.findByText('When does Sharples open?');
    expect(screen.queryByRole('link', { name: /Export JSONL/ })).not.toBeInTheDocument();
  });

  it('shows an error state', async () => {
    mockCapabilities();
    mocks.getAdminConversation.mockRejectedValue(new Error('boom'));
    renderAdmin(<Conversation />, routeOptions);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
