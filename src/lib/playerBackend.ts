/**
 * Typed seam between the frontend and the feature-flagged native (libvlc)
 * media backend in `src-tauri/src/player.rs`.
 *
 * The shell still plays everything through HTML5 (`<audio>` / `<video>` in
 * the webview). Every `native*` call here resolves to `null` until the Rust
 * shell is rebuilt with `--features libvlc`; the commands exist in both
 * builds, but the stub half answers with an error, which `invokeCommand`
 * swallows into `null`. Callers MUST treat the native backend as OPTIONAL:
 * query `playerBackend()` once, keep HTML5 as the default path, and only
 * branch to `native*` when the shell reports `'native'`.
 */
import { hasTauri, invokeCommand } from './tauriFs';

export type PlayerBackend = 'html5' | 'native';

/** Query the shell for the compiled backend. Browser preview → 'html5'. */
export async function playerBackend(): Promise<PlayerBackend> {
	if (!hasTauri()) return 'html5';
	return (await invokeCommand<'html5' | 'native'>('player_probe')) ?? 'html5';
}

/**
 * Load a filesystem path or an allowlisted network URL into the native
 * backend (starts playing). Resolves to the media generation stamped on
 * `player://event`, or null when the command fails.
 */
export async function nativeLoad(path: string): Promise<number | null> {
	return invokeCommand<number>('player_load', { path });
}

export type NativeTrack = {
	id: number;
	name: string;
};

export type NativeTrackList = {
	tracks: NativeTrack[];
	current: number;
};

const EMPTY_TRACKS: NativeTrackList = { tracks: [], current: -1 };

/** Audio tracks of the loaded media. Empty until playback has opened them. */
export async function nativeAudioTracks(): Promise<NativeTrackList> {
	return (await invokeCommand<NativeTrackList>('player_audio_tracks')) ?? EMPTY_TRACKS;
}

/** Select an audio track by libvlc id. */
export async function nativeSetAudioTrack(id: number): Promise<void | null> {
	return invokeCommand<null>('player_set_audio_track', { id });
}

/** Subtitle tracks of the loaded media, including a disable entry when libvlc offers one. */
export async function nativeSpuTracks(): Promise<NativeTrackList> {
	return (await invokeCommand<NativeTrackList>('player_spu_tracks')) ?? EMPTY_TRACKS;
}

/** Select a subtitle track. `-1` disables subtitles. */
export async function nativeSetSpu(id: number): Promise<void | null> {
	return invokeCommand<null>('player_set_spu', { id });
}

/**
 * Add an external subtitle and select it. `path` is a filesystem path or
 * an http(s) URL. libvlc blends the subtitle into the video frame.
 */
export async function nativeAddSubtitle(path: string): Promise<void | null> {
	return invokeCommand<null>('player_add_subtitle', { path });
}

export type NativePlayerEvent = {
	kind: 'ended' | 'error';
	generation: number;
};

/** Resume playback of the loaded media. */
export async function nativePlay(): Promise<void | null> {
	return invokeCommand<null>('player_play');
}

/** Pause the loaded media. */
export async function nativePause(): Promise<void | null> {
	return invokeCommand<null>('player_pause');
}

/** Toggle play/pause; answers the new is-playing state. */
export async function nativeToggle(): Promise<boolean | null> {
	return invokeCommand<boolean>('player_toggle');
}

/** Stop and release the native player. */
export async function nativeStop(): Promise<void | null> {
	return invokeCommand<null>('player_stop');
}

/** Seek to an absolute position (seconds from the start). */
export async function nativeSeek(seconds: number): Promise<void | null> {
	return invokeCommand<null>('player_seek', { seconds });
}

/** Set the playback volume (0–200 percent, clamped on the Rust side). */
export async function nativeSetVolume(percent: number): Promise<void | null> {
	return invokeCommand<null>('player_set_volume', { percent });
}

/**
 * Apply the ten ISO band gains plus preamp, or bypass the equalizer.
 * `bands` length must be 10 (31.25 Hz through 16 kHz).
 */
export async function nativeSetEqualizer(
	enabled: boolean,
	preamp: number,
	bands: number[],
): Promise<void | null> {
	return invokeCommand<null>('player_set_equalizer', { enabled, preamp, bands });
}

/** Current `(time, length)` of the loaded media, in seconds. */
export async function nativePosition(): Promise<[number, number] | null> {
	return invokeCommand<[number, number]>('player_position');
}
