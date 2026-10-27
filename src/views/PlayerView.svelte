<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import PlaylistPanel from '../components/PlaylistPanel.svelte';
  import RightDock from '../components/RightDock.svelte';
  import TransportBar from '../components/TransportBar.svelte';
  import { currentTrack, next, player } from '../stores/player';
  import { navigate } from '../stores/navigation';

  const dispatch = createEventDispatcher<{ settings: void; advancedSettings: string }>();

  // Optional external source kept for compatibility with the shell/library flow.
  export let src = '';

  let showPlaylist = true;
  let videoEl: HTMLVideoElement | null = null;
  let stageEl: HTMLDivElement | null = null;
  let buffered = 0;

  /** Key of the source currently applied to the element. */
  let syncedMediaKey = '';
  /** True while a source swap is in flight, so transient media events are ignored. */
  let pendingLoad = false;
  /** Previous store time, used to detect store-initiated rewinds. */
  let previousStoreTime = 0;

  $: videoSrc = $currentTrack?.src ?? src;
  $: hasMedia = Boolean(videoSrc);
  $: mediaKey = `${$currentTrack?.id ?? 'external'}:${videoSrc}`;

  // Store -> element: load a new source and rewind when the current track changes.
  $: syncSource(videoEl, mediaKey, videoSrc, $currentTrack?.duration ?? 0);
  // Store -> element: follow play/pause intent (including stop and context-menu actions).
  $: syncPlayback(videoEl, $player.isPlaying, hasMedia);
  // Store -> element: honour store-initiated rewinds (stop, re-clicking the current queue row).
  $: syncStoreSeek(videoEl, $player.currentTime, $player.isPlaying);

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

  function applyVolumeAndMute(): void {
    const el = videoEl;
    if (!el) return;

    el.volume = clamp($player.volume / 100, 0, 1);
    el.muted = $player.muted;
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

    applyVolumeAndMute();

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
</script>

<div class="relative flex h-full min-h-0 overflow-hidden bg-vlc-app">
  {#if showPlaylist}
    <!-- Full-width on desktop; a stage overlay on narrow windows keeps the transport intact. -->
    <div
      class="absolute bottom-[52px] left-0 top-0 z-20 w-[300px] lg:static lg:h-full lg:shadow-none"
    >
      <PlaylistPanel
        on:close={() => (showPlaylist = false)}
        on:back={handleBack}
      />
    </div>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col">
    <div
      bind:this={stageEl}
      class="player-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-vlc-app lg:pl-0"
      class:pl-[300px]={showPlaylist}
    >
      {#if hasMedia}
        <!-- svelte-ignore a11y-media-has-caption -->
        <video
          bind:this={videoEl}
          class="h-full w-full bg-black object-contain"
          preload="metadata"
          playsinline
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
        <div class="flex flex-col items-center gap-4 px-6 text-center">
          <svg
            class="h-24 w-24 drop-shadow-[0_0_40px_rgba(211,121,24,0.18)]"
            viewBox="0 0 96 96"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="vlc-empty-cone-gradient"
                x1="48"
                y1="8"
                x2="48"
                y2="85"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#D37918" />
                <stop offset="1" stop-color="#AB6314" />
              </linearGradient>
            </defs>
            <path d="M48 8 68 72H28L48 8Z" fill="url(#vlc-empty-cone-gradient)" />
            <path
              d="M38.9 34h18.2l2.6 10H36.3l2.6-10Z"
              fill="#0E0E0E"
              fill-opacity=".18"
            />
            <path
              d="M35.2 50h25.6l2.2 8.5H33l2.2-8.5Z"
              fill="#0E0E0E"
              fill-opacity=".12"
            />
            <rect
              x="18"
              y="72"
              width="60"
              height="13"
              rx="5"
              fill="url(#vlc-empty-cone-gradient)"
            />
          </svg>

          <div class="space-y-1.5">
            <p class="text-[15px] font-medium text-vlc-secondary">No media loaded</p>
            <p class="text-xs text-vlc-muted">Open a file to start playback</p>
          </div>
        </div>
      {/if}

      <RightDock
        onAdvancedSettings={(category) => dispatch('advancedSettings', category ?? 'Subtitles')}
      />
    </div>

    <TransportBar
      {videoEl}
      mediaAvailable={hasMedia}
      bufferedRatio={buffered}
      fullscreenTarget={stageEl}
      onSettings={() => dispatch('settings')}
    />
  </div>
</div>

<style>
  .player-stage:fullscreen {
    width: 100vw;
    height: 100vh;
    background-color: #000000;
  }
</style>
