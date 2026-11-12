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

/**
 * Waveform peaks for the seekbar, mirroring the thumb/cover commands.
 * `waveform_get` reads a previously persisted peak array (little-endian f32
 * decoded Rust-side), `waveform_generate` computes + persists + returns in a
 * single IPC roundtrip. Both resolve null on any failure so callers fall
 * back to the plain progress bar.
 */
export async function waveformGet(path: string): Promise<number[] | null> {
  return await invokeCommand<number[]>('waveform_get', { path });
}

export async function waveformGenerate(
  path: string,
  buckets = 800,
): Promise<number[] | null> {
  return await invokeCommand<number[]>('waveform_generate', { path, buckets });
}
