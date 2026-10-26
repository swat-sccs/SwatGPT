import { screen, within, fireEvent } from '@testing-library/react';
import { renderAdmin } from '../testing/utils';
import { points } from '../testing/fixtures';
import { formatBucket } from '../format';
import Chart from '../Chart';

describe('admin usage chart', () => {
  it('labels hour rows with their date so they stay unambiguous across midnight', () => {
    renderAdmin(<Chart points={points} bucket="hour" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show data table' }));

    const cells = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td')?.textContent);
    expect(cells).toEqual(points.map((point) => formatBucket(point.t, 'hour')));
    expect(cells[0]).toMatch(/\d{4}/);
  });

  it('links the toggle to the table it controls', () => {
    renderAdmin(<Chart points={points} bucket="day" />);
    const toggle = screen.getByRole('button', { name: 'Show data table' });
    const controlled = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(controlled).not.toBeNull();
    expect(controlled).not.toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(controlled as HTMLElement).getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide data table' })).toBe(toggle);
  });
});
