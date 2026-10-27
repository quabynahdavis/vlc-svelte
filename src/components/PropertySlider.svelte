<script lang="ts">
  export let label = '';
  export let value = 0;
  export let min = 0;
  export let max = 100;
  export let step = 1;
  export let unit = '';
  export let decimals = 1;
  export let format: ((value: number) => string) | null = null;

  function clamp(value: number, minValue: number, maxValue: number): number {
    return Math.min(maxValue, Math.max(minValue, value));
  }

  $: percent = max > min ? clamp(((value - min) / (max - min)) * 100, 0, 100) : 0;
  $: display = format ? format(value) : `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
  $: background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--bg-app) ${percent}%, var(--bg-app) 100%)`;
</script>

<div class="w-full">
  <div class="flex items-baseline justify-between gap-3">
    <span class="min-w-0 truncate text-[14px] leading-5 text-vlc-dim">{label}</span>
    <span class="shrink-0 text-[13px] leading-5 tabular-nums text-vlc-dim">{display}</span>
  </div>

  <input
    type="range"
    class="slider mt-3 w-full cursor-pointer"
    class:slider-filled={percent > 0}
    style={`background: ${background};`}
    bind:value
    {min}
    {max}
    {step}
    aria-label={label}
    aria-valuetext={display}
  />
</div>

<style>
  .slider {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 9999px;
    outline: none;
    border: 0;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border: 0;
    border-radius: 9999px;
    background: var(--accent);
    cursor: pointer;
    transition: transform 120ms ease;
  }

  .slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border: 0;
    border-radius: 9999px;
    background: var(--accent);
    cursor: pointer;
    transition: transform 120ms ease;
  }

  .slider::-moz-range-track {
    background: transparent;
  }

  .slider:hover::-webkit-slider-thumb,
  .slider:focus-visible::-webkit-slider-thumb {
    transform: scale(1.15);
  }

  .slider:hover::-moz-range-thumb,
  .slider:focus-visible::-moz-range-thumb {
    transform: scale(1.15);
  }

  .slider:focus-visible {
    box-shadow: 0 0 0 2px rgb(var(--accent-rgb) / 0.35);
  }
</style>
