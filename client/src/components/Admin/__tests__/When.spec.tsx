import { render, screen } from '@testing-library/react';
import { formatDate } from '../format';
import When from '../When';

const NOW = Date.parse('2026-10-05T12:34:56.789Z');

describe('When', () => {
  it('renders the relative time with the absolute instant as its tooltip and name', () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const iso = '2026-10-05T10:34:56.789Z';
    render(<When iso={iso} />);
    const time = screen.getByText('2 hours ago');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', iso);
    expect(time).toHaveAttribute('title', formatDate(iso));
    expect(time).toHaveAccessibleName(formatDate(iso));
  });

  it('shows a placeholder for a missing instant', () => {
    render(<When iso={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
