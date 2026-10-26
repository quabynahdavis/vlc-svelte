<script lang="ts">
  import { EQ_BANDS, setEqualizerGain, settings } from '../../stores/settings';

  const EXPONENT = 1.5;

  let draggingIndex: number | null = null;
  let draggingPointer: number | null = null;

  $: gains = EQ_BANDS.map((_, index) => $settings.eqGains[index] ?? 0);

  function clamp(input: number, lower: number, upper: number): number {
    return Math.min(upper, Math.max(lower, input));
  }

  /** Non-linear fader curve keeps 0 dB at the midpoint and +12 dB near 72%. */
  function positionForGain(gain: number, bandIndex: number): number {
    const band = EQ_BANDS[bandIndex];
    const span = Math.max(band.max - band.min, 1);
    const normalized = clamp((gain - band.min) / span, 0, 1) * 2 - 1;
    return 50 + 50 * Math.sign(normalized) * Math.pow(Math.abs(normalized), EXPONENT);
  }

  function gainForPosition(ratio: number, bandIndex: number): number {
    const band = EQ_BANDS[bandIndex];
    const span = band.max - band.min;
    const normalized = clamp(ratio, 0, 1) * 2 - 1;
    const gain =
      band.min +
      span * (0.5 + 0.5 * Math.sign(normalized) * Math.pow(Math.abs(normalized), 1 / EXPONENT));
    return Math.round(clamp(gain, band.min, band.max));
  }

  function applyPointer(event: PointerEvent, index: number): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.height <= 0) return;

    const ratio = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    const next = gainForPosition(ratio, index);
    if (next !== gains[index]) setEqualizerGain(index, next);
  }

  function handlePointerDown(event: PointerEvent, index: number): void {
    if (event.button !== 0) return;

    event.preventDefault();
    draggingIndex = index;
    draggingPointer = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    applyPointer(event, index);
  }

  function handlePointerMove(event: PointerEvent, index: number): void {
    if (draggingIndex !== index || draggingPointer !== event.pointerId) return;
    applyPointer(event, index);
  }

  function endDrag(event: PointerEvent): void {
    if (draggingPointer !== event.pointerId) return;

    draggingIndex = null;
    draggingPointer = null;

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeydown(event: KeyboardEvent, index: number): void {
    const band = EQ_BANDS[index];
    const current = gains[index];
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = current + 1;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = current - 1;
        break;
      case 'Home':
        next = band.min;
        break;
      case 'End':
        next = band.max;
        break;
      default:
        return;
    }

    event.preventDefault();
    setEqualizerGain(index, clamp(next, band.min, band.max));
  }
</script>

<section
  class="rounded-[12px] border border-vlc-border bg-vlc-card p-4"
  aria-label="Equalizer"
  data-eq-panel
>
  <header class="flex items-center justify-between gap-3">
    <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Equalizer</h3>
    <span class="text-[11px] leading-4 text-vlc-muted">11 bands</span>
  </header>

  <div class="-mx-1 mt-4 overflow-x-auto pb-2">
    <div class="mx-1 flex min-w-[524px] items-start justify-between gap-1">
      {#each EQ_BANDS as band, index (band.id)}
        {@const gain = gains[index]}
        {@const position = positionForGain(gain, index)}
        <div class="flex w-11 shrink-0 flex-col items-center">
          <div
            class="relative h-[240px] w-8 cursor-pointer touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
            role="slider"
            tabindex="0"
            aria-label={`${band.label} gain`}
            aria-valuemin={band.min}
            aria-valuemax={band.max}
            aria-valuenow={gain}
            aria-valuetext={`${gain.toFixed(1)} dB`}
            data-eq-band={band.id}
            on:pointerdown={(event) => handlePointerDown(event, index)}
            on:pointermove={(event) => handlePointerMove(event, index)}
            on:pointerup={endDrag}
            on:pointercancel={endDrag}
            on:keydown={(event) => handleKeydown(event, index)}
          >
            <div
              class="absolute left-1/2 top-0 h-full w-[6px] -translate-x-1/2 rounded-full bg-[#0A0A0A]"
              aria-hidden="true"
            ></div>
            <div
              class="absolute bottom-0 left-1/2 w-[6px] -translate-x-1/2 rounded-full bg-vlc-orangeDark"
              style={`height: ${position}%`}
              aria-hidden="true"
            ></div>
            <div
              class="absolute left-1/2 h-[10px] w-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-vlc-orange"
              style={`bottom: ${position}%`}
              aria-hidden="true"
            ></div>
          </div>

          <span class="mt-3 whitespace-nowrap text-[11px] leading-4 text-vlc-muted">
            {band.label}
          </span>
          <div
            class="mt-2 flex h-[26px] w-11 items-center justify-center rounded-[6px] bg-[#0A0A0A] text-[11px] tabular-nums text-vlc-secondary"
          >
            {gain.toFixed(1)} dB
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>
