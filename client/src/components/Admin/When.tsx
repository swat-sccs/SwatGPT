import { EMPTY_VALUE, formatDate, formatRelative } from './format';

/** A relative time whose exact instant is one hover (or screen-reader read) away. */
export default function When({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  if (!iso) {
    return <span className={className}>{EMPTY_VALUE}</span>;
  }
  const absolute = formatDate(iso);
  return (
    <time dateTime={iso} title={absolute} aria-label={absolute} className={className}>
      {formatRelative(iso)}
    </time>
  );
}
