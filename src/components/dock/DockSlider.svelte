<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value = 0;
  export let min = 0;
  export let max = 100;
  export let step = 1;
  export let label = '';
  export let suffix = '';
  export let decimals = 1;
  export let leftCaption = '';
  export let centerCaption = '';
  export let rightCaption = '';
  export let ariaLabel = label;

  const dispatch = createEventDispatcher<{ change: number }>();

  let trackEl: HTMLDivElement | null = null;
  let dragging = false;
  let activePointer: number | null = null;

  $: percent = max > min ? clamp(((value - min) / (max - min)) * 100, 0, 100) : 0;
  $: formatted = `${value.toFixed(decimals)}${suffix ? ` ${suffix}` : ''}`;
  $: showCaptions = Boolean(leftCaption || centerCaption || rightCaption);
  $: stepDecimals = decimalsForStep(step);

  function clamp(input: number, lower: number, upper: number): number {
    return Math.min(upper, Math.max(lower, input));
  }

  function decimalsForStep(increment: number): number {
    const text = String(increment);
    return text.includes('.') ? text.split('.')[1].length : 0;
  }

  function snap(input: number): number {
    const base = min + Math.round((input - min) / step) * step;
    return Number(clamp(base, min, max).toFixed(Math.max(stepDecimals, decimals)));
  }

  function setFromPointer(event: PointerEvent): void {
    if (!trackEl) return;

    const bounds = trackEl.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const next = snap(min + ratio * (max - min));

    if (next !== value) {
      value = next;
      dispatch('change', next);
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;

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
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }

    event.preventDefault();
    const bounded = Number(clamp(next, min, max).toFixed(Math.max(stepDecimals, decimals)));
    if (bounded !== value) {
      value = bounded;
      dispatch('change', bounded);
    }
  }

</script>

<div class="w-full min-w-0">
  {#if label}
    <div class="flex items-baseline justify-between gap-3">
      <span class="truncate text-[14px] leading-5 text-vlc-dim">{label}</span>
      <span class="shrink-0 text-[14px] leading-5 tabular-nums text-vlc-dim">{formatted}</span>
    </div>
  {/if}

  <div
    bind:this={trackEl}
    class="relative my-[14px] h-7 w-full cursor-pointer touch-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
    role="slider"
    tabindex="0"
    aria-label={ariaLabel || label || 'Slider'}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={formatted}
    data-dock-slider
    on:pointerdown={handlePointerDown}
    on:pointermove={handlePointerMove}
    on:pointerup={endDrag}
    on:pointercancel={endDrag}
    on:keydown={handleKeydown}
  >
    <div
      class="absolute inset-x-0 top-1/2 h-[18px] -translate-y-1/2 overflow-hidden rounded-full border border-vlc-border bg-[#0A0A0A]"
      aria-hidden="true"
    >
      <div
        class="absolute inset-y-0 left-0 rounded-full bg-vlc-orangeDeep"
        style={`width: ${percent}%`}
      ></div>

      {#each Array(8) as _, index}
        <span
          class="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-[#2A2A2A]"
          style={`left: ${((index + 1) / 9) * 100}%`}
        ></span>
      {/each}
    </div>

    <span
      class="absolute top-1/2 h-7 w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-vlc-orange"
      style={`left: ${percent}%`}
      aria-hidden="true"
    ></span>
  </div>

  {#if showCaptions}
    <div class="flex items-center justify-between gap-2 text-[11px] leading-4 text-vlc-muted">
      <span class="min-w-0 truncate">{leftCaption}</span>
      {#if centerCaption}
        <span class="shrink-0">{centerCaption}</span>
      {/if}
      <span class="min-w-0 truncate text-right">{rightCaption}</span>
    </div>
  {/if}
</div>
