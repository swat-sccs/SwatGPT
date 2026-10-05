import { ToastContext } from '@librechat/client';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { TAdminConversationExport } from '~/data-provider';
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
    expect(screen.queryByRole('button', { name: /Export JSONL/ })).not.toBeInTheDocument();
    expect(mocks.getAdminConversationExport).not.toHaveBeenCalled();
  });

  describe('export', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    let downloads: Array<{ href: string; download: string | null }>;
    let clickSpy: jest.SpyInstance;

    beforeEach(() => {
      downloads = [];
      URL.createObjectURL = jest.fn(() => 'blob:export-1');
      URL.revokeObjectURL = jest.fn();
      clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloads.push({ href: this.href, download: this.getAttribute('download') });
      });
    });

    afterEach(() => {
      clickSpy.mockRestore();
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    const exportResponse = (headers: Record<string, string>) =>
      ({
        data: new Blob(['{"type":"conversation"}\n']),
        headers,
      }) as unknown as TAdminConversationExport;

    it('fetches through the authenticated client and downloads the blob', async () => {
      mockCapabilities();
      mocks.getAdminConversation.mockResolvedValue(conversationDetail);
      mocks.getAdminConversationExport.mockResolvedValue(
        exportResponse({
          'content-disposition': 'attachment; filename="swatgpt-convo-1.jsonl"',
        }),
      );
      renderAdmin(<Conversation />, routeOptions);

      fireEvent.click(await screen.findByRole('button', { name: /Export JSONL/ }));

      await waitFor(() => expect(downloads).toHaveLength(1));
      expect(mocks.getAdminConversationExport).toHaveBeenCalledTimes(1);
      expect(mocks.getAdminConversationExport.mock.calls[0][0]).toBe('convo-1');
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(downloads[0]).toEqual({ href: 'blob:export-1', download: 'swatgpt-convo-1.jsonl' });
    });

    it('falls back to <conversationId>.jsonl without a content-disposition header', async () => {
      mockCapabilities();
      mocks.getAdminConversation.mockResolvedValue(conversationDetail);
      mocks.getAdminConversationExport.mockResolvedValue(exportResponse({}));
      renderAdmin(<Conversation />, routeOptions);

      fireEvent.click(await screen.findByRole('button', { name: /Export JSONL/ }));

      await waitFor(() => expect(downloads).toHaveLength(1));
      expect(downloads[0].download).toBe('convo-1.jsonl');
    });

    it('shows an error toast and downloads nothing when the export fails', async () => {
      mockCapabilities();
      mocks.getAdminConversation.mockResolvedValue(conversationDetail);
      mocks.getAdminConversationExport.mockRejectedValue(new Error('401'));
      const showToast = jest.fn();
      renderAdmin(
        <ToastContext.Provider value={{ showToast }}>
          <Conversation />
        </ToastContext.Provider>,
        routeOptions,
      );

      const button = await screen.findByRole('button', { name: /Export JSONL/ });
      fireEvent.click(button);

      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith({
          message: 'Could not export this conversation.',
          status: 'error',
        }),
      );
      expect(downloads).toHaveLength(0);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(button).not.toBeDisabled();
    });
  });

  it('shows an error state', async () => {
    mockCapabilities();
    mocks.getAdminConversation.mockRejectedValue(new Error('boom'));
    renderAdmin(<Conversation />, routeOptions);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
