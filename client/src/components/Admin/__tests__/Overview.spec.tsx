import { screen } from '@testing-library/react';
import { renderAdmin, mockCapabilities, pending, mocks } from '../testing/utils';
import { summary, timeseries, models } from '../testing/fixtures';
import Overview from '../Overview';

describe('admin overview', () => {
  it('shows a loading state', async () => {
    mockCapabilities();
    mocks.getAdminUsageSummary.mockReturnValue(pending());
    mocks.getAdminUsageTimeseries.mockReturnValue(pending());
    mocks.getAdminUsageModels.mockReturnValue(pending());
    renderAdmin(<Overview />);
    expect((await screen.findAllByRole('status')).length).toBeGreaterThan(0);
  });

  it('renders tiles, chart and models on success', async () => {
    mockCapabilities();
    mocks.getAdminUsageSummary.mockResolvedValue(summary);
    mocks.getAdminUsageTimeseries.mockResolvedValue(timeseries);
    mocks.getAdminUsageModels.mockResolvedValue({ models });
    renderAdmin(<Overview />);
    expect(await screen.findByText('1.3K')).toBeInTheDocument();
    expect(screen.getByText('0.9%')).toBeInTheDocument();
    expect(screen.getAllByText('812 ms').length).toBeGreaterThan(0);
    expect(screen.getByText('83%')).toBeInTheDocument();
    expect(await screen.findByText('qwen3.6-35b')).toBeInTheDocument();
    expect(screen.getByText('Requests and errors')).toBeInTheDocument();
    expect(mocks.getAdminUsageTimeseries).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'hour' }),
    );
  });

  it('renders an error state with retry', async () => {
    mockCapabilities();
    mocks.getAdminUsageSummary.mockRejectedValue(new Error('boom'));
    mocks.getAdminUsageTimeseries.mockRejectedValue(new Error('boom'));
    mocks.getAdminUsageModels.mockRejectedValue(new Error('boom'));
    renderAdmin(<Overview />);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBe(3);
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBe(3);
  });

  it('explains when read:usage is missing', async () => {
    mockCapabilities(['access:admin']);
    renderAdmin(<Overview />);
    expect(await screen.findByRole('note')).toHaveTextContent('read:usage');
  });
});
