<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { Check, ChevronLeft, ChevronRight, Film, Library, Minimize, Music, PictureInPicture, Radio, Volume2, VolumeX, X } from 'lucide-svelte';
  import CompactLibraryOverlay from '../components/CompactLibraryOverlay.svelte';
  import NextEpisodePrompt from '../components/NextEpisodePrompt.svelte';
  import RightDock from '../components/RightDock.svelte';
  import TransportBar from '../components/TransportBar.svelte';
  import {
    DOUBLE_CLICK_DELAY_MS,
    VOLUME_HUD_DURATION_MS,
    WHEEL_VOLUME_FINE_STEP,
    WHEEL_VOLUME_STEP,
    toggleFullscreen,
    wheelNotches,
  } from '../lib/gestures';
  import { handleHorizontalWheel, scrollRailBy } from '../lib/horizontalScroll';
  import {
    ensureAudioAnalyser,
    resetNativePcmSchedule,
    resumeAudioAnalyser,
    setNativePcmAudible,
    setNativePcmPlaying,
    startNativePcmPlayback,
    stopNativePcmPlayback,
  } from '../lib/audioAnalyser';
  import { currentTrack, consumePendingSeek, next, player, requestSeek, setQueue, setVolume, toggle } from '../stores/player';
  import { settings } from '../stores/settings';
  import { subtitleProfiles } from '../stores/subtitleProfiles';
  import { isAudioFile, isVideoFile, isVisualStream, streamLocationOf } from '../lib/audio';
  import { hasTauri } from '../lib/tauriFs';
  import {
    playerBackend,
    nativeAudioTracks,
    nativeLoad,
    nativePause,
    nativePlay,
    nativePosition,
    nativeSeek,
    nativeSetEqualizer,
    nativeSetSubtitleProfile,
    nativeSetVolume,
    nativeSpuTracks,
    nativeStop,
    type NativePlayerEvent,
    type PlayerBackend,
  } from '../lib/playerBackend';
  import { clearNativeTracks, nativeAudioTrackState, nativeSpuTrackState } from '../stores/nativeTracks';
  import { addBookmark, formatTimestamp, mediaKeyFor } from '../stores/bookmarks';
  import { navigate } from '../stores/navigation';
  import { markWatched, removeWatch, watchEntries, upsertWatch, type WatchEntry } from '../stores/watch';
  import { musicTracks, recordMusicListen } from '../stores/musicLibrary';

  const dispatch = createEventDispatcher<{ settings: void; advancedSettings: string }>();

  // Optional external source kept for compatibility with the shell/library flow.
  export let src = '';

  /** How long fullscreen chrome stays visible after the last interaction. */
  const CHROME_HIDE_DELAY_MS = 2500;

  let videoEl: HTMLVideoElement | null = null;
  /** Fullscreen target: wraps the stage and the transport so both stay mounted. */
  let shellEl: HTMLDivElement | null = null;
  let topBarEl: HTMLDivElement | null = null;
  let transportEl: HTMLDivElement | null = null;
  let libraryTriggerEl: HTMLButtonElement | null = null;
  let continueRailEl: HTMLDivElement | null = null;
  let showLibrary = false;
  let buffered = 0;

  let isFullscreen = false;
  let chromeVisible = true;
  let chromeHideTimer: ReturnType<typeof setTimeout> | null = null;
  let pipVideoEl: HTMLVideoElement | null = null;
  let pipSupported = false;
  let pipActive = false;

  /** Pending single-click timer; cancelled by a double-click or on destroy. */
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  /** Pending volume-HUD hide timer. */
  let volumeHudTimer: ReturnType<typeof setTimeout> | null = null;
  /** Pending bookmark-HUD hide timer. */
  let bookmarkHudTimer: ReturnType<typeof setTimeout> | null = null;
  /** Fractional wheel notches carried across trackpad events. */
  let wheelRemainder = 0;
  let audioCtx: AudioContext | null = null;
  let gainNode: GainNode | null = null;
  let volumeHudVisible = false;
  let volumeHudVolume = 0;
  let bookmarkHudVisible = false;
  let bookmarkHudMessage = '';

  /** Key of the source currently applied to the element. */
  let syncedMediaKey = '';
  /** True while a source swap is in flight, so transient media events are ignored. */
  let pendingLoad = false;
  /** Previous store time, used to detect store-initiated rewinds. */
  let previousStoreTime = 0;

  // ── Native (libvlc) audio backend ──────────────────────────────────────
  /** Compiled backend, resolved once on mount; 'html5' until proven otherwise. */
  let backendKind: PlayerBackend = 'html5';
  /** Location currently loaded into libvlc (path or stream URL); '' = nothing. */
  let nativeLoadedId = '';
  /** Generation returned by the last successful native load. Stale events are ignored. */
  let nativeGeneration = 0;
  /** False while a load is in flight, so an end event from the previous media cannot advance twice. */
  let nativeAcceptingEvents = false;
  /** One-line notice when native playback gives up for the session. */
  let nativeNotice = '';
  /** Cancels the `player://event` listener. */
  let unlistenNativeEvents: (() => void) | null = null;
  /** Bumped to drop in-flight track-list retries after a new load. */
  let nativeTrackRefresh = 0;
  /** Bumped on every load so a slow load cannot finish over a newer one. */
  let nativeLoadEpoch = 0;
  /** Local mirror of the native play state, avoiding redundant commands. */
  let nativeIsPlaying = false;
  /** Store-clock sampler for the native player; null while inactive. */
  let nativePollTimer: ReturnType<typeof setInterval> | null = null;
  /** Last time value the poll wrote to / read from the store. */
  let nativeLastPolledTime = 0;
  /** Track the end-of-media advance already fired for (dedupe). */
  let nativeEndedFiredFor = '';
  /** Set once the backend probe resolves; gates the native reactive paths. */
  let nativeMounted = false;
  /** Last equalizer curve pushed to libvlc, so unrelated settings writes do not re-send it. */
  let nativeEqSignature = '';
  /** Last subtitle profile pushed to libvlc. */
  let nativeSubtitleSignature = '';

  $: videoSrc = $currentTrack?.src ?? src;
  $: hasMedia = Boolean(videoSrc);
  // The mode suffix makes flipping the backend change the key, which forces
  // syncSource to run again (it early-returns on unchanged keys) — that is
  // what reloads the element on every native↔HTML5 handoff.
  $: mediaKey = `${$currentTrack?.id ?? 'external'}:${videoSrc}:${nativeRoutingActive ? 'native' : 'html5'}`;
  $: mediaTitle = $currentTrack?.title?.trim() || 'Kanea';

  /**
   * What libvlc should open for the current track, when the toggle is on.
   * Local audio/video ids win; otherwise an allowlisted stream URL on `src`
   * or `id`. `visual` turns the frame pump on (local video, HLS/DASH
   * playlists, and RTSP-family URLs).
   */
  $: nativeTarget = resolveNativeTarget(
    nativeMounted && backendKind === 'native' && $settings.nativePlayback === true
      ? $currentTrack
      : null,
  );

  /** True when the current item is native and has no video surface. */
  $: nativeAudioActive = nativeTarget !== null && !nativeTarget.visual;
  /** True when libvlc should paint frames (local video or a visual stream). */
  $: nativeVideoActive = nativeTarget !== null && nativeTarget.visual;
  /** Either native route owns playback instead of the element. */
  $: nativeRoutingActive = nativeTarget !== null;
  // KNOWN GAP: TransportBar's hover preview sources its own off-screen
  // element from videoEl.src, which native mode empties.
  // KNOWN GAP: the dock visualizer falls back to synthetic bars — its
  // analyser has no element media to attach to in native mode.
  // Subtitles in native mode are libvlc's freetype SPU blended into the
  // frame. The active profile (font, colours, size, outline, background,
  // vertical margin, delay) is passed to that renderer.

  $: continueItems = $watchEntries
    .filter(e => !e.watched && e.position > 0 && e.duration > 0 && e.position / e.duration < 0.98 && e.position / e.duration > 0.02)
    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
    .slice(0, 5);

  // Rebind the Picture-in-Picture listeners whenever the media element changes.
  $: syncPipElement(videoEl);

  // Store -> element: load a new source and rewind when the current track changes.
  // In native mode the element is emptied instead — libvlc owns playback.
  $: syncSource(videoEl, mediaKey, videoSrc, $currentTrack?.duration ?? 0, nativeRoutingActive);
  // Store -> element: follow play/pause intent (including stop and context-menu actions).
  $: if (!nativeRoutingActive) syncPlayback(videoEl, $player.isPlaying, hasMedia);
  // Store -> element: honour store-initiated rewinds (stop, re-clicking the current queue row).
  $: if (!nativeRoutingActive) syncStoreSeek(videoEl, $player.currentTime, $player.isPlaying);
  // Store -> element: keep volume and mute in step with context-menu and transport actions.
  // (Idle for native routes: the element carries no media and the dock
  // visualizer stays HTML5-only.)
  $: if (!nativeRoutingActive) syncVolume(videoEl, $player.volume, $player.muted);

  // Store -> libvlc: load the native player for local audio/video tracks /
  // reconcile play state.
  $: if (nativeRoutingActive && nativeTarget) void syncNativeTrack(nativeTarget.location, $player.isPlaying);
  // Store -> libvlc: mirror volume and mute.
  $: if (nativeRoutingActive) void syncNativeVolume($player.volume, $player.muted);
  // Store -> libvlc: preamp + the ten ISO bands, or a bypass when the toggle is off.
  $: if (nativeRoutingActive) void syncNativeEqualizer($settings.equalizer, $settings.eqGains);
  // Store -> libvlc: freetype style and SPU delay. HTML5 does not consume this.
  $: if (nativeRoutingActive) {
    void syncNativeSubtitle($subtitleProfiles.formatting, $settings.subtitleDelay);
  }

  // Leaving native mode (toggle off, network track): release libvlc so
  // it never plays on top of the webview element, and stop the poll.
  $: if (!nativeRoutingActive && nativeLoadedId) void releaseNativePlayer();
  $: if (!nativeRoutingActive && nativePollTimer) {
    clearInterval(nativePollTimer);
    nativePollTimer = null;
  }

  // Store -> canvas pump: fetch-and-paint while a local video is native.
  $: if (nativeVideoActive) startNativeFramePump();
  $: if (!nativeVideoActive) stopNativeFramePump();
  // Store -> native PCM: the audio callback replaces libvlc's output, so the
  // webview plays `vlcaudio://` chunks. The emptied <video> stays silent.
  $: if (nativeRoutingActive) startNativePcmPlayback();
  $: if (!nativeRoutingActive) stopNativePcmPlayback();
  $: if (nativeRoutingActive) setNativePcmPlaying($player.isPlaying);

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function resolveNativeTarget(
    track: { id: string; src?: string } | null,
  ): { location: string; visual: boolean } | null {
    if (!track) return null;
    if (isVideoFile(track.id)) return { location: track.id, visual: true };
    if (isAudioFile(track.id)) return { location: track.id, visual: false };
    const stream = streamLocationOf(track.src) ?? streamLocationOf(track.id);
    if (!stream) return null;
    return { location: stream, visual: isVisualStream(stream) };
  }

  function syncSource(
    el: HTMLVideoElement | null,
    key: string,
    source: string,
    fallbackDuration: number,
    nativeMode: boolean,
  ): void {
    if (!el) {
      syncedMediaKey = '';
      return;
    }

    if (key === syncedMediaKey) return;

    syncedMediaKey = key;
    pendingLoad = true;

    el.pause();

    if (nativeMode) {
      // libvlc owns this track: leave the element silent and media-less so
      // it cannot play over native audio. There is no metadata event coming
      // to clear `pendingLoad`, so clear it right after the (event-swallowing)
      // pause.
      pendingLoad = false;
      el.removeAttribute('src');
      el.load();
      return;
    }

    if (source) {
      el.src = source;
      el.load();
    }

    try {
      el.currentTime = 0;
    } catch {
      // Seeking before metadata exists is harmless; loadedmetadata rewinds again.
    }

    player.update((state) => ({
      ...state,
      currentTime: 0,
      duration:
        Number.isFinite(fallbackDuration) && fallbackDuration > 0
          ? fallbackDuration
          : state.duration,
    }));
  }

  function syncPlayback(el: HTMLVideoElement | null, shouldPlay: boolean, available: boolean): void {
    if (!el || !available) return;

    if (shouldPlay) {
      if (el.paused) {
        void el.play().catch((error) => {
          console.warn('Playback could not start.', error);
          pendingLoad = false;
          player.update((state) => ({ ...state, isPlaying: false }));
        });
      }
      return;
    }

    if (!el.paused) el.pause();
  }

  function syncStoreSeek(el: HTMLVideoElement | null, time: number, playing: boolean): void {
    if (!Number.isFinite(time)) return;

    const jumpedBackwards = time + 0.5 < previousStoreTime;
    previousStoreTime = time;

    if (!el || pendingLoad) return;

    // While playing, timeupdate keeps the element and store close; a large drift
    // while paused means the store was reset (for example by stop()).
    const drift = !playing && Math.abs(el.currentTime - time) > 0.75;

    if (jumpedBackwards || drift) {
      try {
        el.currentTime = time;
      } catch {
        // The element may not have metadata yet; loadedmetadata handles the reset.
      }
    }
  }

  function syncVolume(el: HTMLVideoElement | null, volume: number, muted: boolean): void {
    if (!el) return;

    // Initialize AudioContext + GainNode on first interaction
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(el);
      gainNode = audioCtx.createGain();
      source.connect(gainNode).connect(audioCtx.destination);
    }

    if (gainNode) {
      gainNode.gain.value = muted ? 0 : clamp(volume / 100, 0, 2);
    }
    el.muted = muted;
  }

  // ── Native (libvlc) backend sync ───────────────────────────────────────

  /**
   * Keep libvlc in step with the player store while a local audio track is
   * routed natively. `player_load` starts playing immediately, so a paused
   * intent pauses right after the load resolves.
   */
  async function syncNativeTrack(trackId: string, shouldPlay: boolean): Promise<void> {
    if (trackId === nativeLoadedId) {
      // Same track: only reconcile play state (nativeToggle users aside).
      const state = get(player);
      if (state.isPlaying && !nativeIsPlaying) {
        await nativePlay();
        nativeIsPlaying = true;
      } else if (!state.isPlaying && nativeIsPlaying) {
        await nativePause();
        nativeIsPlaying = false;
      }
      return;
    }

    const epoch = ++nativeLoadEpoch;
    resetNativePcmSchedule();
    if (nativeLoadedId) {
      await nativeStop();
    }
    if (epoch !== nativeLoadEpoch) return;
    nativeLoadedId = '';
    nativeIsPlaying = false;
    nativeLastPolledTime = 0;
    nativeEndedFiredFor = '';
    nativeGeneration = 0;
    nativeAcceptingEvents = false;
    clearNativeTracks();

    // Style is read when the libvlc instance is created, so publish it first.
    const before = get(settings);
    await syncNativeSubtitle(get(subtitleProfiles).formatting, before.subtitleDelay, true);

    // Local ids are absolute file paths. Streams are allowlisted URLs.
    const generation = await nativeLoad(trackId);
    if (epoch !== nativeLoadEpoch) return;
    if (generation === null) {
      // The shell is native-capable but refused this item (or the command
      // failed): flip the toggle off so HTML5 resumes via the mediaKey flip.
      nativeNotice = 'Native playback could not open this item. Switched back to the webview player.';
      console.warn('Native backend refused the item; staying on HTML5.', trackId);
      settings.update((s) => ({ ...s, nativePlayback: false }));
      return;
    }

    nativeNotice = '';
    nativeGeneration = generation;
    nativeAcceptingEvents = true;
    nativeLoadedId = trackId;
    void refreshNativeTracks(generation);
    if (!shouldPlay) {
      await nativePause();
    } else {
      nativeIsPlaying = true;
    }

    // Listen-history parity with the HTML5 path (a fresh load counts once;
    // recordMusicListen upserts by mediaKey so repeats never duplicate).
    // Video tracks must NOT fire it: music listens stay audio-only.
    if (isAudioFile(trackId) && get(currentTrack)?.id === trackId) {
      recordMusicListenForCurrentTrack();
    }

    // Resume positions queued by Continue cards: loadedmetadata never fires
    // in native mode, so consume the one-shot seek here instead.
    const resumeAt = consumePendingSeek();
    if (resumeAt !== null && Number.isFinite(resumeAt) && resumeAt > 0) {
      await nativeSeek(resumeAt);
      nativeLastPolledTime = resumeAt;
      player.update((state) => ({ ...state, currentTime: resumeAt }));
    }

    // libvlc starts at its own default volume; push the store's value once
    // per load (the volume watcher only fires on volume/mute changes).
    const state = get(player);
    await syncNativeVolume(state.volume, state.muted);
    const audio = get(settings);
    await syncNativeEqualizer(audio.equalizer, audio.eqGains, true);
    // Delay is cleared on each media change, so push the profile again now.
    await syncNativeSubtitle(get(subtitleProfiles).formatting, audio.subtitleDelay, true);

    startNativePoll();
  }

  /**
   * Mirror the store volume into libvlc. The command keeps 0–125 on libvlc
   * (the callback PCM is already post-volume) and the tap adds a soft-clipped
   * gain above 125. Mute and 0% also zero the Web Audio gain so queued
   * chunks go silent immediately.
   */
  async function syncNativeVolume(volume: number, muted: boolean): Promise<void> {
    const audible = !muted && volume > 0;
    setNativePcmAudible(audible);
    if (!nativeLoadedId) return;

    await nativeSetVolume(muted ? 0 : Math.round(clamp(volume, 0, 200)));
  }

  function equalizerSignature(enabled: boolean, gains: number[]): string {
    const preamp = gains[0] ?? 0;
    const bands = [];
    for (let index = 1; index <= 10; index += 1) bands.push(gains[index] ?? 0);
    return `${enabled ? 1 : 0}|${preamp}|${bands.join(',')}`;
  }

  /**
   * Mirror the equalizer toggle and faders into libvlc. Off is a bypass.
   * HTML5 ignores this; the sliders still persist either way.
   */
  async function syncNativeEqualizer(enabled: boolean, gains: number[], force = false): Promise<void> {
    const signature = equalizerSignature(enabled, gains);
    if (!force && signature === nativeEqSignature) return;
    nativeEqSignature = signature;
    const preamp = gains[0] ?? 0;
    const bands = [];
    for (let index = 1; index <= 10; index += 1) bands.push(gains[index] ?? 0);
    await nativeSetEqualizer(enabled, preamp, bands);
  }

  function subtitleSignature(
    formatting: {
      font: string;
      textColor: string;
      outlineColor: string;
      sizeMode: string;
      size: number;
      outlineWidth: number;
      backgroundOpacity: number;
      verticalPosition: string;
    },
    delay: string,
  ): string {
    return [
      formatting.font,
      formatting.textColor,
      formatting.outlineColor,
      formatting.sizeMode,
      formatting.size,
      formatting.outlineWidth,
      formatting.backgroundOpacity,
      formatting.verticalPosition,
      delay,
    ].join('|');
  }

  function parseSubtitleDelay(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Mirror the active subtitle profile into libvlc's freetype renderer. */
  async function syncNativeSubtitle(
    formatting: {
      font: string;
      textColor: string;
      outlineColor: string;
      sizeMode: 'relative' | 'exact';
      size: number;
      outlineWidth: number;
      backgroundOpacity: number;
      verticalPosition: string;
    },
    delay: string,
    force = false,
  ): Promise<void> {
    const signature = subtitleSignature(formatting, delay);
    if (!force && signature === nativeSubtitleSignature) return;
    nativeSubtitleSignature = signature;
    await nativeSetSubtitleProfile({
      font: formatting.font,
      textColor: formatting.textColor,
      outlineColor: formatting.outlineColor,
      sizeMode: formatting.sizeMode,
      size: formatting.size,
      outlineWidth: formatting.outlineWidth,
      backgroundOpacity: formatting.backgroundOpacity,
      verticalPosition: formatting.verticalPosition,
      delay: parseSubtitleDelay(delay),
    });
  }

  /**
   * Stop and unload whatever libvlc still holds: a flip back to HTML5, a
   * switch to a video/network track, or component teardown. The mirrors are
   * cleared synchronously so the reactive guards settle without a re-stop.
   */
  async function releaseNativePlayer(): Promise<void> {
    if (!nativeLoadedId) return;

    nativeLoadedId = '';
    nativeIsPlaying = false;
    nativeLastPolledTime = 0;
    nativeEndedFiredFor = '';
    nativeGeneration = 0;
    nativeAcceptingEvents = false;
    nativeTrackRefresh += 1;
    clearNativeTracks();

    await nativeStop();
  }

  /**
   * Ask libvlc for audio and subtitle tracks a few times. They are often
   * empty until the input has opened, especially on network media.
   */
  async function refreshNativeTracks(generation: number): Promise<void> {
    const token = ++nativeTrackRefresh;
    const delays = [0, 400, 1200];
    for (const delay of delays) {
      if (delay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
      if (token !== nativeTrackRefresh || nativeGeneration !== generation) return;
      const audio = await nativeAudioTracks();
      const spu = await nativeSpuTracks();
      if (token !== nativeTrackRefresh || nativeGeneration !== generation) return;
      nativeAudioTrackState.set(audio);
      nativeSpuTrackState.set(spu);
    }
  }

  function handleNativePlayerEvent(payload: NativePlayerEvent): void {
    if (!nativeAcceptingEvents || !nativeRoutingActive || payload.generation !== nativeGeneration) return;
    if (payload.kind === 'error') {
      nativeNotice = 'Native playback failed. Switched back to the webview player.';
      console.warn('Native backend reported an error; staying on HTML5.');
      settings.update((s) => ({ ...s, nativePlayback: false }));
      return;
    }
    if (payload.kind === 'ended') {
      void advanceNativeEnded();
    }
  }

  /**
   * End-of-media for the native player: repeat-one reloads in place, anything
   * else advances the queue. Shared by the `player://event` listener and the
   * position-poll fallback (files whose length is known).
   */
  async function advanceNativeEnded(): Promise<void> {
    if (!nativeLoadedId || nativeEndedFiredFor === nativeLoadedId) return;
    nativeEndedFiredFor = nativeLoadedId;

    const state = get(player);
    if (nativeVideoActive) markWatched(mediaKey, 'video');

    if (state.repeat === 'one') {
      resetNativePcmSchedule();
      const path = nativeLoadedId;
      nativeAcceptingEvents = false;
      const generation = await nativeLoad(path);
      if (generation === null) {
        nativeNotice = 'Native playback could not restart this item. Switched back to the webview player.';
        settings.update((s) => ({ ...s, nativePlayback: false }));
        return;
      }
      nativeGeneration = generation;
      nativeAcceptingEvents = true;
      nativeEndedFiredFor = '';
      nativeLastPolledTime = 0;
      nativeIsPlaying = true;
      void refreshNativeTracks(generation);
      return;
    }

    next();
  }

  /**
   * Drive the player store from libvlc's clock: 250 ms sampling keeps the
   * seek bar and timestamps moving, pushes user seeks (made while we were
   * not looking) back into libvlc, and fires the end-of-track advance once.
   */
  function startNativePoll(): void {
    if (nativePollTimer) return;
    nativePollTimer = setInterval(() => {
      void nativePollTick();
    }, 250);
  }

  async function nativePollTick(): Promise<void> {
    if (!nativeRoutingActive || !nativeLoadedId) return;

    const state = get(player);

    // User seeked while we weren't looking: the store time moved away from
    // the last value we polled.
    if (Math.abs(state.currentTime - nativeLastPolledTime) > 0.6) {
      nativeLastPolledTime = state.currentTime;
      resetNativePcmSchedule();
      await nativeSeek(state.currentTime);
      return;
    }

    const position = await nativePosition();
    if (!position) return;

    const [time, length] = position;
    nativeLastPolledTime = time;
    player.update((s) => ({
      ...s,
      currentTime: time,
      duration: length > 0 ? length : s.duration,
    }));

    // Watch-history parity with the HTML5 video path: handleTimeUpdate
    // upserts progress on every `timeupdate` (≈250 ms cadence), which the
    // 250 ms poll matches. Fires for native video only — native audio keeps
    // music-listen history instead of watch entries.
    const track = get(currentTrack);
    if (nativeVideoActive && track && videoSrc) {
      upsertWatch({
        mediaKey: mediaKey,
        type: 'video',
        title: mediaTitle,
        duration: get(player).duration || track.duration || 0,
        position: time,
        src: videoSrc,
      });
    }

    // Fallback for local files when the end event is missed. Live streams
    // report length 0, so this never fires for them — the end event does.
    if (length > 0 && time >= length - 0.15) {
      void advanceNativeEnded();
    }
  }

  /**
   * Record a listen in the shared history when the media that just loaded is a
   * music-library track (track id === file path === history mediaKey). This
   * fires once per track start — a new `src` load — never on seek or resume,
   * and `recordMusicListen` upserts by mediaKey so double calls never create
   * duplicate history entries.
   */
  function recordMusicListenForCurrentTrack(): void {
    const track = get(currentTrack);
    if (!track) return;
    const musicTrack = get(musicTracks).find((candidate) => candidate.id === track.id);
    if (musicTrack) recordMusicListen(musicTrack);
  }

  // ── Native video canvas pump (Phase 2 prototype) ───────────────────────
  // libvlc decodes into a shared buffer (src-tauri player.rs); the custom
  // `vlcframe://` protocol serves the latest frame; this loop fetches it on
  // requestAnimationFrame and paints it onto the canvas. Always-on
  // instrumentation exists because this build is meant to be measured.

  /**
   * Custom-protocol frame URL registered in `src-tauri/src/main.rs`. Windows
   * webviews expose custom schemes as `http://vlcframe.localhost/frame`
   * instead — this prototype targets the Linux WebKit build.
   */
  const FRAME_URL = 'vlcframe://localhost/frame';
  /** Self-describing body header: [seq u64 LE][width u32 LE][height u32 LE]. */
  const FRAME_HEADER_BYTES = 16;

  /** Paint target, rendered exactly where the (src-less) video element sits. */
  let nativeCanvasEl: HTMLCanvasElement | null = null;
  /** Pending rAF handle; null while the pump is stopped. */
  let nativeFrameRafId: number | null = null;
  /** True while one frame fetch is in flight; rAF ticks skip until it lands. */
  let nativeFrameFetchInFlight = false;
  /** Sequence of the last painted frame; repeated seqs are skipped. */
  let nativeLastPaintedSeq = -1;

  // Rolling ~1 s instrumentation window (the deliverable of this prototype).
  let frameStatsWindowStart = 0;
  let frameStatsPainted = 0;
  let frameStatsEmpty = 0;
  let frameStatsFetchMs = 0;
  let frameStatsFetchCount = 0;
  let frameStatsPaintMs = 0;
  let frameStatsPaintCount = 0;
  let frameStatsBytes = 0;

  function startNativeFramePump(): void {
    if (nativeFrameRafId !== null) return;
    frameStatsWindowStart = performance.now();
    nativeFrameRafId = requestAnimationFrame(nativeFramePumpTick);
  }

  function stopNativeFramePump(): void {
    if (nativeFrameRafId !== null) {
      cancelAnimationFrame(nativeFrameRafId);
      nativeFrameRafId = null;
    }
    nativeFrameFetchInFlight = false;
  }

  /**
   * One rAF step: never queue or overlap fetches — if the previous one is
   * still in flight, this tick only schedules the next one.
   */
  function nativeFramePumpTick(): void {
    if (!nativeVideoActive) {
      nativeFrameRafId = null;
      return;
    }
    if (!nativeFrameFetchInFlight) {
      nativeFrameFetchInFlight = true;
      void fetchAndPaintNativeFrame();
    }
    nativeFrameRafId = requestAnimationFrame(nativeFramePumpTick);
  }

  function countFrameStatsFetch(startedAt: number): void {
    frameStatsFetchMs += performance.now() - startedAt;
    frameStatsFetchCount += 1;
  }

  async function fetchAndPaintNativeFrame(): Promise<void> {
    const fetchStarted = performance.now();
    try {
      const response = await fetch(FRAME_URL);

      // The handler answers 204 while no frame is live (audio-only media,
      // before the first format callback, after a stop). Any other non-200
      // is treated the same way: a poll without a paintable frame.
      if (response.status !== 200) {
        countFrameStatsFetch(fetchStarted);
        frameStatsEmpty += 1;
        return;
      }

      const buffer = await response.arrayBuffer();
      countFrameStatsFetch(fetchStarted);

      if (buffer.byteLength < FRAME_HEADER_BYTES) {
        frameStatsEmpty += 1;
        return;
      }
      const header = new DataView(buffer);
      const seq = Number(header.getBigUint64(0, true));
      const width = header.getUint32(8, true);
      const height = header.getUint32(12, true);
      const pixelBytes = width * height * 4;
      if (width === 0 || height === 0 || buffer.byteLength < FRAME_HEADER_BYTES + pixelBytes) {
        frameStatsEmpty += 1;
        return;
      }

      const canvas = nativeCanvasEl;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) {
        frameStatsEmpty += 1;
        return;
      }

      if (seq === nativeLastPaintedSeq) {
        // Already on the canvas (e.g. 60 Hz rAF against ~30 fps frames).
        frameStatsEmpty += 1;
      } else {
        const paintStarted = performance.now();
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        context.putImageData(
          new ImageData(new Uint8ClampedArray(buffer, FRAME_HEADER_BYTES, pixelBytes), width, height),
          0,
          0,
        );
        nativeLastPaintedSeq = seq;
        frameStatsPainted += 1;
        frameStatsPaintMs += performance.now() - paintStarted;
        frameStatsPaintCount += 1;
        frameStatsBytes = pixelBytes;
      }

      // ~1 s heartbeat — the prototype's measurement output.
      const elapsed = performance.now() - frameStatsWindowStart;
      if (elapsed >= 1000) {
        console.log(
          `[vlcframe] fps=${Math.round((frameStatsPainted / elapsed) * 1000)} painted=${frameStatsPainted} empty=${frameStatsEmpty} fetchAvg=${(frameStatsFetchCount > 0 ? frameStatsFetchMs / frameStatsFetchCount : 0).toFixed(2)}ms paintAvg=${(frameStatsPaintCount > 0 ? frameStatsPaintMs / frameStatsPaintCount : 0).toFixed(2)}ms bytes=${frameStatsBytes}`,
        );
        frameStatsWindowStart = performance.now();
        frameStatsPainted = 0;
        frameStatsEmpty = 0;
        frameStatsFetchMs = 0;
        frameStatsFetchCount = 0;
        frameStatsPaintMs = 0;
        frameStatsPaintCount = 0;
      }
    } catch {
      // Fetch failed (browser preview without Tauri, teardown race): a
      // cheap no-op counted as an empty poll.
      frameStatsEmpty += 1;
    } finally {
      nativeFrameFetchInFlight = false;
    }
  }

  /**
   * Attach the dock visualizer's analysis graph to the media element (the
   * AudioContext + element source are created once, on the first play
   * gesture) and resume the autoplay-suspended context. No-op without an
   * element; failures are swallowed by the module so playback is unaffected.
   */
  function hookAudioAnalyser(): void {
    if (!videoEl || nativeRoutingActive) return;
    ensureAudioAnalyser(videoEl);
    void resumeAudioAnalyser();
  }

  function handleLoadedMetadata(): void {
    const el = videoEl;
    if (!el) return;

    hookAudioAnalyser();
    recordMusicListenForCurrentTrack();

    const mediaDuration =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;

    const resumeAt = consumePendingSeek();
    const targetTime =
      resumeAt !== null && mediaDuration > 0
        ? Math.min(Math.max(0, resumeAt), Math.max(0, mediaDuration - 1))
        : 0;

    player.update((state) => ({
      ...state,
      duration: mediaDuration || state.duration,
      currentTime: targetTime,
    }));

    try {
      el.currentTime = targetTime;
    } catch {
      // Ignore: some platforms reject a seek until the first frame is decoded.
    }

    if ($player.isPlaying) {
      void el.play().catch((error) => {
        console.warn('Autoplay was blocked.', error);
        pendingLoad = false;
        player.update((state) => ({ ...state, isPlaying: false }));
      });
    } else {
      pendingLoad = false;
    }
  }

  function handleDurationChange(): void {
    const el = videoEl;
    if (!el) return;

    if (Number.isFinite(el.duration) && el.duration > 0) {
      player.update((state) => ({ ...state, duration: el.duration }));
    }
  }

  function handleTimeUpdate(): void {
    const el = videoEl;
    if (!el || pendingLoad) return;

    player.update((state) => ({
      ...state,
      currentTime: Number.isFinite(el.currentTime) ? el.currentTime : state.currentTime,
    }));

    const track = $currentTrack;
    if (track && videoSrc) {
      upsertWatch({
        mediaKey: mediaKey,
        type: 'video',
        title: mediaTitle,
        duration: $player.duration || track.duration || 0,
        position: el.currentTime,
        src: videoSrc,
      });
    }
  }

  function handlePlay(): void {
    if (pendingLoad) return;
    hookAudioAnalyser();
    player.update((state) => (state.isPlaying ? state : { ...state, isPlaying: true }));
  }

  function handlePlaying(): void {
    pendingLoad = false;
    hookAudioAnalyser();

    if (!$player.isPlaying) {
      videoEl?.pause();
      return;
    }

    player.update((state) => (state.isPlaying ? state : { ...state, isPlaying: true }));
  }

  function handlePause(): void {
    // A pause fired by a source swap must not cancel the queued autoplay intent.
    if (pendingLoad) return;
    player.update((state) => (state.isPlaying ? { ...state, isPlaying: false } : state));
  }

  function handleEnded(): void {
    // A source swap triggered by the up-next prompt can leave a stale `ended`
    // event queued for the previous element. Ignore it so a track is never
    // skipped twice.
    if (pendingLoad) return;

    const track = $currentTrack;
    if (track && videoSrc) {
      upsertWatch({
        mediaKey: mediaKey,
        type: 'video',
        title: mediaTitle,
        duration: $player.duration || track.duration || 0,
        position: $player.duration || track.duration || 0,
        src: videoSrc,
      });
    }
    if ($player.repeat === 'one' && videoEl) {
      videoEl.currentTime = 0;
      void videoEl.play().catch((error) => {
        console.warn('Repeat playback could not start.', error);
      });
      return;
    }

    next();
  }

  function updateBuffered(): void {
    const el = videoEl;

    if (!el) {
      buffered = 0;
      return;
    }

    try {
      const mediaDuration = el.duration;
      const ranges = el.buffered;

      if (Number.isFinite(mediaDuration) && mediaDuration > 0 && ranges.length > 0) {
        buffered = Math.min(1, Math.max(0, ranges.end(ranges.length - 1) / mediaDuration));
      } else {
        buffered = 0;
      }
    } catch {
      buffered = 0;
    }
  }

  function handleError(): void {
    console.warn('The media source could not be loaded.');
    pendingLoad = false;
    player.update((state) => ({ ...state, isPlaying: false }));
  }

  function handleBack(): void {
    navigate('videos');
  }

  function clearClickTimer(): void {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
  }

  function handleStageClick(event: MouseEvent): void {
    // Gestures are media-only: without a loaded source there is nothing to toggle.
    if (!hasMedia || event.defaultPrevented) return;

    // The second click of a double-click must not schedule playback.
    if (event.detail > 1) {
      clearClickTimer();
      return;
    }

    clearClickTimer();
    clickTimer = setTimeout(() => {
      clickTimer = null;
      if (hasMedia) toggle();
    }, DOUBLE_CLICK_DELAY_MS);
  }

  function handleStageDoubleClick(event: MouseEvent): void {
    if (!hasMedia) return;

    event.preventDefault();
    clearClickTimer();
    toggleFullscreen(shellEl);
  }

  function syncFullscreen(): void {
    const active = Boolean(shellEl) && document.fullscreenElement === shellEl;
    isFullscreen = active;

    if (active) {
      showChrome();
    } else {
      clearChromeTimer();
      chromeVisible = true;
    }
  }

  function handleExitFullscreen(): void {
    if (!document.fullscreenElement) return;

    void document.exitFullscreen().catch((error) => {
      console.warn('Fullscreen could not be exited.', error);
    });
  }

  function clearChromeTimer(): void {
    if (chromeHideTimer !== null) {
      clearTimeout(chromeHideTimer);
      chromeHideTimer = null;
    }
  }

  /**
   * Only keep the chrome up for keyboard-driven focus. A button focused by a
   * mouse click reports `:focus-visible === false`, so it still auto-hides.
   */
  function chromeHasKeyboardFocus(): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (!topBarEl?.contains(active) && !transportEl?.contains(active)) return false;

    try {
      return active.matches(':focus-visible');
    } catch {
      // Older engines without :focus-visible get the accessible fallback.
      return true;
    }
  }

  function scheduleChromeHide(): void {
    clearChromeTimer();
    if (!isFullscreen) return;

    chromeHideTimer = setTimeout(() => {
      chromeHideTimer = null;
      hideChrome();
    }, CHROME_HIDE_DELAY_MS);
  }

  function showChrome(): void {
    chromeVisible = true;
    scheduleChromeHide();
  }

  function hideChrome(): void {
    clearChromeTimer();

    if (!isFullscreen) {
      chromeVisible = true;
      return;
    }

    // Never make the control that currently owns keyboard focus inert.
    if (chromeHasKeyboardFocus()) return;

    chromeVisible = false;
  }

  function handleChromePointerActivity(): void {
    if (!isFullscreen) return;
    showChrome();
  }

  function handleChromePointerLeave(): void {
    if (!isFullscreen) return;
    hideChrome();
  }

  function handleChromeFocusIn(): void {
    if (!isFullscreen) return;
    showChrome();
  }

  function handleChromeFocusOut(): void {
    if (!isFullscreen) return;
    scheduleChromeHide();
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    // Ctrl+B: add bookmark at current position (works in any mode)
    if (event.ctrlKey && (event.key === 'b' || event.key === 'B')) {
      event.preventDefault();
      handleAddBookmark();
      return;
    }

    // Fullscreen chrome handling (only when in fullscreen)
    if (!isFullscreen) return;
    showChrome();
  }

  /**
   * The transport installs a window-level Space shortcut. Keep it from
   * swallowing native button activation while fullscreen chrome has focus.
   */
  function handleChromeButtonKeydown(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
      event.stopPropagation();
    }
  }

  function isPipSupported(el: HTMLVideoElement | null): boolean {
    return Boolean(
      el &&
        document.pictureInPictureEnabled &&
        typeof el.requestPictureInPicture === 'function',
    );
  }

  function detachPipListeners(): void {
    if (pipVideoEl) {
      pipVideoEl.removeEventListener('enterpictureinpicture', handleEnterPip);
      pipVideoEl.removeEventListener('leavepictureinpicture', handleLeavePip);
    }

    pipVideoEl = null;
    pipActive = false;
  }

  function syncPipElement(el: HTMLVideoElement | null): void {
    if (el === pipVideoEl) {
      pipSupported = isPipSupported(el);
      return;
    }

    detachPipListeners();
    pipVideoEl = el;
    pipSupported = isPipSupported(el);
    pipActive = Boolean(el && document.pictureInPictureElement === el);

    if (!el) return;

    el.addEventListener('enterpictureinpicture', handleEnterPip);
    el.addEventListener('leavepictureinpicture', handleLeavePip);
  }

  function handleEnterPip(): void {
    pipActive = true;
  }

  function handleLeavePip(): void {
    pipActive = false;
  }

  async function togglePip(): Promise<void> {
    const el = videoEl;
    if (!el || !pipSupported) return;

    try {
      if (document.pictureInPictureElement === el) {
        await document.exitPictureInPicture();
      } else {
        await el.requestPictureInPicture();
      }
    } catch (error) {
      console.warn('Picture-in-Picture could not be toggled.', error);
    }
  }

  function toggleLibrary(): void {
    showLibrary = !showLibrary;

    if (showLibrary && isFullscreen) showChrome();
  }

  function closeLibrary(): void {
    showLibrary = false;
  }

  function showVolumeHud(): void {
    volumeHudVolume = get(player).volume;
    volumeHudVisible = true;

    if (volumeHudTimer) clearTimeout(volumeHudTimer);
    volumeHudTimer = setTimeout(() => {
      volumeHudTimer = null;
      volumeHudVisible = false;
    }, VOLUME_HUD_DURATION_MS);
  }

  function showBookmarkHud(message: string): void {
    bookmarkHudMessage = message;
    bookmarkHudVisible = true;

    if (bookmarkHudTimer) clearTimeout(bookmarkHudTimer);
    bookmarkHudTimer = setTimeout(() => {
      bookmarkHudTimer = null;
      bookmarkHudVisible = false;
    }, VOLUME_HUD_DURATION_MS);
  }

  function handleAddBookmark(): void {
    const track = get(currentTrack);
    const key = mediaKeyFor(track);
    const time = get(player).currentTime;
    const duration = get(player).duration;

    if (!key || !Number.isFinite(time) || time < 0 || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const bookmark = addBookmark(key, time, '');
    if (bookmark) {
      showBookmarkHud(`Bookmark added at ${formatTimestamp(time)}`);
    }
  }

  function handleContinueAction(
    event: MouseEvent,
    action: 'watched' | 'remove',
    item: WatchEntry,
  ): void {
    // The action buttons sit inside the play card; never let the card start
    // playback when one of them is used.
    event.stopPropagation();
    event.preventDefault();

    if (action === 'watched') {
      markWatched(item.mediaKey, item.type);
    } else {
      removeWatch(item.mediaKey, item.type);
    }
  }

  function handleStageWheel(event: WheelEvent): void {
    // Let the right dock, the compact library and horizontal rails scroll
    // normally instead of hijacking their wheel events for volume.
    if (
      event.target instanceof Element &&
      event.target.closest('[data-right-dock], [data-compact-library], [data-hscroll]')
    ) {
      return;
    }

    // Keep the page from scrolling while the pointer is over the stage.
    event.preventDefault();

    wheelRemainder += wheelNotches(event);

    const steps = Math.trunc(wheelRemainder);
    if (steps === 0) return;

    wheelRemainder -= steps;

    const stepSize = event.shiftKey ? WHEEL_VOLUME_FINE_STEP : WHEEL_VOLUME_STEP;
    const nextVolume = clamp(get(player).volume - steps * stepSize, 0, 200);

    // The store stays the source of truth; the reactive sync updates the element.
    setVolume(nextVolume);
    showVolumeHud();
  }

  onMount(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', handleGlobalKeydown);
    syncFullscreen();

    // Resolve the compiled backend once. The callback stays synchronous so
    // Svelte still honours the returned cleanup (async onMount callbacks
    // lose it); the probe runs inline and only flips the reactive guards
    // once it settles.
    void (async () => {
      backendKind = await playerBackend();
      nativeMounted = true;
      if (backendKind !== 'native' || !hasTauri()) return;
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<NativePlayerEvent>('player://event', (event) => {
        handleNativePlayerEvent(event.payload);
      });
      unlistenNativeEvents = unlisten;
    })();

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('keydown', handleGlobalKeydown);
      unlistenNativeEvents?.();
      unlistenNativeEvents = null;
    };
  });

  onDestroy(() => {
    clearClickTimer();
    clearChromeTimer();
    detachPipListeners();

    if (volumeHudTimer) {
      clearTimeout(volumeHudTimer);
      volumeHudTimer = null;
    }

    if (bookmarkHudTimer) {
      clearTimeout(bookmarkHudTimer);
      bookmarkHudTimer = null;
    }

    if (nativePollTimer) {
      clearInterval(nativePollTimer);
      nativePollTimer = null;
    }

    // Stop the frame and PCM loops before libvlc goes away.
    stopNativeFramePump();
    stopNativePcmPlayback();

    // Release libvlc so playback never outlives the view.
    void releaseNativePlayer();
  });
