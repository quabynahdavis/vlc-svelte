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

/** Load an absolute file path into the native backend (starts playing). */
export async function nativeLoad(path: string): Promise<void | null> {
	return invokeCommand<null>('player_load', { path });
}

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

/** Current `(time, length)` of the loaded media, in seconds. */
export async function nativePosition(): Promise<[number, number] | null> {
	return invokeCommand<[number, number]>('player_position');
}
