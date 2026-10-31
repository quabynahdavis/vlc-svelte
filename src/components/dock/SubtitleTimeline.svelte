<script lang="ts">
  import { Captions } from 'lucide-svelte';
  import { player } from '../../stores/player';
  import { settings } from '../../stores/settings';
  import { snapSubtitleDelay } from '../../stores/subtitleProfiles';

  const OFFSET_MIN = -10;
  const OFFSET_MAX = 10;
  const OFFSET_STEP = 0.05;
  const CUE_COUNT = 12;
  const RULER_STEPS = [0, 25, 50, 75, 100] as const;

  type CueBlock = {
    left: number;
    width: number;
    top: number;
  };

  type RulerTick = {
    percent: number;
    label: string;
    align: 'left' | 'center' | 'right';
  };

  let trackEl: HTMLDivElement | null = null;
  let dragging = false;
  let activePointer: number | null = null;

  $: duration =
    Number.isFinite($player.duration) && $player.duration > 0 ? $player.duration : 0;
  $: hasMedia = duration > 0;
  $: currentTime = clamp(
    Number.isFinite($player.currentTime) ? $player.currentTime : 0,
    0,
    hasMedia ? duration : 0,
  );
  $: delay = clamp(numericValue($settings.subtitleDelay), OFFSET_MIN, OFFSET_MAX);
  $: playheadPercent = hasMedia ? clamp((currentTime / duration) * 100, 0, 100) : 0;
  $: offsetPercent = ((delay - OFFSET_MIN) / (OFFSET_MAX - OFFSET_MIN)) * 100;
  $: fillLeft = Math.min(50, offsetPercent);
  $: fillWidth = Math.abs(offsetPercent - 50);
  $: rulerTicks = hasMedia ? buildRulerTicks(duration) : [];
  $: cues = hasMedia ? buildCueBlocks(duration) : [];

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function numericValue(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatTime(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0:00';

    const total = Math.max(0, Math.round(value));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function formatOffset(value: number): string {
    const normalized = Math.abs(value) < 0.0005 ? 0 : value;
    const sign = normalized > 0 ? '+' : normalized < 0 ? '-' : '';
    return `${sign}${Math.abs(normalized).toFixed(3)} s`;
  }

  function buildRulerTicks(total: number): RulerTick[] {
    return RULER_STEPS.map((percent, index) => ({
      percent,
      label: formatTime((total * percent) / 100),
      align: index === 0 ? 'left' : index === RULER_STEPS.length - 1 ? 'right' : 'center',
    }));
  }

  function buildCueBlocks(total: number): CueBlock[] {
    // The app has no subtitle cue parser/renderer yet. These 12 blocks are
    // synthetic visual placeholders distributed across the duration so the
    // timeline can be designed and tested; they do not represent real cues.
    const slot = total / CUE_COUNT;

    return Array.from({ length: CUE_COUNT }, (_, index) => {
      const start = index * slot + slot * 0.08;
      const width = Math.max(slot * 0.55, total * 0.005);
      const left = (start / total) * 100;

      return {
        left,
        width: Math.min((width / total) * 100, 100 - left),
        top: 5 + (index % 3) * 9,
      };
    });
  }

  function setDelay(value: number): void {
    if (!hasMedia) return;

    const next = snapSubtitleDelay(value);
    if (next === delay) return;

    settings.update((state) => ({ ...state, subtitleDelay: `${next.toFixed(3)} s` }));
  }

  function nudge(amount: number): void {
    setDelay(delay + amount);
  }

  function setFromPointer(event: PointerEvent): void {
    if (!hasMedia || !trackEl) return;

    const bounds = trackEl.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    setDelay(OFFSET_MIN + ratio * (OFFSET_MAX - OFFSET_MIN));
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!hasMedia || event.button !== 0) return;

    event.preventDefault();
    dragging = true;
    activePointer = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setFromPointer(event);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!dragging || event.pointerId !== activePointer) return;
    setFromPointer(event);
  }

  function endDrag(event: PointerEvent): void {
    if (!dragging) return;

    dragging = false;
    activePointer = null;

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!hasMedia) return;

    const step = event.shiftKey ? 0.1 : OFFSET_STEP;
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = delay - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = delay + step;
        break;
      case 'Home':
        next = OFFSET_MIN;
        break;
      case 'End':
        next = OFFSET_MAX;
        break;
      default:
        return;
    }

    event.preventDefault();
    setDelay(next);
  }
</script>

