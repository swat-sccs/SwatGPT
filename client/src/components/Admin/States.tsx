import { useCallback } from 'react';
import { Button, Skeleton, useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';

const SKELETON_ROWS = [0, 1, 2, 3];

export function Loading({ rows = 4 }: { rows?: number }) {
  const localize = useLocalize();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={localize('com_ui_loading')}
      className="space-y-3"
    >
      {SKELETON_ROWS.slice(0, rows).map((row) => (
        <Skeleton key={row} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const localize = useLocalize();
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-lg border border-border-medium p-4 text-sm text-text-destructive"
    >
      <span>{message ?? localize('com_admin_error_loading')}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {localize('com_ui_retry')}
        </Button>
      )}
    </div>
  );
}

export function Empty({ message }: { message?: string }) {
  const localize = useLocalize();
  return (
    <p
      role="status"
      className="rounded-lg border border-dashed border-border-medium p-6 text-center text-sm text-text-secondary"
    >
      {message ?? localize('com_admin_empty')}
    </p>
  );
}

export function ActionError() {
  const localize = useLocalize();
  return (
    <p role="alert" className="w-full text-sm text-text-destructive">
      {localize('com_admin_action_failed')}
    </p>
  );
}

/** Announces a failed admin mutation, for actions whose button gives no lasting feedback. */
export function useActionFailedToast(): () => void {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  return useCallback(
    () => showToast({ message: localize('com_admin_action_failed'), status: 'error' }),
    [localize, showToast],
  );
}
