import type { Status } from '@/lib/types';

interface StatusDotProps {
  status: Status;
  /** Tailwind size class. Defaults to 8px. */
  size?: string;
}

/**
 * 8px dot conveying problem status. Used in the Sidebar list and the TopBar
 * so both reuse the same visual vocabulary instead of inventing a new pill.
 *
 * Solved is green; attempted is a quieter amber (it's progress, not done);
 * unsolved is a faint mute dot that registers as "present" without drawing
 * any attention.
 */
export function StatusDot({ status, size = 'w-2 h-2' }: StatusDotProps) {
  const cls =
    status === 'solved' ? 'bg-good'
    : status === 'attempted' ? 'bg-warn/70'
    : 'bg-text-mute/30';
  return (
    <span
      className={`${size} rounded-full shrink-0 ${cls}`}
      role="img"
      aria-label={status}
    />
  );
}
