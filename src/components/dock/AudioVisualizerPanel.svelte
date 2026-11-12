<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getAudioAnalyser, isAudioAnalyserUsable } from '../../lib/audioAnalyser';
  import { t } from '../../lib/t';

  const BAR_COUNT = 40;
  const BAR_GAP = 3;
  const MIN_BAR_HEIGHT = 2;

  /** Visualizer modes: FFT bars or an oscilloscope-style waveform line. */
  type VisualizerMode = 'bars' | 'waveform';

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  let frameId = 0;
  let resizeObserver: ResizeObserver | null = null;
  let accent = '';
  let elapsed = 0;
  let lastTimestamp = 0;
  let mode: VisualizerMode = 'bars';

  /** Reused FFT buffers (allocated once the analyser is known). */
  let freqData: Uint8Array<ArrayBuffer> | null = null;
  let timeData: Uint8Array<ArrayBuffer> | null = null;

  $: modeLabel = mode === 'bars' ? t('dock.visualizer_bars') : t('dock.visualizer_waveform');

  function setMode(next: VisualizerMode): void {
    mode = next;
  }

  /**
   * The accent is resolved from CSS: an optional `--vlc-accent` custom property
   * wins, otherwise the canvas' `text-vlc-orange` colour is used.
   */
  function readAccent(): string {
    if (!canvas) return accent;

    const styles = getComputedStyle(canvas);
    return styles.getPropertyValue('--vlc-accent').trim() || styles.color;
  }

  function resizeCanvas(): void {
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;
  }

  function handleWindowResize(): void {
    resizeCanvas();
    accent = readAccent();
  }

  /** Synthetic stand-in (unchanged sine math) for no-analyser states. */
  function syntheticWave(index: number, at: number): number {
    const phase = at * 3.2 + index * 0.35;
    return (
      Math.abs(Math.sin(phase)) * 0.6 + Math.abs(Math.sin(phase * 0.53 + index)) * 0.4
    );
  }

  /**
   * Downsample the FFT into `BAR_COUNT` bar heights in 0..1. Bins are grouped
   * linearly with max-pooling so transients stay visible per bar.
   */
  function barsFromFft(data: Uint8Array<ArrayBuffer>): number[] {
    const bins = data.length;
    const group = Math.max(1, Math.floor(bins / BAR_COUNT));
    const bars: number[] = [];

    for (let index = 0; index < BAR_COUNT; index += 1) {
      const start = index * group;
      let peak = 0;
      for (let offset = 0; offset < group && start + offset < bins; offset += 1) {
        peak = Math.max(peak, data[start + offset]);
      }
      bars.push(peak / 255);
    }
    return bars;
  }

  function draw(timestamp: number): void {
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    if (lastTimestamp === 0) lastTimestamp = timestamp;
    elapsed += Math.min((timestamp - lastTimestamp) / 1000, 0.1);
    lastTimestamp = timestamp;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#121212');
    background.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const analyser = getAudioAnalyser();
    // Real FFT while playback feeds usable data; synthetic sine bars before
    // playback starts, without an analyser, or after the mute guard proved
    // the analyser dead.
    const useReal = Boolean(analyser && isAudioAnalyserUsable());

    if (useReal && analyser) {
      if (freqData?.length !== analyser.frequencyBinCount) {
        freqData = new Uint8Array(analyser.frequencyBinCount);
      }
      if (timeData?.length !== analyser.fftSize) {
        timeData = new Uint8Array(analyser.fftSize);
      }

      if (mode === 'bars') {
        analyser.getByteFrequencyData(freqData);
        const bars = barsFromFft(freqData);

        const slot = width / BAR_COUNT;
        const barWidth = Math.max(1, slot - BAR_GAP);
        const center = height / 2;

        for (let index = 0; index < BAR_COUNT; index += 1) {
          const value = bars[index];
          const barHeight = Math.max(MIN_BAR_HEIGHT, value * height * 0.72);
          const x = index * slot + BAR_GAP / 2;

          ctx.globalAlpha = 0.35 + value * 0.65;
          ctx.fillStyle = accent;
          ctx.fillRect(x, center - barHeight / 2, barWidth, barHeight);
        }
        ctx.globalAlpha = 1;
      } else {
        analyser.getByteTimeDomainData(timeData);
        const data = timeData;

        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const samples = data.length;
        for (let index = 0; index < samples; index += 1) {
          const x = (index / (samples - 1)) * width;
          const centered = (data[index] - 128) / 128;
          const y = height / 2 + centered * height * 0.4;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (mode === 'bars') {
      // Synthetic fallback: the original sine animation, same styling.
      const slot = width / BAR_COUNT;
      const barWidth = Math.max(1, slot - BAR_GAP);
      const center = height / 2;

      ctx.fillStyle = accent;
      for (let index = 0; index < BAR_COUNT; index += 1) {
        const wave = syntheticWave(index, elapsed);
        const barHeight = Math.max(MIN_BAR_HEIGHT, wave * height * 0.72);
        const x = index * slot + BAR_GAP / 2;

        ctx.globalAlpha = 0.35 + wave * 0.65;
        ctx.fillRect(x, center - barHeight / 2, barWidth, barHeight);
      }
      ctx.globalAlpha = 1;
    } else {
      // No waveform data: a dim idle line.
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    frameId = requestAnimationFrame(draw);
  }

  onMount(() => {
    accent = readAccent();
    resizeCanvas();

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(container);
    window.addEventListener('resize', handleWindowResize);

    frameId = requestAnimationFrame(draw);
  });

  onDestroy(() => {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }

    resizeObserver?.disconnect();
    resizeObserver = null;
    window.removeEventListener('resize', handleWindowResize);
  });
</script>

<div class="mb-3 flex items-center justify-between gap-2">
  <p class="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-vlc-muted">
    {t('dock.audio_visualizer')}
  </p>

  <div class="flex shrink-0 items-center gap-0.5 rounded-control border border-vlc-border p-0.5">
    <button
      type="button"
      class="flex h-6 items-center justify-center rounded-[5px] px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      class:bg-vlc-card={mode === 'bars'}
      class:text-vlc-orangeText={mode === 'bars'}
      class:text-vlc-secondary={mode !== 'bars'}
      class:hover:text-vlc-text={mode !== 'bars'}
      title={t('dock.visualizer_bars')}
      aria-label={t('dock.visualizer_bars')}
      aria-pressed={mode === 'bars'}
      on:click={() => setMode('bars')}
    >
      {t('dock.visualizer_bars')}
    </button>
    <button
      type="button"
      class="flex h-6 items-center justify-center rounded-[5px] px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      class:bg-vlc-card={mode === 'waveform'}
      class:text-vlc-orangeText={mode === 'waveform'}
      class:text-vlc-secondary={mode !== 'waveform'}
      class:hover:text-vlc-text={mode !== 'waveform'}
      title={t('dock.visualizer_waveform')}
      aria-label={t('dock.visualizer_waveform')}
      aria-pressed={mode === 'waveform'}
      on:click={() => setMode('waveform')}
    >
      {t('dock.visualizer_waveform')}
    </button>
  </div>
</div>

<div
  class="visualizer relative h-64 w-full overflow-hidden rounded-[12px] border border-vlc-border bg-[#0A0A0A]"
  bind:this={container}
  data-audio-visualizer
  title={modeLabel}
>
  <canvas
    bind:this={canvas}
    class="block h-full w-full text-vlc-orange"
    aria-hidden="true"
  ></canvas>
</div>
