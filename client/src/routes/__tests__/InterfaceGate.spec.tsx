import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import InterfaceGate from '../InterfaceGate';

const mockUseGetStartupConfig = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

function renderGate(allow: Parameters<typeof InterfaceGate>[0]['allow']) {
  return render(
    <MemoryRouter initialEntries={['/skills']}>
      <Routes>
        <Route path="/c/new" element={<div>home</div>} />
        <Route
          path="/skills"
          element={
            <InterfaceGate allow={allow}>
              <div>skills</div>
            </InterfaceGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InterfaceGate', () => {
  beforeEach(() => {
    mockUseGetStartupConfig.mockReset();
  });

  it('renders children when the feature is allowed', () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: { interface: { skills: { use: true } } },
      isLoading: false,
    });

    renderGate((iface) =>
      typeof iface.skills === 'boolean' ? iface.skills : iface.skills?.use !== false,
    );

    expect(screen.getByText('skills')).toBeInTheDocument();
  });

  it('redirects home when the feature is disabled', () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: { interface: { skills: { use: false } } },
      isLoading: false,
    });

    renderGate((iface) =>
      typeof iface.skills === 'boolean' ? iface.skills : iface.skills?.use !== false,
    );

    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.queryByText('skills')).not.toBeInTheDocument();
  });

  it('renders nothing while startup config is loading', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined, isLoading: true });

    renderGate(() => true);

    expect(screen.queryByText('skills')).not.toBeInTheDocument();
    expect(screen.queryByText('home')).not.toBeInTheDocument();
  });
});
