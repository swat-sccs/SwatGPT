import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderAdmin, mocks } from '../testing/utils';
import Moderation, { parseCredits } from '../Moderation';
import { controls } from '../testing/fixtures';

const BAN_NOTE = /Bans are not enforced on this server/;
const BALANCE_NOTE = /Balance is not enabled on this server/;
const enforced = { ...controls, banEnforced: true, balanceEnabled: true };

const FAILED = { message: 'The action failed. Please try again.', status: 'error' };

describe('admin moderation', () => {
  it('only accepts whole, non-negative credit amounts', () => {
    expect(parseCredits('')).toBeNull();
    expect(parseCredits('   ')).toBeNull();
    expect(parseCredits('-1')).toBeNull();
    expect(parseCredits('1.5')).toBeNull();
    expect(parseCredits('abc')).toBeNull();
    expect(parseCredits('0')).toBe(0);
    expect(parseCredits('1e3')).toBe(1000);
  });

  it('localizes the auto-refill interval', async () => {
    mocks.getAdminUserControls.mockResolvedValue(enforced);
    renderAdmin(<Moderation userId="user-1" />);
    expect(
      await screen.findByText(/Auto-refill adds 10,000 every 1 day\(s\)\./),
    ).toBeInTheDocument();
  });

  it('never saves a cleared balance field as zero', async () => {
    mocks.getAdminUserControls.mockResolvedValue(enforced);
    renderAdmin(<Moderation userId="user-1" />);
    const field = await screen.findByLabelText('Token credits');
    const save = screen.getByRole('button', { name: 'Save' });

    fireEvent.change(field, { target: { value: '' } });
    expect(field).toBeRequired();
    expect(save).toBeDisabled();
    fireEvent.submit(field.closest('form') as HTMLFormElement);
    expect(mocks.setAdminUserBalance).not.toHaveBeenCalled();

    mocks.setAdminUserBalance.mockResolvedValue(enforced);
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(mocks.setAdminUserBalance).toHaveBeenCalledWith('user-1', { tokenCredits: 0 }),
    );
  });

  it('reports a failed unban instead of silently re-enabling the button', async () => {
    const showToast = jest.fn();
    mocks.getAdminUserControls.mockResolvedValue({ ...enforced, banned: true });
    mocks.unbanAdminUser.mockRejectedValue(new Error('500'));
    renderAdmin(<Moderation userId="user-1" />, { showToast });

    fireEvent.click(await screen.findByRole('button', { name: 'Lift ban' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED.message);
    expect(showToast).toHaveBeenCalledWith(FAILED);
    expect(screen.getByRole('button', { name: 'Lift ban' })).not.toBeDisabled();
  });

  it('shows no enforcement notes when both levers are enforced', async () => {
    mocks.getAdminUserControls.mockResolvedValue(enforced);
    renderAdmin(<Moderation userId="user-1" />);

    expect(await screen.findByLabelText('Token credits')).not.toBeDisabled();
    expect(screen.queryByText(BAN_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByText(BALANCE_NOTE)).not.toBeInTheDocument();
  });

  it.each([false, true])('notes that bans are not enforced (banned: %p)', async (banned) => {
    mocks.getAdminUserControls.mockResolvedValue({ ...enforced, banned, banEnforced: false });
    renderAdmin(<Moderation userId="user-1" />);

    expect(await screen.findByText(BAN_NOTE)).toHaveAttribute('role', 'note');
    expect(screen.queryByText(BALANCE_NOTE)).not.toBeInTheDocument();
  });

  it('disables the balance panel with a note when balance is disabled', async () => {
    mocks.getAdminUserControls.mockResolvedValue({ ...enforced, balanceEnabled: false });
    renderAdmin(<Moderation userId="user-1" />);

    const field = await screen.findByLabelText('Token credits');
    const note = screen.getByText(BALANCE_NOTE);
    expect(field).toBeDisabled();
    expect(field).toHaveAttribute('aria-describedby', note.id);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.submit(field.closest('form') as HTMLFormElement);
    expect(mocks.setAdminUserBalance).not.toHaveBeenCalled();
    expect(screen.queryByText(BAN_NOTE)).not.toBeInTheDocument();
  });
});
