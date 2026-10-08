import { useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAdminCapabilities } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { Loading, ErrorState } from './States';

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
  /** The capabilities could not be loaded at all, which says nothing about the viewer's role. */
  isError: boolean;
  retry: () => void;
  capabilities: string[];
  has: (capability: string) => boolean;
};

export function useAdminAccess(): TAdminAccess {
  const { data, isLoading, isError, refetch } = useAdminCapabilities();
  const capabilities = data?.capabilities ?? NO_CAPABILITIES;
  const lookup = useMemo(() => new Set(capabilities), [capabilities]);
  const has = useCallback((capability: string) => lookup.has(capability), [lookup]);
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  return { isLoading, isError: isError && data == null, retry, capabilities, has };
}

/**
 * Redirects to the chat once the server confirms the viewer lacks `access:admin` (non-admins get
 * a successful, empty capability list). A failed lookup offers a retry instead of a redirect.
 */
export function Gate({ children }: { children: ReactNode }) {
  const localize = useLocalize();
  const { isLoading, isError, retry, has } = useAdminAccess();

  if (isLoading) {
    return <Loading />;
  }
  if (isError) {
    return <ErrorState message={localize('com_admin_access_error')} onRetry={retry} />;
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
