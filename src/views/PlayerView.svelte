<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { Library, Minimize, PictureInPicture, Volume2, VolumeX } from 'lucide-svelte';
  import CompactLibraryOverlay from '../components/CompactLibraryOverlay.svelte';
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
  import { currentTrack, next, player, setQueue, setVolume, toggle } from '../stores/player';
import { addBookmark, formatTimestamp, mediaKeyFor } from '../stores/bookmarks';
  import { navigate } from '../stores/navigation';
  import { getContinueByType, upsertWatch, type WatchEntry } from '../stores/watch';

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

  $: videoSrc = $currentTrack?.src ?? src;
  $: hasMedia = Boolean(videoSrc);
  $: mediaKey = `${$currentTrack?.id ?? 'external'}:${videoSrc}`;
  $: mediaTitle = $currentTrack?.title?.trim() || 'Kanea';

  import { watchEntries } from '../stores/watch';
  $: continueVideoItems = $watchEntries
    .filter(e => e.type === 'video' && !e.watched && e.position > 0 && e.duration > 0 && e.position / e.duration < 0.98 && e.position / e.duration > 0.02)
    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
    .slice(0, 5);
  $: continueMusicItems = $watchEntries
    .filter(e => e.type === 'music' && !e.watched && e.position > 0 && e.duration > 0 && e.position / e.duration < 0.98 && e.position / e.duration > 0.02)
    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
    .slice(0, 5);
  $: continueStreamItems = $watchEntries
    .filter(e => e.type === 'stream' && !e.watched && e.position > 0 && e.duration > 0 && e.position / e.duration < 0.98 && e.position / e.duration > 0.02)
    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
    .slice(0, 5);

  // Rebind the Picture-in-Picture listeners whenever the media element changes.
  $: syncPipElement(videoEl);

  // Store -> element: load a new source and rewind when the current track changes.
  $: syncSource(videoEl, mediaKey, videoSrc, $currentTrack?.duration ?? 0);
  // Store -> element: follow play/pause intent (including stop and context-menu actions).
  $: syncPlayback(videoEl, $player.isPlaying, hasMedia);
  // Store -> element: honour store-initiated rewinds (stop, re-clicking the current queue row).
  $: syncStoreSeek(videoEl, $player.currentTime, $player.isPlaying);
  // Store -> element: keep volume and mute in step with context-menu and transport actions.
  $: syncVolume(videoEl, $player.volume, $player.muted);

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function syncSource(
    el: HTMLVideoElement | null,
    key: string,
    source: string,
    fallbackDuration: number,
  ): void {
    if (!el) {
      syncedMediaKey = '';
      return;
    }

    if (key === syncedMediaKey) return;

    syncedMediaKey = key;
    pendingLoad = true;

    el.pause();

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

    el.volume = clamp(volume / 100, 0, 1);
    el.muted = muted;
  }

  function handleLoadedMetadata(): void {
    const el = videoEl;
    if (!el) return;

    const mediaDuration =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;

    player.update((state) => ({
      ...state,
      duration: mediaDuration || state.duration,
      currentTime: 0,
    }));

    try {
      el.currentTime = 0;
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
    player.update((state) => (state.isPlaying ? state : { ...state, isPlaying: true }));
  }

  function handlePlaying(): void {
    pendingLoad = false;

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

  function handleStageWheel(event: WheelEvent): void {
    // Let the right dock and the compact library scroll normally instead of
    // hijacking their wheel events for volume.
    if (
      event.target instanceof Element &&
      event.target.closest('[data-right-dock], [data-compact-library]')
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
    const nextVolume = clamp(get(player).volume - steps * stepSize, 0, 100);

    // The store stays the source of truth; the reactive sync updates the element.
    setVolume(nextVolume);
    showVolumeHud();
  }

  onMount(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', handleGlobalKeydown);
    syncFullscreen();

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('keydown', handleGlobalKeydown);
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
      class="player-stage group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-vlc-app lg:pl-0"
      on:wheel|nonpassive={handleStageWheel}
    >
      {#if !isFullscreen}
        <button
          bind:this={libraryTriggerEl}
          type="button"
          class="absolute right-3 top-3 z-20 flex h-8 items-center gap-1.5 rounded-control border border-vlc-border bg-vlc-panel/90 px-2.5 text-[11px] text-vlc-secondary opacity-0 shadow-sm backdrop-blur-sm transition-[opacity,background-color,color] hover:bg-vlc-raised hover:text-vlc-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 group-hover:opacity-100"
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

          {#if continueVideoItems.length > 0}
            <section class="w-full max-w-5xl">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-[13px] font-medium uppercase tracking-wide text-vlc-muted">Continue watching</h2>
                <p class="text-[10px] text-vlc-muted hidden lg:block">Shift + scroll or drag to scroll</p>
              </div>
              <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-vlc-orange/40 scrollbar-track-vlc-raised" role="region" aria-label="Continue watching">
                {#each continueVideoItems as item}
                  <button class="min-w-[180px] shrink-0 rounded-control border border-vlc-border bg-vlc-panel p-2 text-left hover:bg-vlc-raised" on:click={() => {
                    if (item.src) {
                      setQueue([{ id: item.mediaKey, title: item.title, duration: item.duration, src: item.src }], 0);
                    }
                  }}>
                    <div class="aspect-video w-full overflow-hidden rounded bg-vlc-app">
                      {#if item.thumbnail}
                        <img src={item.thumbnail} alt="" class="h-full w-full object-cover" />
                      {/if}
                    </div>
                    <p class="mt-1 truncate text-[12px] text-vlc-text">{item.title}</p>
                    <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-vlc-raised">
                      <div class="h-full bg-vlc-orange" style={`width:${Math.min(100, Math.max(0, (item.position / item.duration) * 100))}%`} />
                    </div>
                  </button>
                {/each}
              </div>
            </section>
          {/if}

          {#if continueMusicItems.length > 0}
            <section class="w-full max-w-5xl">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-[13px] font-medium uppercase tracking-wide text-vlc-muted">Continue playing</h2>
                <p class="text-[10px] text-vlc-muted hidden lg:block">Shift + scroll or drag to scroll</p>
              </div>
              <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-vlc-orange/40 scrollbar-track-vlc-raised" role="region" aria-label="Continue playing">
                {#each continueMusicItems as item}
                  <button class="min-w-[140px] shrink-0 rounded-control border border-vlc-border bg-vlc-panel p-2 text-left hover:bg-vlc-raised" on:click={() => {
                    if (item.src) setQueue([{ id: item.mediaKey, title: item.title, artist: item.artist, duration: item.duration, src: item.src }], 0);
                  }}>
                    <div class="aspect-square w-full overflow-hidden rounded bg-vlc-app flex items-center justify-center">
                      {#if item.thumbnail}
                        <img src={item.thumbnail} alt="" class="h-full w-full object-cover" />
                      {/if}
                    </div>
                    <p class="mt-1 truncate text-[12px] text-vlc-text">{item.title}</p>
                    <p class="truncate text-[10px] text-vlc-muted">{item.artist || ''}</p>
                  </button>
                {/each}
              </div>
            </section>
          {/if}

          {#if continueStreamItems.length > 0}
            <section class="w-full max-w-5xl">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-[13px] font-medium uppercase tracking-wide text-vlc-muted">Continue streaming</h2>
                <p class="text-[10px] text-vlc-muted hidden lg:block">Shift + scroll or drag to scroll</p>
              </div>
              <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-vlc-orange/40 scrollbar-track-vlc-raised" role="region" aria-label="Continue streaming">
                {#each continueStreamItems as item}
                  <button class="min-w-[180px] shrink-0 rounded-control border border-vlc-border bg-vlc-panel p-2 text-left hover:bg-vlc-raised" on:click={() => {
                    if (item.src) setQueue([{ id: item.mediaKey, title: item.title, duration: item.duration, src: item.src }], 0);
                  }}>
                    <div class="aspect-video w-full overflow-hidden rounded bg-vlc-app flex items-center justify-center text-vlc-muted">
                      Stream
                    </div>
                    <p class="mt-1 truncate text-[12px] text-vlc-text">{item.title}</p>
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        </div>
      {/if}

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
            style={`width: ${volumeHudVolume}%`}
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
        fullscreen={isFullscreen}
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
