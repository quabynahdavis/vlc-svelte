import { hasVideoExtension, isAudioFile, isVideoFile } from './audio';
import type { MediaItem } from './mock';
import type { Playlist, PlaylistTrack } from '../stores/playlists';
import type { WatchEntry } from '../stores/watch';

/** First saved track with this id, across the user's playlists. */
export function findPlaylistTrack(playlists: Playlist[], id: string): PlaylistTrack | null {
  if (!id) return null;

  for (const playlist of playlists) {
    const track = playlist.tracks.find((entry) => entry.id === id);
    if (track) return track;
  }

  return null;
}

/**
 * A playlist row uses the video library's preview when it is a library video
 * or a file with a video extension. Music-library tracks stay audio rows.
 */
export function playlistTrackIsVideo(
  track: PlaylistTrack,
  inLibrary: boolean,
  inMusic: boolean,
): boolean {
  if (inMusic) return false;
  if (inLibrary) return true;

  const candidates = [track.id, track.src, track.title].filter((value) => value.length > 0);
  if (candidates.some((value) => isAudioFile(value))) return false;

  return candidates.some((value) => hasVideoExtension(value) || isVideoFile(value));
}

/** Playback progress (0..1) for a video watch entry, or 0 when none matches. */
export function watchProgress(entries: WatchEntry[], mediaKey: string): number {
  const entry = entries.find((item) => item.mediaKey === mediaKey && item.type === 'video');
  if (!entry) return 0;
  if (entry.watched) return 1;
  if (!(entry.duration > 0)) return 0;
  return Math.min(1, Math.max(0, entry.position / entry.duration));
}

/** First matching video watch entry among the track id and its source. */
function watchProgressForKeys(entries: WatchEntry[], keys: string[]): number {
  for (const key of keys) {
    if (!key) continue;
    if (entries.some((item) => item.mediaKey === key && item.type === 'video')) {
      return watchProgress(entries, key);
    }
  }
  return 0;
}

/**
 * Library card model for a playlist video. A live library item keeps its
 * progress and artwork; otherwise the saved track plus any matching watch
 * entry supplies duration and progress.
 */
export function mediaItemForPlaylistTrack(
  track: PlaylistTrack,
  libraryItem: MediaItem | null,
  entries: WatchEntry[],
): MediaItem {
  if (libraryItem) return libraryItem;

  return {
    id: track.id,
    title: track.title,
    season: 1,
    episode: 0,
    durationSeconds: track.duration,
    progress: watchProgressForKeys(entries, [track.id, track.src]),
    src: track.src,
  };
}
