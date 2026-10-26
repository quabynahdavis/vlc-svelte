<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    AudioLines,
    Captions,
    ListVideo,
    Pause,
    Play,
    Settings,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
  } from 'lucide-svelte';

  const dispatch = createEventDispatcher<{ settings: void }>();

  // Phase 2 will supply a real media source. Until then the player shows its
  // empty state instead of requesting a remote sample that can fail in the webview.
  export let src = '';

  let videoEl: HTMLVideoElement | null = null;
  let paused = true;

  let currentTime = 0;
  let duration = 0;
  let volume = 80;
  let muted = false;

  $: progress =
    Number.isFinite(duration) && duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;
  $: currentLabel = formatTime(currentTime);
  $: durationLabel = formatTime(duration);
  $: volumeMuted = muted || volume === 0;

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

  async function togglePlay() {
    if (!videoEl) return;

    try {
      if (videoEl.paused) await videoEl.play();
      else videoEl.pause();
    } catch (error) {
      console.warn('Playback could not start.', error);
    }
  }

  function toggleMute() {
    muted = !muted;
  }

  function updateVolume(event: Event) {
    const next = Number((event.currentTarget as HTMLInputElement).value);
    volume = next;
    muted = next === 0;
    if (videoEl) videoEl.volume = next / 100;
  }

  function seek(event: MouseEvent) {
    if (!videoEl || !Number.isFinite(duration) || duration <= 0) return;

    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    videoEl.currentTime = ratio * duration;
  }

  function seekWithKeyboard(event: KeyboardEvent) {
    if (!videoEl || !Number.isFinite(duration) || duration <= 0) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      videoEl.currentTime = Math.min(duration, videoEl.currentTime + 5);
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      videoEl.currentTime = Math.max(0, videoEl.currentTime - 5);
    }
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-vlc-app">
    {#if src}
      <!-- svelte-ignore a11y-media-has-caption -->
      <video
        bind:this={videoEl}
        {src}
        bind:paused
        bind:currentTime
        bind:duration
        bind:muted
        class="h-full w-full bg-black object-contain"
        preload="metadata"
        on:click={togglePlay}
        on:loadedmetadata={() => {
          if (videoEl) videoEl.volume = volume / 100;
        }}
      ></video>
    {:else}
      <div class="flex flex-col items-center gap-4 px-6 text-center">
        <svg
          class="h-24 w-24 drop-shadow-[0_0_40px_rgba(240,138,28,0.18)]"
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
              <stop stop-color="#F6A64B" />
              <stop offset="1" stop-color="#C96B09" />
            </linearGradient>
          </defs>
          <path d="M48 8 68 72H28L48 8Z" fill="url(#vlc-empty-cone-gradient)" />
          <path
            d="M38.9 34h18.2l2.6 10H36.3l2.6-10Z"
            fill="#0B0B0B"
            fill-opacity=".18"
          />
          <path
            d="M35.2 50h25.6l2.2 8.5H33l2.2-8.5Z"
            fill="#0B0B0B"
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
  </div>

  <div
    class="flex h-12 shrink-0 items-center gap-2 border-t border-vlc-border/60 bg-vlc-app px-3"
  >
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title="Previous item"
        aria-label="Previous item"
      >
        <SkipBack size={15} strokeWidth={1.75} />
      </button>

      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control bg-vlc-orange text-black transition-colors hover:bg-[#F6A23F] disabled:cursor-default disabled:opacity-70"
        title={paused ? 'Play' : 'Pause'}
        aria-label={paused ? 'Play' : 'Pause'}
        disabled={!src}
        on:click={togglePlay}
      >
        {#if paused}
          <Play size={15} fill="currentColor" strokeWidth={1.5} class="ml-0.5" />
        {:else}
          <Pause size={15} fill="currentColor" strokeWidth={1.5} />
        {/if}
      </button>

      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title="Next item"
        aria-label="Next item"
      >
        <SkipForward size={15} strokeWidth={1.75} />
      </button>
    </div>

    <span class="ml-1 w-[62px] shrink-0 text-[11px] tabular-nums text-vlc-secondary">
      {currentLabel}
    </span>

    <div class="mx-1 flex min-w-0 flex-1 items-center">
      <div
        class="group relative h-1 w-full cursor-pointer rounded-full bg-[#2A2A2A]"
        role="slider"
        tabindex="0"
        aria-label="Seek"
        aria-valuemin="0"
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(currentTime)}
        on:click={seek}
        on:keydown={seekWithKeyboard}
      >
        <div
          class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-vlc-orange-dark to-vlc-orange"
          style={`width: ${progress}%`}
        ></div>
        {#if progress > 0}
          <span
            class="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-vlc-orange shadow-[0_0_0_3px_rgba(240,138,28,0.15)]"
            style={`left: ${progress}%`}
            aria-hidden="true"
          ></span>
        {/if}
      </div>
    </div>

    <span class="w-[62px] shrink-0 text-right text-[11px] tabular-nums text-vlc-muted">
      {durationLabel}
    </span>

    <div class="ml-1 flex items-center gap-1">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title={volumeMuted ? 'Unmute' : 'Mute'}
        aria-label={volumeMuted ? 'Unmute' : 'Mute'}
        on:click={toggleMute}
      >
        {#if volumeMuted}
          <VolumeX size={16} strokeWidth={1.75} />
        {:else}
          <Volume2 size={16} strokeWidth={1.75} />
        {/if}
      </button>

      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        aria-label="Volume"
        class="h-1 w-16 cursor-pointer appearance-none rounded-full bg-[#2A2A2A] accent-vlc-orange"
        on:input={updateVolume}
      />

      <div class="mx-1 h-5 w-px bg-vlc-border" aria-hidden="true"></div>

      <button
        type="button"
        class="hidden h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white sm:flex"
        title="Audio devices"
        aria-label="Audio devices"
      >
        <AudioLines size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="hidden h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white sm:flex"
        title="Subtitles"
        aria-label="Subtitles"
      >
        <Captions size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title="Settings"
        aria-label="Open settings"
        on:click={() => dispatch('settings')}
      >
        <Settings size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title="Playlist"
        aria-label="Playlist"
      >
        <ListVideo size={16} strokeWidth={1.75} />
      </button>
    </div>
  </div>
</div>
