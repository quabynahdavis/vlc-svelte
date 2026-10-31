import type { Track } from '../stores/player';

/**
 * Shared drag payload for moving a playable item between library surfaces and
 * the queue or playlist panels. The MIME type is custom so unrelated drags
 * (files, text, tabs) are ignored by the drop targets.
 */
export const TRACK_DRAG_TYPE = 'application/x-vlc-track';

export function startTrackDrag(event: DragEvent, track: Track): void {
  // Items without a playable source cannot be queued or added to a playlist.
  if (!event.dataTransfer || !track.src) {
    event.preventDefault();
    return;
  }

  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(TRACK_DRAG_TYPE, JSON.stringify(track));
  event.dataTransfer.setData('text/plain', track.title);
}

export function isTrackDrag(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(TRACK_DRAG_TYPE) ?? false;
}

export function readTrackDrag(event: DragEvent): Track | null {
  const raw = event.dataTransfer?.getData(TRACK_DRAG_TYPE);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Track> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'string' || typeof parsed.title !== 'string') return null;
    if (typeof parsed.src !== 'string' || !parsed.src) return null;

    return {
      id: parsed.id,
      title: parsed.title,
      artist: typeof parsed.artist === 'string' ? parsed.artist : undefined,
      duration:
        typeof parsed.duration === 'number' && Number.isFinite(parsed.duration)
          ? parsed.duration
          : 0,
      src: parsed.src,
    };
  } catch {
    return null;
  }
}
