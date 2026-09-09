import type { ReactNode } from 'react';
import { cn } from '~/utils';

export type TPillTone = 'neutral' | 'warning' | 'destructive';

const toneClasses: Record<TPillTone, string> = {
  neutral: 'border-border-medium text-text-secondary',
  warning: 'border-border-medium text-text-warning',
  destructive: 'border-border-medium text-text-destructive',
};

export default function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: TPillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