<div class="rounded-[10px] border border-vlc-border bg-vlc-card/60 p-3" data-subtitle-timeline>
  <div class="flex items-baseline justify-between gap-2">
    <span class="text-[11px] uppercase tracking-[0.08em] text-vlc-muted">Subtitle timeline</span>
    {#if hasMedia}
      <span class="shrink-0 text-[10px] tabular-nums text-vlc-muted">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    {/if}
  </div>

  {#if hasMedia}
    <div class="relative mt-2" aria-hidden="true">
      <div class="relative h-4">
        {#each rulerTicks as tick (tick.percent)}
          <span
            class="absolute top-0 whitespace-nowrap text-[9px] leading-none tabular-nums text-vlc-muted {tick.align ===
            'center'
              ? '-translate-x-1/2'
              : tick.align === 'right'
                ? '-translate-x-full'
                : ''}"
            style={`left: ${tick.percent}%`}
          >
            {tick.label}
          </span>
        {/each}
      </div>

      <div class="relative mt-1 h-[34px] overflow-hidden rounded-[5px] border border-vlc-border/60 bg-vlc-app/60">
        {#each RULER_STEPS.slice(1, -1) as percent (percent)}
          <span
            class="absolute inset-y-0 w-px bg-vlc-border/40"
            style={`left: ${percent}%`}
          ></span>
        {/each}

        {#each cues as cue, index (index)}
          <span
            class="absolute h-[5px] rounded-[2px] border border-vlc-orange/25 bg-vlc-orange/35"
            style={`left: ${cue.left.toFixed(3)}%; width: ${cue.width.toFixed(3)}%; top: ${cue.top}px`}
          ></span>
        {/each}
      </div>

      <div class="pointer-events-none absolute inset-y-0" style={`left: ${playheadPercent.toFixed(3)}%`}>
        <span class="absolute inset-y-0 w-px bg-vlc-orange"></span>
        <span
          class="absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-vlc-orange"
        ></span>
      </div>
    </div>
  {:else}
    <div
      class="mt-2 flex h-[74px] flex-col items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-vlc-border/70 bg-vlc-app/40 px-3 text-center"
    >
      <Captions size={18} strokeWidth={1.7} class="text-vlc-muted" aria-hidden="true" />
      <p class="text-[11px] leading-4 text-vlc-muted">Load media to sync subtitles</p>
    </div>
  {/if}

  <div class="mt-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-[12px] text-vlc-secondary">Subtitle offset</span>
      <span
        class="rounded-[4px] bg-vlc-app/60 px-1.5 py-0.5 text-[13px] font-semibold tabular-nums text-vlc-text"
        aria-live="polite"
        aria-atomic="true"
      >
        {formatOffset(delay)}
      </span>
    </div>

    <div
      bind:this={trackEl}
      class="relative mt-2 h-7 w-full touch-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      class:cursor-pointer={hasMedia}
      class:cursor-not-allowed={!hasMedia}
      class:opacity-45={!hasMedia}
      role="slider"
      tabindex={hasMedia ? 0 : -1}
      aria-label="Subtitle offset"
      aria-valuemin={OFFSET_MIN}
      aria-valuemax={OFFSET_MAX}
      aria-valuenow={delay}
      aria-valuetext={formatOffset(delay)}
      aria-disabled={!hasMedia}
      data-subtitle-offset
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={endDrag}
      on:pointercancel={endDrag}
      on:keydown={handleKeydown}
    >
      <div
        class="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-vlc-borderStrong"
        aria-hidden="true"
      ></div>
      <div
        class="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-vlc-orange/70"
        style={`left: ${fillLeft.toFixed(3)}%; width: ${fillWidth.toFixed(3)}%`}
        aria-hidden="true"
      ></div>
      <span
        class="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-vlc-text/40"
        style="left: 50%"
        aria-hidden="true"
      ></span>
      <span
        class="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-vlc-orange bg-vlc-orange"
        style={`left: ${offsetPercent.toFixed(3)}%`}
        aria-hidden="true"
      ></span>
    </div>

    <div class="mt-0.5 flex items-center justify-between text-[10px] leading-4 text-vlc-muted">
      <span>-10 s</span>
      <span>0</span>
      <span>+10 s</span>
    </div>

    <div class="mt-2 grid grid-cols-3 gap-1.5">
      <button
        type="button"
        class="h-8 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-1 text-[11px] tabular-nums text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-vlc-border/70 disabled:hover:text-vlc-secondary"
        disabled={!hasMedia}
        on:click={() => nudge(-0.1)}
      >
        -0.1 s
      </button>
      <button
        type="button"
        class="h-8 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-1 text-[11px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-vlc-border/70 disabled:hover:text-vlc-secondary"
        disabled={!hasMedia}
        on:click={() => setDelay(0)}
      >
        Reset
      </button>
      <button
        type="button"
        class="h-8 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-1 text-[11px] tabular-nums text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-vlc-border/70 disabled:hover:text-vlc-secondary"
        disabled={!hasMedia}
        on:click={() => nudge(0.1)}
      >
        +0.1 s
      </button>
    </div>
  </div>
</div>
