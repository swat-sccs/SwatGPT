import { screen } from '@testing-library/react';
import { renderAdmin } from '../testing/utils';
import Admin from '~/components/Nav/Settings/Admin';

describe('admin settings entry', () => {
  it('keeps the visible link text as its accessible name', () => {
    renderAdmin(<Admin />);
    const link = screen.getByRole('link', { name: 'Open Admin dashboard' });
    expect(link).toHaveAttribute('href', '/d/admin');
    expect(link).not.toHaveAttribute('aria-labelledby');
  });
});
