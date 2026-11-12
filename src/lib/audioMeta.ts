import { invokeCommand } from './tauriFs';

export interface AudioMetadata {
  title?: string | null;
  artist?: string | null;
  albumArtist?: string | null;
  album?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  genre?: string | null;
  durationSeconds?: number | null;
  hasCover: boolean;
}

export async function readAudioMetadata(path: string): Promise<AudioMetadata | null> {
  return await invokeCommand<AudioMetadata>('read_audio_metadata', { path });
}

export async function coverGet(path: string): Promise<number[] | Uint8Array | null> {
  // Byte payloads reach TS as `number[] | Uint8Array`, matching `thumb_get`
  // in thumbnails.ts; `invokeCommand` resolves null on any failure.
  return await invokeCommand<number[] | Uint8Array>('cover_get', { path });
}

export async function coverExtract(path: string): Promise<number[] | Uint8Array | null> {
  return await invokeCommand<number[] | Uint8Array>('cover_extract', { path });
}
