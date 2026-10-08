import { useState, useEffect } from 'react';
import { Label, Input, Button } from '@librechat/client';
import type { FormEvent } from 'react';
import type { TAdminUserControls } from 'librechat-data-provider';
import { useBanUser, useUnbanUser, useSetUserBalance, useAdminUserControls } from '~/data-provider';
import { Loading, ErrorState, ActionError, useActionFailedToast } from './States';
import { formatDate, formatInt } from './format';
import { useLocalize } from '~/hooks';
import Pill from './Pill';

const HOUR_MS = 60 * 60 * 1000;
const BALANCE_NOTE_ID = 'admin-balance-disabled';

const durations = [
  { value: '1h', ms: HOUR_MS, labelKey: 'com_admin_ban_1h' },
  { value: '24h', ms: 24 * HOUR_MS, labelKey: 'com_admin_ban_24h' },
  { value: '7d', ms: 7 * 24 * HOUR_MS, labelKey: 'com_admin_ban_7d' },
  { value: 'permanent', ms: undefined, labelKey: 'com_admin_ban_permanent' },
] as const;

type DurationValue = (typeof durations)[number]['value'];

/** A blank field is not zero: only a whole, non-negative number of credits may be saved. */
export const parseCredits = (value: string): number | null => {
  if (value.trim() === '') {
    return null;
  }
  const credits = Number(value);
  return Number.isSafeInteger(credits) && credits >= 0 ? credits : null;
};

/** Shown under a lever the server reports as not enforced; an older server omits the flag. */
function NotEnforcedNote({ id, text }: { id?: string; text: string }) {
  return (
    <p id={id} role="note" className="w-full text-xs text-text-warning">
      {text}
    </p>
  );
}

function BanPanel({ controls }: { controls: TAdminUserControls }) {
  const localize = useLocalize();
  const ban = useBanUser();
  const unban = useUnbanUser();
  const actionFailed = useActionFailedToast();
  const [duration, setDuration] = useState<DurationValue>('24h');
  const [reason, setReason] = useState('');
  const notEnforced = controls.banEnforced === false && (
    <NotEnforcedNote text={localize('com_admin_ban_not_enforced')} />
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const durationMs = durations.find((option) => option.value === duration)?.ms;
    ban.mutate(
      { userId: controls.userId, payload: { durationMs, reason: reason.trim() || undefined } },
      { onSuccess: () => unban.reset() },
    );
  };

  const lift = () =>
    unban.mutate(
      { userId: controls.userId },
      { onSuccess: () => ban.reset(), onError: actionFailed },
    );

  if (controls.banned) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Pill tone="destructive">{localize('com_admin_status_banned')}</Pill>
          <p className="text-xs text-text-secondary">
            {controls.banExpiresAt
              ? localize('com_admin_ban_expires', { 0: formatDate(controls.banExpiresAt) })
              : localize('com_admin_ban_permanent')}
          </p>
        </div>
        <Button variant="outline" disabled={unban.isLoading} onClick={lift}>
          {localize('com_admin_unban')}
        </Button>
        {unban.isError && <ActionError />}
        {notEnforced}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="admin-ban-duration">{localize('com_admin_ban_duration')}</Label>
        <select
          id="admin-ban-duration"
          value={duration}
          onChange={(event) => setDuration(event.target.value as DurationValue)}
          className="flex h-10 rounded-lg border border-border-light bg-transparent px-3 text-sm text-text-primary"
        >
          {durations.map((option) => (
            <option key={option.value} value={option.value}>
              {localize(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        <Label htmlFor="admin-ban-reason">{localize('com_admin_ban_reason')}</Label>
        <Input
          id="admin-ban-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={localize('com_admin_ban_reason_placeholder')}
        />
      </div>
      <Button type="submit" variant="destructive" disabled={ban.isLoading}>
        {localize('com_admin_ban')}
      </Button>
      {ban.isError && <ActionError />}
      {notEnforced}
    </form>
  );
}

function BalancePanel({ controls }: { controls: TAdminUserControls }) {
  const localize = useLocalize();
  const setBalance = useSetUserBalance();
  const current = controls.balance?.tokenCredits ?? 0;
  const [credits, setCredits] = useState(String(current));
  const disabled = controls.balanceEnabled === false;

  useEffect(() => {
    setCredits(String(current));
  }, [current]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tokenCredits = parseCredits(credits);
    if (disabled || tokenCredits == null) {
      return;
    }
    setBalance.mutate({ userId: controls.userId, payload: { tokenCredits } });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="admin-balance">{localize('com_admin_balance_credits')}</Label>
        <Input
          id="admin-balance"
          type="number"
          min={0}
          step={1}
          required={true}
          disabled={disabled}
          aria-describedby={disabled ? BALANCE_NOTE_ID : undefined}
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          className="w-40 tabular-nums"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={disabled || setBalance.isLoading || parseCredits(credits) == null}
      >
        {localize('com_ui_save')}
      </Button>
      <p className="w-full text-xs text-text-secondary">
        {controls.balance
          ? localize('com_admin_balance_current', {
              0: formatInt(controls.balance.tokenCredits),
              1: controls.balance.autoRefillEnabled
                ? localize('com_admin_balance_refill_on', {
                    0: formatInt(controls.balance.refillAmount),
                    1: `${controls.balance.refillIntervalValue ?? ''} ${controls.balance.refillIntervalUnit ?? ''}`.trim(),
                  })
                : localize('com_admin_balance_refill_off'),
            })
          : localize('com_admin_balance_none')}
      </p>
      {setBalance.isError && <ActionError />}
      {disabled && (
        <NotEnforcedNote id={BALANCE_NOTE_ID} text={localize('com_admin_balance_disabled')} />
      )}
    </form>
  );
}

export default function Moderation({ userId }: { userId: string }) {
  const localize = useLocalize();
  const query = useAdminUserControls(userId);

  return (
    <section
      aria-labelledby="admin-moderation"
      className="space-y-4 rounded-lg border border-border-light p-4"
    >
      <h3 id="admin-moderation" className="text-sm font-medium text-text-secondary">
        {localize('com_admin_section_controls')}
      </h3>
      {query.isLoading && <Loading rows={2} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}
      {query.data && (
        <>
          <BanPanel controls={query.data} />
          <BalancePanel controls={query.data} />
        </>
      )}
    </section>
  );
}
