<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import {
    AudioLines,
    Captions,
    ListVideo,
    Maximize,
    Minimize,
    Pause,
    Play,
    Settings,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
  } from 'lucide-svelte';
  import {
    next as nextTrack,
    player,
    prev as prevTrack,
    seek,
    setVolume,
    toggle,
    toggleMute,
  } from '../stores/player';
  import { dockMode, openDock } from '../stores/ui';

  export let videoEl: HTMLVideoElement | null = null;
  export let mediaAvailable = false;
  export let bufferedRatio = 0;
  export let fullscreenTarget: HTMLElement | null = null;
  export let onSettings: () => void = () => {};

  let seekTrack: HTMLDivElement | null = null;
  let scrubbing = false;
  let isFullscreen = false;

  $: duration =
    Number.isFinite($player.duration) && $player.duration > 0 ? $player.duration : 0;
  $: elapsed =
    Number.isFinite($player.currentTime) && $player.currentTime > 0
      ? Math.min($player.currentTime, duration || $player.currentTime)
      : 0;
  $: progressPct = duration > 0 ? clamp((elapsed / duration) * 100, 0, 100) : 0;
  $: bufferedPct = duration > 0 ? clamp(bufferedRatio * 100, 0, 100) : 0;
  $: volumeMuted = $player.muted || $player.volume === 0;
  $: volumeBackground = `linear-gradient(to right, #D37918 0%, #D37918 ${$player.volume}%, #262626 ${$player.volume}%, #262626 100%)`;

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  function formatTime(value: number): string {
    const total = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  async function togglePlay(): Promise<void> {
    const el = videoEl;

    if (el && mediaAvailable) {
      try {
        if (el.paused) await el.play();
        else el.pause();
      } catch (error) {
        console.warn('Playback could not start.', error);
        player.update((state) => ({ ...state, isPlaying: false }));
      }
      return;
    }

    // Keep the transport responsive when no media is loaded yet.
    toggle();
  }

  function goPrevious(): void {
    const before = get(player);
    prevTrack();
    const after = get(player);

    // Restarting the first item does not remount the <video>.
    if (videoEl && after.currentIndex === before.currentIndex) {
      videoEl.currentTime = 0;
    }
  }

  function goNext(): void {
    const before = get(player);
    nextTrack();
    const after = get(player);

    if (videoEl && after.currentIndex === before.currentIndex && !after.isPlaying) {
      videoEl.pause();
    }
  }

  function handleVolumeInput(event: Event): void {
    applyVolume(Number((event.currentTarget as HTMLInputElement).value));
  }

  function applyVolume(value: number): void {
    const next = Math.round(clamp(value, 0, 100));
    setVolume(next);

    if (videoEl) {
      videoEl.volume = next / 100;
      videoEl.muted = next === 0;
    }
  }

  function handleMute(): void {
    const willMute = !$player.muted;
    toggleMute();

    if (videoEl) videoEl.muted = willMute;
  }

  function applySeekTime(time: number): void {
    if (duration <= 0) return;

    const target = clamp(time, 0, duration);

    if (videoEl && mediaAvailable) {
      try {
        videoEl.currentTime = target;
      } catch (error) {
        console.warn('Seek failed.', error);
      }
    }

    seek(target);
  }

  function seekRatioFromPointer(event: PointerEvent): number {
    if (!seekTrack) return 0;
    const bounds = seekTrack.getBoundingClientRect();
    if (bounds.width <= 0) return 0;
    return clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  }

  function startScrub(event: PointerEvent): void {
    if (event.button !== 0 || duration <= 0) return;

    event.preventDefault();
    scrubbing = true;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    applySeekTime(seekRatioFromPointer(event) * duration);
  }

  function moveScrub(event: PointerEvent): void {
    if (!scrubbing) return;
    applySeekTime(seekRatioFromPointer(event) * duration);
  }

  function endScrub(event: PointerEvent): void {
    if (!scrubbing) return;

    applySeekTime(seekRatioFromPointer(event) * duration);
    scrubbing = false;

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  function cancelScrub(): void {
    scrubbing = false;
  }

  function nudgeTime(seconds: number): void {
    if (duration <= 0) return;

    const base = videoEl && Number.isFinite(videoEl.currentTime)
      ? videoEl.currentTime
      : $player.currentTime;
    applySeekTime(base + seconds);
  }

  function handleSeekKeydown(event: KeyboardEvent): void {
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!handled.includes(event.key)) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Home') {
      applySeekTime(0);
      return;
    }

    if (event.key === 'End') {
      applySeekTime(duration);
      return;
    }

    nudgeTime(event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 5);
  }

  function toggleFullscreen(): void {
    const target = fullscreenTarget ?? videoEl?.parentElement ?? null;

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Browsers can refuse to leave fullscreen if the document is not focused.
      });
      return;
    }

    if (target) {
      void target.requestFullscreen().catch((error) => {
        console.warn('Fullscreen is unavailable.', error);
      });
    }
  }

  function syncFullscreen(): void {
    isFullscreen = Boolean(document.fullscreenElement);
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;

    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable
    );
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;

    const target = event.target as HTMLElement | null;
    if (event.key.startsWith('Arrow') && target?.closest('[data-player-slider]')) return;

    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        void togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        nudgeTime(-5);
        break;
      case 'ArrowRight':
        event.preventDefault();
        nudgeTime(5);
        break;
      case 'ArrowUp':
        event.preventDefault();
        applyVolume($player.volume + 5);
        break;
      case 'ArrowDown':
        event.preventDefault();
        applyVolume($player.volume - 5);
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        handleMute();
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        toggleFullscreen();
        break;
      default:
        break;
    }
  }

  onMount(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<footer
  class="flex h-[52px] shrink-0 items-center gap-2 border-t border-vlc-border bg-vlc-app px-3"
  aria-label="Player controls"
>
  <div class="flex shrink-0 items-center gap-1">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Previous"
      aria-label="Previous"
      on:click={goPrevious}
    >
      <SkipBack size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>

    <button
      type="button"
      class="flex h-[30px] w-[34px] items-center justify-center rounded-md bg-vlc-orange text-black transition-[filter,background-color] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vlc-orange"
      title={$player.isPlaying ? 'Pause' : 'Play'}
      aria-label={$player.isPlaying ? 'Pause' : 'Play'}
      on:click={() => void togglePlay()}
    >
      {#if $player.isPlaying}
        <Pause size={15} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
      {:else}
        <Play size={15} fill="currentColor" strokeWidth={1.5} class="ml-0.5" aria-hidden="true" />
      {/if}
    </button>

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Next"
      aria-label="Next"
      on:click={goNext}
    >
      <SkipForward size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  </div>

  <span
    class="w-[58px] shrink-0 text-[11px] font-mono tabular-nums text-vlc-secondary"
    aria-label="Elapsed time"
  >
    {formatTime(elapsed)}
  </span>

  <div
    bind:this={seekTrack}
    class="group relative flex h-4 min-w-0 flex-1 cursor-pointer items-center"
    role="slider"
    tabindex="0"
    aria-label="Seek"
    aria-valuemin="0"
    aria-valuemax={Math.floor(duration)}
    aria-valuenow={Math.floor(elapsed)}
    aria-valuetext={formatTime(elapsed)}
    data-player-slider
    on:pointerdown={startScrub}
    on:pointermove={moveScrub}
    on:pointerup={endScrub}
    on:pointercancel={cancelScrub}
    on:keydown={handleSeekKeydown}
  >
    <div
      class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-vlc-border"
      aria-hidden="true"
    >
      {#if bufferedPct > 0}
        <div
          class="absolute inset-y-0 left-0 bg-vlc-borderStrong"
          style={`width: ${bufferedPct}%`}
        ></div>
      {/if}
      <div
        class="absolute inset-y-0 left-0 rounded-full bg-vlc-orange"
        style={`width: ${progressPct}%`}
      ></div>
    </div>

    <span
      class="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[0_0_0_3px_rgba(211,121,24,0.18)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      class:opacity-100={scrubbing}
      style={`left: ${progressPct}%`}
      aria-hidden="true"
    ></span>
  </div>

  <span
    class="w-[58px] shrink-0 text-right text-[11px] font-mono tabular-nums text-vlc-secondary"
    aria-label="Duration"
  >
    {formatTime(duration)}
  </span>

  <div class="ml-1 flex shrink-0 items-center gap-1">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title={volumeMuted ? 'Unmute' : 'Mute'}
      aria-label={volumeMuted ? 'Unmute' : 'Mute'}
      on:click={handleMute}
    >
      {#if volumeMuted}
        <VolumeX size={17} strokeWidth={1.75} aria-hidden="true" />
      {:else}
        <Volume2 size={17} strokeWidth={1.75} aria-hidden="true" />
      {/if}
    </button>

    <input
      type="range"
      min="0"
      max="100"
      step="1"
      value={$player.volume}
      aria-label="Volume"
      class="volume-slider w-20 cursor-pointer appearance-none rounded-full"
      style={`background: ${volumeBackground}`}
      on:input={handleVolumeInput}
    />
  </div>

  <div class="mx-1 h-4 w-px shrink-0 bg-vlc-border" aria-hidden="true"></div>

  <div class="flex shrink-0 items-center gap-0.5">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control transition-colors hover:bg-vlc-card hover:text-white"
      class:text-vlc-orange={$dockMode === 'audio'}
      class:text-vlc-secondary={$dockMode !== 'audio'}
      class:bg-vlc-card={$dockMode === 'audio'}
      title="Audio"
      aria-label="Open audio dock"
      aria-pressed={$dockMode === 'audio'}
      on:click={() => openDock('audio')}
    >
      <AudioLines size={18} strokeWidth={1.6} />
    </button>
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      class:text-vlc-orange={$dockMode === 'subtitles'}
      class:text-vlc-secondary={$dockMode !== 'subtitles'}
      class:bg-vlc-card={$dockMode === 'subtitles'}
      title="Subtitles"
      aria-label="Open subtitles dock"
      aria-pressed={$dockMode === 'subtitles'}
      on:click={() => openDock('subtitles')}
    >
      <Captions size={18} strokeWidth={1.6} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Settings"
      aria-label="Open settings"
      on:click={onSettings}
    >
      <Settings size={18} strokeWidth={1.6} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      on:click={toggleFullscreen}
    >
      {#if isFullscreen}
        <Minimize size={18} strokeWidth={1.6} aria-hidden="true" />
      {:else}
        <Maximize size={18} strokeWidth={1.6} aria-hidden="true" />
      {/if}
    </button>
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control transition-colors hover:bg-vlc-card hover:text-white"
      class:text-vlc-orange={$dockMode === 'queue'}
      class:text-vlc-secondary={$dockMode !== 'queue'}
      class:bg-vlc-card={$dockMode === 'queue'}
      title="Playing queue"
      aria-label="Open playing queue"
      aria-pressed={$dockMode === 'queue'}
      on:click={() => openDock('queue')}
    >
      <ListVideo size={18} strokeWidth={1.6} />
    </button>
  </div>
</footer>

<style>
  .volume-slider {
    height: 4px;
    outline: none;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 9999px;
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(211, 121, 24, 0.18);
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .volume-slider:hover::-webkit-slider-thumb,
  .volume-slider:focus-visible::-webkit-slider-thumb {
    opacity: 1;
  }

  .volume-slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border: 0;
    border-radius: 9999px;
    background: #FFFFFF;
    box-shadow: 0 0 0 3px rgba(211, 121, 24, 0.18);
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .volume-slider:hover::-moz-range-thumb,
  .volume-slider:focus-visible::-moz-range-thumb {
    opacity: 1;
  }

  .volume-slider::-moz-range-track {
    background: transparent;
  }
</style>
