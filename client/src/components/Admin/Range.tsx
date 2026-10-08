import { useMemo, useState, useCallback } from 'react';
import { Button } from '@librechat/client';
import type { TAdminUsageBucket, TAdminUsageRange } from 'librechat-data-provider';
import type { TRangePreset } from './format';
import { RANGE_PRESETS, bucketFor, rangeFor, floorToMinute } from './format';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type TRangeState = {
  preset: TRangePreset;
  setPreset: (preset: TRangePreset) => void;
  range: TAdminUsageRange;
  bucket: TAdminUsageBucket;
  /** Rolls the range end forward to now, refetching in place when it is already current. */
  retry: (refetch: () => void) => void;
};

const currentMinute = (): number => floorToMinute(Date.now());

/**
 * Keeps the selected preset and the instant its range ends at. Choosing a preset (including the
 * active one) or retrying moves the end to the current minute, so a long-open tab is never stuck
 * on the window it was first loaded with.
 */
export function useRange(initial: TRangePreset = '24h'): TRangeState {
  const [preset, setPresetState] = useState<TRangePreset>(initial);
  const [now, setNow] = useState(currentMinute);

  const setPreset = useCallback((next: TRangePreset) => {
    setPresetState(next);
    setNow(currentMinute());
  }, []);

  const retry = useCallback(
    (refetch: () => void) => {
      const next = currentMinute();
      if (next === now) {
        refetch();
        return;
      }
      setNow(next);
    },
    [now],
  );

  const range = useMemo(() => rangeFor(preset, now), [preset, now]);
  return { preset, setPreset, range, bucket: bucketFor(preset), retry };
}

const presetLabelKeys = {
  '24h': 'com_admin_range_24h',
  '7d': 'com_admin_range_7d',
  '30d': 'com_admin_range_30d',
  all: 'com_admin_range_all',
} as const;

export function RangePicker({ preset, setPreset }: Pick<TRangeState, 'preset' | 'setPreset'>) {
  const localize = useLocalize();
  return (
    <div
      role="group"
      aria-label={localize('com_admin_range_label')}
      className="inline-flex rounded-lg border border-border-light p-0.5"
    >
      {RANGE_PRESETS.map((option) => (
        <Button
          key={option}
          variant="ghost"
          size="sm"
          aria-pressed={option === preset}
          onClick={() => setPreset(option)}
          className={cn('h-8', option === preset && 'bg-surface-active text-text-primary')}
        >
          {localize(presetLabelKeys[option])}
        </Button>
      ))}
    </div>
  );
}
