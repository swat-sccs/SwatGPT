import { useMemo, useState } from 'react';
import { Button } from '@librechat/client';
import type { TAdminUsageBucket, TAdminUsageRange } from 'librechat-data-provider';
import type { TRangePreset } from './format';
import { RANGE_PRESETS, bucketFor, rangeFor } from './format';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type TRangeState = {
  preset: TRangePreset;
  setPreset: (preset: TRangePreset) => void;
  range: TAdminUsageRange;
  bucket: TAdminUsageBucket;
};

export function useRange(initial: TRangePreset = '24h'): TRangeState {
  const [preset, setPreset] = useState<TRangePreset>(initial);
  const range = useMemo(() => rangeFor(preset), [preset]);
  return { preset, setPreset, range, bucket: bucketFor(preset) };
}

const presetLabelKeys = {
  '24h': 'com_admin_range_24h',
  '7d': 'com_admin_range_7d',
  '30d': 'com_admin_range_30d',
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
