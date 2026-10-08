import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { TInterfaceConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

/** Denies the route unless a loaded startup config explicitly allows it; a failed fetch never falls back to upstream defaults. */
export default function InterfaceGate({
  allow,
  children,
}: {
  allow: (iface: TInterfaceConfig) => boolean;
  children: ReactNode;
}) {
  const { data: startupConfig, isLoading } = useGetStartupConfig();

  if (isLoading) {
    return null;
  }

  const iface = startupConfig?.interface;
  if (!iface || !allow(iface)) {
    return <Navigate to="/c/new" replace={true} />;
  }

  return <>{children}</>;
}
