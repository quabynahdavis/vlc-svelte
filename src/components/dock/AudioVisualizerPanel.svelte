<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { X } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  let canvas: HTMLCanvasElement;
  let req: number;
  let position = 0;

  function draw(): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    // Clear
    ctx.fillStyle = 'linear-gradient(45deg, #0a0a0a, #1a1a1a)';
    // approximate gradient fill by drawing rect with gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0a0a0a');
    grad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    // Moving bar pattern
    ctx.fillStyle = '#ff0000';
    const barWidth = 20;
    const barHeight = height / 2;
    const x = (position % (width + barWidth)) - barWidth;
    ctx.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
    position += 3;
    req = requestAnimationFrame(draw);
  }

  onMount(() => {
    req = requestAnimationFrame(draw);
  });

  onDestroy(() => {
    cancelAnimationFrame(req);
  });

  function close() {
    dispatch('onClose');
  }
</script>

<div class="border-b border-vlc-border px-4 py-2 flex h-[52px] items-center justify-between gap-3">
  <h2 class="text-[14px] font-medium leading-5 text-vlc-text">Audio Visualizer</h2>
  <button type="button" class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50" title="Close panel" aria-label="Close panel" on:click={close}>
    <X size={18} strokeWidth={1.7} />
  </button>
</div>
<canvas bind:this={canvas} class="w-full h-64" />