</script>

<div class="relative flex h-full min-h-0 overflow-hidden bg-vlc-app">

  <div
    bind:this={shellEl}
    class="player-shell relative flex min-w-0 flex-1 flex-col"
    class:chrome-hidden={!chromeVisible}
    on:pointermove={handleChromePointerActivity}
    on:pointerdown={handleChromePointerActivity}
    on:pointerleave={handleChromePointerLeave}
    on:focusin={handleChromeFocusIn}
    on:focusout={handleChromeFocusOut}
  >
    {#if isFullscreen}
      <div
        bind:this={topBarEl}
        class="player-topbar absolute inset-x-0 top-0 z-40 flex items-center gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pb-8 pt-3 text-white"
        role="group"
        aria-label="Fullscreen player header"
        aria-hidden={!chromeVisible}
        inert={!chromeVisible}
      >
        <p class="min-w-0 flex-1 truncate text-sm font-medium" title={mediaTitle}>
          {mediaTitle}
        </p>

        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-control text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            title="Browse library"
            aria-label="Browse library"
            aria-expanded={showLibrary}
            aria-controls="compact-library-overlay"
            on:click={toggleLibrary}
            on:keydown={handleChromeButtonKeydown}
          >
            <Library size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>

          {#if hasMedia && pipSupported}
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-control text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              title={pipActive ? 'Exit picture-in-picture' : 'Picture-in-picture'}
              aria-label={pipActive ? 'Exit picture-in-picture' : 'Picture-in-picture'}
              aria-pressed={pipActive}
              on:click={() => void togglePip()}
              on:keydown={handleChromeButtonKeydown}
            >
              <PictureInPicture size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          {/if}

          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-control text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            title="Exit fullscreen"
            aria-label="Exit fullscreen"
            on:click={handleExitFullscreen}
            on:keydown={handleChromeButtonKeydown}
          >
            <Minimize size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    {/if}

    <div
      class="player-stage group/stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-vlc-app lg:pl-0"
      on:wheel|nonpassive={handleStageWheel}
    >
      {#if !isFullscreen}
        <button
          bind:this={libraryTriggerEl}
          type="button"
          class="absolute right-3 top-3 z-20 flex h-8 items-center gap-1.5 rounded-control border border-vlc-border bg-vlc-panel/90 px-2.5 text-[11px] text-vlc-secondary opacity-0 shadow-sm backdrop-blur-sm transition-[opacity,background-color,color] hover:bg-vlc-raised hover:text-vlc-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 group-hover/stage:opacity-100"
          class:opacity-100={showLibrary}
          title="Browse library"
          aria-label="Browse library"
          aria-expanded={showLibrary}
          aria-controls="compact-library-overlay"
          on:click={toggleLibrary}
        >
          <Library size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>Library</span>
        </button>
      {/if}

      {#if hasMedia}
        <!-- svelte-ignore a11y-media-has-caption a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
        <video
          bind:this={videoEl}
          class="h-full w-full cursor-pointer bg-black object-contain"
          preload="metadata"
          playsinline
          on:click={handleStageClick}
          on:dblclick={handleStageDoubleClick}
          on:loadedmetadata={handleLoadedMetadata}
          on:durationchange={handleDurationChange}
          on:timeupdate={handleTimeUpdate}
          on:play={handlePlay}
          on:playing={handlePlaying}
          on:pause={handlePause}
          on:ended={handleEnded}
          on:progress={updateBuffered}
          on:error={handleError}
        ></video>
        {#if nativeNotice}
          <p
            class="pointer-events-none absolute inset-x-0 bottom-4 z-30 mx-auto w-fit max-w-[min(36rem,calc(100%-2rem))] rounded-control bg-black/75 px-3 py-1.5 text-center text-[12px] text-white"
            role="status"
          >
            {nativeNotice}
          </p>
        {/if}
        {#if nativeVideoActive}
          <!-- libvlc paints here: same stage slot as the (src-less) video
               element underneath. `inset-0 m-auto` + max constraints center
               the frame-sized canvas and letterbox it like object-contain;
               the video's own click handlers cannot fire because the canvas
               is a sibling painted above it, so gestures never double-fire. -->
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <canvas
            bind:this={nativeCanvasEl}
            class="absolute inset-0 m-auto max-h-full max-w-full cursor-pointer bg-black"
            on:click={handleStageClick}
            on:dblclick={handleStageDoubleClick}
          ></canvas>
        {/if}
      {:else}
        <div class="flex h-full w-full flex-col items-center justify-start gap-6 overflow-y-auto px-6 py-10">
          <div class="flex flex-col items-center gap-4">
            <svg class="h-24 w-24 drop-shadow-[0_0_40px_rgb(var(--accent-rgb)_/_0.18)]" viewBox="0 0 96 96" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="vlc-empty-cone-gradient" x1="48" y1="8" x2="48" y2="85" gradientUnits="userSpaceOnUse">
                  <stop stop-color="var(--accent)" />
                  <stop offset="1" stop-color="var(--accent-pressed)" />
                </linearGradient>
              </defs>
              <path d="M48 8 68 72H28L48 8Z" fill="url(#vlc-empty-cone-gradient)" />
              <path d="M38.9 34h18.2l2.6 10H36.3l2.6-10Z" fill="var(--selection-ink)" fill-opacity=".18" />
              <path d="M35.2 50h25.6l2.2 8.5H33l2.2-8.5Z" fill="var(--selection-ink)" fill-opacity=".12" />
              <rect x="18" y="72" width="60" height="13" rx="5" fill="url(#vlc-empty-cone-gradient)" />
            </svg>
            <div class="space-y-1.5 text-center">
              <p class="text-[15px] font-medium text-vlc-secondary">No media loaded</p>
              <p class="text-xs text-vlc-muted">Open a file to start playback</p>
            </div>
          </div>

          {#if continueItems.length > 0}
            <section class="w-full max-w-5xl">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-[13px] font-medium uppercase tracking-wide text-vlc-muted">Continue</h2>
                <div class="flex items-center gap-2">
                  <p class="text-[10px] text-vlc-muted hidden lg:block">Scroll or use arrows</p>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-control border border-vlc-border bg-vlc-panel text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
                      title="Scroll continue left"
                      aria-label="Scroll continue left"
                      on:click={() => scrollRailBy(continueRailEl, -1)}
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-control border border-vlc-border bg-vlc-panel text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
                      title="Scroll continue right"
                      aria-label="Scroll continue right"
                      on:click={() => scrollRailBy(continueRailEl, 1)}
                    >
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <div bind:this={continueRailEl} data-hscroll on:wheel|nonpassive={handleHorizontalWheel} class="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-vlc-orange/40 scrollbar-track-vlc-raised" role="region" aria-label="Continue">
                {#each continueItems as item}
                  <button
                    type="button"
                    class="group min-w-[180px] w-[180px] shrink-0 rounded-control border border-vlc-border bg-vlc-panel p-2 text-left hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                    aria-label={`Resume ${item.title}`}
                    on:click={() => {
                      if (item.src) {
                        requestSeek(item.position);
                        setQueue([{ id: item.mediaKey, title: item.title, artist: item.artist, duration: item.duration, src: item.src }], 0);
                      }
                    }}
                  >
                    <div class="relative aspect-video w-full overflow-hidden rounded bg-vlc-app flex items-center justify-center">
                      {#if item.thumbnail}
                        <img src={item.thumbnail} alt="" class="h-full w-full object-cover" />
                      {:else if item.type === 'music'}
                        <Music size={20} class="text-vlc-muted" aria-hidden="true" />
                      {:else if item.type === 'stream'}
                        <Radio size={20} class="text-vlc-muted" aria-hidden="true" />
                      {:else}
                        <Film size={20} class="text-vlc-muted" aria-hidden="true" />
                      {/if}
                      <span class="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/80">
                        {item.type === 'music' ? 'Music' : item.type === 'stream' ? 'Stream' : 'Video'}
                      </span>

                      <div class="absolute right-1 top-1 z-10 flex items-center gap-1">
                        <button
                          type="button"
                          class="flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-black/70 text-white/85 opacity-100 shadow-sm backdrop-blur-sm transition-[opacity,background-color,color] hover:bg-vlc-orange hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange focus-visible:ring-offset-1 focus-visible:ring-offset-black md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                          title="Mark as watched"
                          aria-label={`Mark ${item.title} as watched`}
                          on:click={(event) => handleContinueAction(event, 'watched', item)}
                        >
                          <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          class="flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-black/70 text-white/85 opacity-100 shadow-sm backdrop-blur-sm transition-[opacity,background-color,color] hover:bg-vlc-orange hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange focus-visible:ring-offset-1 focus-visible:ring-offset-black md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                          title="Remove from Continue"
                          aria-label={`Remove ${item.title} from Continue`}
                          on:click={(event) => handleContinueAction(event, 'remove', item)}
                        >
                          <X size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <p class="mt-1 truncate text-[12px] text-vlc-text">{item.title}</p>
                    {#if item.type === 'music'}
                      <p class="truncate text-[10px] text-vlc-muted">{item.artist || ''}</p>
                    {/if}
                    <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-vlc-raised">
                      <div class="h-full bg-vlc-orange" style={`width:${Math.min(100, Math.max(0, (item.position / item.duration) * 100))}%`} />
                    </div>
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        </div>
      {/if}

      <NextEpisodePrompt hasMedia={hasMedia} />

      <div
        class="volume-hud pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-black/80 px-3.5 py-2 shadow-lg backdrop-blur-sm transition-opacity duration-200"
        style:opacity={volumeHudVisible ? 1 : 0}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={!volumeHudVisible}
      >
        {#if volumeHudVolume === 0}
          <VolumeX size={16} strokeWidth={1.75} class="text-vlc-orange" aria-hidden="true" />
        {:else}
          <Volume2 size={16} strokeWidth={1.75} class="text-vlc-orange" aria-hidden="true" />
        {/if}
        <span class="w-9 text-right font-mono text-xs tabular-nums text-white">
          {volumeHudVolume}%
        </span>
        <span class="h-1 w-16 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
          <span
            class="block h-full rounded-full bg-vlc-orange transition-[width] duration-150"
            style={`width: ${volumeHudVolume / 2}%`}
          ></span>
        </span>
      </div>

      <div
        class="bookmark-hud pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-black/80 px-3.5 py-2 shadow-lg backdrop-blur-sm transition-opacity duration-200"
        style:opacity={bookmarkHudVisible ? 1 : 0}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={!bookmarkHudVisible}
      >
        <span class="font-mono text-xs tabular-nums text-white">
          {bookmarkHudMessage}
        </span>
      </div>

      <RightDock
        onAdvancedSettings={(category) => dispatch('advancedSettings', category ?? 'Subtitles')}
      />

      <CompactLibraryOverlay
        open={showLibrary}
        onClose={closeLibrary}
        returnFocusTo={libraryTriggerEl}
      />
    </div>

    <div
      bind:this={transportEl}
      class="player-transport relative z-30 shrink-0"
      aria-hidden={isFullscreen && !chromeVisible}
      inert={isFullscreen && !chromeVisible}
    >
      <TransportBar
        {videoEl}
        mediaAvailable={hasMedia}
        bufferedRatio={buffered}
        fullscreenTarget={shellEl}
        nativeActive={nativeAudioActive || nativeVideoActive}
        onSettings={() => dispatch('settings')}
      />
    </div>
  </div>
</div>

<style>
  /*
   * The fullscreen element is the shell, so the stage and the transport both
   * stay mounted. Fullscreen chrome always sits over black video, therefore the
   * shell pins the dark palette even when the app itself is in light mode.
   */
  .player-shell:fullscreen {
    width: 100vw;
    height: 100vh;
    background-color: #000000;
    color-scheme: dark;

    --bg-app-rgb: 14 14 14;
    --bg-panel-rgb: 24 24 24;
    --bg-panel-alt-rgb: 25 25 25;
    --bg-card-rgb: 27 27 27;
    --bg-raised-rgb: 35 35 35;
    --border-rgb: 55 55 55;
    --border-subtle-rgb: 38 38 38;
    --text-primary-rgb: 234 234 234;
    --text-secondary-rgb: 184 184 184;
    --text-muted-rgb: 143 143 143;
    --text-dim-rgb: 107 107 107;
    --danger-rgb: 232 17 35;
    --accent-ink: var(--accent);
    --selection-ink: #0e0e0e;
    --scrollbar-thumb: #373737;
    --scrollbar-thumb-hover: #6b6b6b;
    --shadow-color: rgb(0 0 0 / 0.55);
  }

  .player-shell:fullscreen .player-stage {
    padding-left: 0;
    background-color: #000000;
  }

  /* Overlay the transport at the bottom of the video on a readable gradient. */
  .player-shell:fullscreen .player-transport {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    padding-top: 2rem;
    background: linear-gradient(
      to top,
      rgb(0 0 0 / 0.92) 0%,
      rgb(0 0 0 / 0.6) 45%,
      rgb(0 0 0 / 0) 100%
    );
  }

  /* The transport is a child component: strip its opaque surface so the
     gradient reads through it in both themes. */
  .player-shell:fullscreen .player-transport > :global(*) {
    background-color: transparent;
    border-top-color: rgb(255 255 255 / 0.12);
  }

  .player-shell:fullscreen .player-topbar,
  .player-shell:fullscreen .player-transport {
    transition:
      opacity 200ms ease,
      transform 200ms ease;
  }

  .player-shell:fullscreen.chrome-hidden .player-topbar {
    opacity: 0;
    transform: translateY(-8px);
    pointer-events: none;
  }

  .player-shell:fullscreen.chrome-hidden .player-transport {
    opacity: 0;
    transform: translateY(8px);
    pointer-events: none;
  }

  /* Keep the volume HUD clear of the overlaid transport. */
  .player-shell:fullscreen .volume-hud {
    bottom: 5.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .volume-hud,
    .volume-hud * {
      transition: none !important;
    }

    .player-shell:fullscreen .player-topbar,
    .player-shell:fullscreen .player-transport {
      transition: none;
    }
  }
</style>
