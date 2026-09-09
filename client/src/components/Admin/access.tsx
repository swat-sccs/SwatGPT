import { useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAdminCapabilities } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { Loading } from './States';

export const AdminCapability = {
  ACCESS: 'access:admin',
  USAGE: 'read:usage',
  CONVERSATIONS: 'read:conversations',
  EXPORT: 'export:conversations',
  CONTROLS: 'manage:controls',
} as const;

export type TAdminCapability = (typeof AdminCapability)[keyof typeof AdminCapability];

const NO_CAPABILITIES: string[] = [];

export type TAdminAccess = {
  isLoading: boolean;
  capabilities: string[];
  has: (capability: string) => boolean;
};

export function useAdminAccess(): TAdminAccess {
  const { data, isLoading } = useAdminCapabilities();
  const capabilities = data?.capabilities ?? NO_CAPABILITIES;
  const lookup = useMemo(() => new Set(capabilities), [capabilities]);
  const has = useCallback((capability: string) => lookup.has(capability), [lookup]);
  return { isLoading, capabilities, has };
}

/** Redirects to the chat when the viewer lacks `access:admin`; renders nothing while loading. */
export function Gate({ children }: { children: ReactNode }) {
  const { isLoading, has } = useAdminAccess();

  if (isLoading) {
    return <Loading />;
  }
  if (!has(AdminCapability.ACCESS)) {
    return <Navigate to="/c/new" replace={true} />;
  }
  return <>{children}</>;
}

/** Hides a section behind a specific capability, explaining why when it is missing. */
export function Require({
  capability,
  children,
}: {
  capability: TAdminCapability;
  children: ReactNode;
}) {
  const localize = useLocalize();
  const { has } = useAdminAccess();

  if (has(capability)) {
    return <>{children}</>;
  }
  return (
    <p
      role="note"
      className="rounded-lg border border-border-medium p-4 text-sm text-text-secondary"
    >
      {localize('com_admin_no_permission', { 0: capability })}
    </p>
  );
}
