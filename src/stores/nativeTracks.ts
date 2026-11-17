/**
 * Latest audio and subtitle tracks reported by the native player.
 *
 * Empty unless a libvlc-built shell has a media loaded. HTML5 playback
 * never writes here, so the dock keeps its existing controls when the
 * native toggle is off.
 */
import { writable } from 'svelte/store';
import type { NativeTrackList } from '../lib/playerBackend';

export const EMPTY_NATIVE_TRACKS: NativeTrackList = { tracks: [], current: -1 };

export const nativeAudioTrackState = writable<NativeTrackList>(EMPTY_NATIVE_TRACKS);
export const nativeSpuTrackState = writable<NativeTrackList>(EMPTY_NATIVE_TRACKS);

export function clearNativeTracks(): void {
	nativeAudioTrackState.set(EMPTY_NATIVE_TRACKS);
	nativeSpuTrackState.set(EMPTY_NATIVE_TRACKS);
}
