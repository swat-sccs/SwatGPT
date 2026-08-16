import { Navigate } from 'react-router-dom';
import { getConfigDefaults } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { TInterfaceConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

const defaultInterface = getConfigDefaults().interface;

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

  const iface = startupConfig?.interface ?? defaultInterface;
  if (!allow(iface)) {
    return <Navigate to="/c/new" replace={true} />;
  }

  return <>{children}</>;
}
