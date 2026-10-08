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
        <Route path="/c/new" element={<div data-testid="home" />} />
        <Route
          path="/skills"
          element={
            <InterfaceGate allow={allow}>
              <div data-testid="skills" />
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

    expect(screen.getByTestId('skills')).toBeInTheDocument();
  });

  it('redirects home when the feature is disabled', () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: { interface: { skills: { use: false } } },
      isLoading: false,
    });

    renderGate((iface) =>
      typeof iface.skills === 'boolean' ? iface.skills : iface.skills?.use !== false,
    );

    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('skills')).not.toBeInTheDocument();
  });

  it('redirects home instead of using upstream defaults when the config request fails', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const allow = jest.fn(() => true);

    renderGate(allow);

    expect(allow).not.toHaveBeenCalled();
    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('skills')).not.toBeInTheDocument();
  });

  it('redirects home when the loaded config carries no interface block', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: {}, isLoading: false });

    renderGate(() => true);

    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('skills')).not.toBeInTheDocument();
  });

  it('renders nothing while startup config is loading', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined, isLoading: true });

    renderGate(() => true);

    expect(screen.queryByTestId('skills')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home')).not.toBeInTheDocument();
  });
});
