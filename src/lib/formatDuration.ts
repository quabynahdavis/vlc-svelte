/**
 * Clock-style duration for library and music lists.
 *
 * Values are floored to whole seconds so tag/container floats (e.g. 212.5)
 * render as `3:32`, not `3:32.5`. Unknown or non-positive inputs are `0:00`.
 */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
