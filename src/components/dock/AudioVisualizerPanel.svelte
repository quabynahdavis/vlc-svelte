<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  const BAR_COUNT = 40;
  const BAR_GAP = 3;
  const MIN_BAR_HEIGHT = 2;

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  let frameId = 0;
  let resizeObserver: ResizeObserver | null = null;
  let accent = '';
  let elapsed = 0;
  let lastTimestamp = 0;

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

    const slot = width / BAR_COUNT;
    const barWidth = Math.max(1, slot - BAR_GAP);
    const center = height / 2;

    ctx.fillStyle = accent;
    for (let index = 0; index < BAR_COUNT; index += 1) {
      const phase = elapsed * 3.2 + index * 0.35;
      const wave =
        Math.abs(Math.sin(phase)) * 0.6 + Math.abs(Math.sin(phase * 0.53 + index)) * 0.4;
      const barHeight = Math.max(MIN_BAR_HEIGHT, wave * height * 0.72);
      const x = index * slot + BAR_GAP / 2;

      ctx.globalAlpha = 0.35 + wave * 0.65;
      ctx.fillRect(x, center - barHeight / 2, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;

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

<div
  class="visualizer relative h-64 w-full overflow-hidden rounded-[12px] border border-vlc-border bg-[#0A0A0A]"
  bind:this={container}
  data-audio-visualizer
>
  <canvas
    bind:this={canvas}
    class="block h-full w-full text-vlc-orange"
    aria-hidden="true"
  ></canvas>
</div>
