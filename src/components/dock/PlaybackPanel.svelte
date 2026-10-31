<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ChevronDown } from 'lucide-svelte';
  import { currentTrack, player, seek, type RepeatMode } from '../../stores/player';
  import DockSlider from './DockSlider.svelte';
  import TogglePill from './TogglePill.svelte';

  const repeatModes: { id: RepeatMode; label: string }[] = [
    { id: 'off', label: 'Off' },
    { id: 'all', label: 'All' },
    { id: 'one', label: 'One' },
  ];

  const aspectRatios = ['Auto', '16:9', '4:3', '1:1', '21:9'];
  const speedPresets = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
  const sleepPresets = [15, 30, 45, 60] as const;
  const waveformBarCount = 48;

  let speed = 1;
  let aspectRatio = 'Auto';
  let deinterlace = false;
  let yadifDeinterlace = false;
  // UI-only preference until the media engine exposes reverse playback.
  let reversePlayback = false;

  let sleepMinutes: number | null = null;
  let remainingSeconds = 0;
  let timerFinished = false;
  let sleepTimerId: ReturnType<typeof setInterval> | null = null;
  let wasPlaying = false;

  $: duration = $player.duration > 0 ? $player.duration : 0;
  $: progress = duration > 0 ? clamp($player.currentTime / duration, 0, 1) : 0;
  $: waveformBars = buildWaveform($currentTrack?.title ?? '');
  $: displayDuration = $currentTrack
    ? formatTime(duration > 0 ? duration : $currentTrack.duration)
    : '—';
  $: queuePosition =
    $player.currentIndex >= 0 && $player.queue.length > 0
      ? `${$player.currentIndex + 1} of ${$player.queue.length}`
      : '—';
  $: canSeek = duration > 0;

  // Stop the sleep timer when playback transitions to stopped. The timer
  // clears its own id before pausing at zero, so "Timer finished" survives.
  $: {
    const playing = $player.isPlaying;
    if (wasPlaying && !playing && sleepTimerId !== null) {
      cancelSleepTimer();
    }
    wasPlaying = playing;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  function formatCountdown(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function setRepeat(mode: RepeatMode): void {
    player.update((state) => ({ ...state, repeat: mode }));
  }

  function setShuffle(value: boolean): void {
    player.update((state) => ({ ...state, shuffle: value }));
  }

  function hashTitle(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Deterministic decorative bars: the same title always produces the same
   * silhouette, so the strip never reshuffles on unrelated re-renders.
   */
  function buildWaveform(title: string): number[] {
    let state = hashTitle(title || 'kanea') || 0x9e3779b9;

    return Array.from({ length: waveformBarCount }, (_, index) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const noise = state / 0xffffffff;
      const envelope = 0.55 + 0.45 * Math.sin(((index + 1) / waveformBarCount) * Math.PI);
      return Math.min(1, Math.max(0.14, (0.25 + noise * 0.75) * envelope));
    });
  }

  function seekFromPointer(event: MouseEvent): void {
    if (!canSeek) return;

    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (bounds.width <= 0) return;

    const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    seek(ratio * duration);
  }

  function handleWaveformKeydown(event: KeyboardEvent): void {
    if (!canSeek) return;

    let target: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        target = $player.currentTime - 5;
        break;
      case 'ArrowRight':
        target = $player.currentTime + 5;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = duration;
        break;
      default:
        return;
    }

    event.preventDefault();
    seek(target);
  }

  function selectSleepTimer(minutes: number): void {
    if (sleepTimerId !== null) {
      clearInterval(sleepTimerId);
      sleepTimerId = null;
    }

    timerFinished = false;
    sleepMinutes = minutes;
    remainingSeconds = minutes * 60;

    sleepTimerId = setInterval(() => {
      if (remainingSeconds <= 1) {
        finishSleepTimer();
        return;
      }
      remainingSeconds -= 1;
    }, 1000);
  }

  function finishSleepTimer(): void {
    if (sleepTimerId !== null) {
      clearInterval(sleepTimerId);
      sleepTimerId = null;
    }

    remainingSeconds = 0;
    timerFinished = true;
    player.update((state) => ({ ...state, isPlaying: false }));
  }

  function cancelSleepTimer(): void {
    if (sleepTimerId !== null) {
      clearInterval(sleepTimerId);
      sleepTimerId = null;
    }

    sleepMinutes = null;
    remainingSeconds = 0;
    timerFinished = false;
  }

  onDestroy(() => {
    if (sleepTimerId !== null) {
      clearInterval(sleepTimerId);
      sleepTimerId = null;
    }
  });
</script>

<div class="space-y-3 p-3" data-playback-panel>
  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4" data-now-playing>
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Now Playing</h3>
      {#if $currentTrack}
        <span class="shrink-0 text-[11px] leading-4 text-vlc-muted">
          {$player.isPlaying ? 'Playing' : 'Paused'}
        </span>
      {/if}
    </div>

    {#if $currentTrack}
      <p class="mt-3 truncate text-[15px] font-medium leading-5 text-vlc-text" title={$currentTrack.title}>
        {$currentTrack.title}
      </p>
      {#if $currentTrack.artist}
        <p class="mt-0.5 truncate text-[12px] leading-4 text-vlc-muted" title={$currentTrack.artist}>
          {$currentTrack.artist}
        </p>
      {/if}

      <dl class="mt-3 space-y-2 border-t border-vlc-border pt-3 text-[11px] leading-4">
        <div class="flex items-center justify-between gap-3">
          <dt class="text-vlc-muted">Duration</dt>
          <dd class="tabular-nums text-vlc-secondary">{displayDuration}</dd>
        </div>
        <div class="flex items-center justify-between gap-3">
          <dt class="text-vlc-muted">Queue</dt>
          <dd class="tabular-nums text-vlc-secondary">{queuePosition}</dd>
        </div>
      </dl>
    {:else}
      <p class="mt-2 text-[12px] leading-5 text-vlc-muted">
        Nothing loaded. Choose a track or video to see playback details.
      </p>
    {/if}
  </section>

  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4">
    <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Playback</h3>

    <div class="mt-2">
      <DockSlider
        label="Playback Speed"
        bind:value={speed}
        min={0.25}
        max={4}
        step={0.05}
        suffix="x"
        decimals={2}
      />
    </div>

    <div class="mt-4">
      <div class="mb-2 flex items-baseline justify-between gap-3">
        <span class="text-[11px] font-medium uppercase tracking-wide text-vlc-muted">Speed presets</span>
        <span class="text-[11px] tabular-nums text-vlc-muted">{speed.toFixed(2)}x</span>
      </div>
      <div
        class="grid grid-cols-6 gap-1 rounded-[8px] bg-vlc-app p-1"
        role="group"
        aria-label="Playback speed presets"
      >
        {#each speedPresets as preset (preset)}
          {@const active = Math.abs(speed - preset) < 0.001}
          <button
            type="button"
            class="flex h-8 items-center justify-center rounded-[6px] text-[11px] tabular-nums ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
            class:bg-vlc-raised={active}
            class:text-vlc-orangeText={active}
            class:ring-1={active}
            class:ring-vlc-orange={active}
            class:text-vlc-muted={!active}
            class:hover:text-vlc-text={!active}
            aria-pressed={active}
            on:click={() => (speed = preset)}
          >
            {preset}x
          </button>
        {/each}
      </div>
    </div>

    <div class="mt-4 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Repeat</span>
        <span class="text-[11px] capitalize text-vlc-muted">{$player.repeat}</span>
      </div>
      <div class="grid grid-cols-3 gap-1 rounded-[8px] bg-vlc-app p-1" role="group" aria-label="Repeat mode">
        {#each repeatModes as mode (mode.id)}
          {@const active = $player.repeat === mode.id}
          <button
            type="button"
            class="flex h-8 items-center justify-center rounded-[6px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
            class:bg-vlc-orangeDeep={active}
            class:text-vlc-orange={active}
            class:text-vlc-dim={!active}
            class:hover:text-vlc-text={!active}
            aria-pressed={active}
            on:click={() => setRepeat(mode.id)}
          >
            {mode.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <span class="text-[13px] text-vlc-dim">Shuffle</span>
      <TogglePill
        value={$player.shuffle}
        ariaLabel="Shuffle"
        on:change={(event) => setShuffle(event.detail)}
      />
    </div>

    <div class="mt-5 border-t border-vlc-border pt-4">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-secondary">Reverse playback</span>
        <TogglePill bind:value={reversePlayback} ariaLabel="Reverse playback" />
      </div>
      <p class="mt-1.5 text-[11px] leading-4 text-vlc-muted">
        UI preference only — the media engine does not reverse audio or video yet.
      </p>
    </div>
  </section>

  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4" data-sleep-timer>
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Sleep Timer</h3>
      {#if sleepMinutes !== null}
        <span
          class="shrink-0 text-[13px] font-medium tabular-nums text-vlc-orangeText"
          role="timer"
          aria-live={timerFinished ? 'polite' : 'off'}
        >
          {timerFinished ? 'Timer finished' : formatCountdown(remainingSeconds)}
        </span>
      {/if}
    </div>

    <div
      class="mt-3 grid grid-cols-5 gap-1 rounded-[8px] bg-vlc-app p-1"
      role="group"
      aria-label="Sleep timer duration"
    >
      <button
        type="button"
        class="flex h-9 items-center justify-center rounded-[6px] text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
        class:bg-vlc-raised={sleepMinutes === null}
        class:text-vlc-secondary={sleepMinutes === null}
        class:text-vlc-muted={sleepMinutes !== null}
        class:hover:text-vlc-text={sleepMinutes !== null}
        aria-pressed={sleepMinutes === null}
        on:click={cancelSleepTimer}
      >
        Off
      </button>
      {#each sleepPresets as minutes (minutes)}
        {@const active = sleepMinutes === minutes}
        <button
          type="button"
          class="flex h-9 items-center justify-center gap-0.5 rounded-[6px] text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
          class:bg-vlc-raised={active}
          class:text-vlc-orangeText={active}
          class:text-vlc-muted={!active}
          class:hover:text-vlc-text={!active}
          aria-pressed={active}
          aria-label={`${minutes} minutes`}
          on:click={() => selectSleepTimer(minutes)}
        >
          {minutes}<span class="text-[9px] leading-none">min</span>
        </button>
      {/each}
    </div>

    {#if sleepMinutes !== null && !timerFinished}
      <button
        type="button"
        class="mt-3 flex h-8 w-full items-center justify-center rounded-[6px] border border-vlc-border text-[12px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
        on:click={cancelSleepTimer}
      >
        Cancel timer
      </button>
    {:else if timerFinished}
      <p class="mt-3 text-[11px] leading-4 text-vlc-muted">Playback paused when the timer ended.</p>
    {:else}
      <p class="mt-3 text-[11px] leading-4 text-vlc-muted">
        Playback pauses automatically when the timer ends.
      </p>
    {/if}
  </section>

  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4" data-waveform>
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Waveform</h3>
      <span class="shrink-0 text-[11px] tabular-nums text-vlc-muted">
        {formatTime($player.currentTime)}{canSeek ? ` / ${formatTime(duration)}` : ''}
      </span>
    </div>

    <!--
      Decorative seek strip: the bars are derived deterministically from the
      current title, not from real audio analysis.
    -->
    <div
      class="relative mt-3 h-[64px] w-full overflow-hidden rounded-[8px] bg-vlc-app p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      class:cursor-pointer={canSeek}
      class:cursor-not-allowed={!canSeek}
      class:opacity-50={!canSeek}
      role="slider"
      tabindex={canSeek ? 0 : -1}
      aria-label="Seek within current track"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round($player.currentTime)}
      aria-valuetext={canSeek
        ? `${formatTime($player.currentTime)} of ${formatTime(duration)}`
        : 'Seek unavailable'}
      aria-disabled={!canSeek}
      on:click={seekFromPointer}
      on:keydown={handleWaveformKeydown}
    >
      <div class="flex h-full w-full items-end gap-[2px]" aria-hidden="true">
        {#each waveformBars as bar, index (index)}
          {@const played = (index + 1) / waveformBars.length <= progress}
          <span
            class={`flex-1 rounded-t-[2px] ${played ? 'bg-vlc-orange/70' : 'bg-vlc-borderStrong'}`}
            style={`height: ${Math.round(bar * 100)}%`}
          ></span>
        {/each}
      </div>
      <span
        class="pointer-events-none absolute inset-y-1 w-[2px] rounded-full bg-vlc-orange"
        style={`left: calc(${progress * 100}% - 1px);`}
        aria-hidden="true"
      ></span>
    </div>

    <p class="mt-2 text-[11px] leading-4 text-vlc-muted">
      Click or use the arrow keys to seek. Decorative bars, not real audio analysis.
    </p>
  </section>

  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4">
    <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Video Output</h3>

    <div class="mt-4 flex items-center justify-between gap-3">
      <span class="min-w-0 truncate text-[13px] text-vlc-dim">Aspect Ratio</span>
      <div class="relative w-[148px] shrink-0">
        <select
          bind:value={aspectRatio}
          aria-label="Aspect ratio"
          class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-vlc-app pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60"
        >
          {#each aspectRatios as ratio (ratio)}
            <option>{ratio}</option>
          {/each}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={1.7}
          class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-dim"
          aria-hidden="true"
        />
      </div>
    </div>

    <div class="mt-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Deinterlace</span>
        <TogglePill bind:value={deinterlace} ariaLabel="Deinterlace" />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Yadif (2x)</span>
        <TogglePill bind:value={yadifDeinterlace} ariaLabel="Yadif deinterlace" />
      </div>
    </div>
  </section>
</div>
