<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value = 0;
  export let min = 0;
  export let max = 100;
  export let step = 1;
  export let ariaLabel = 'Slider';
  export let leftCaption = '';
  export let centerCaption = '';
  export let rightCaption = '';

  const dispatch = createEventDispatcher<{ change: number }>();

  $: range = max - min;
  $: percent = range === 0 ? 0 : Math.min(100, Math.max(0, ((value - min) / range) * 100));

  function handleInput(event: Event): void {
    const next = Number((event.currentTarget as HTMLInputElement).value);
    dispatch('change', next);
  }
</script>

<div class="w-full">
  <input
    type="range"
    bind:value
    {min}
    {max}
    {step}
    aria-label={ariaLabel}
    style={`--slider-pct: ${percent}%`}
    class="vl-range w-full"
    on:input={handleInput}
  />
  {#if leftCaption || centerCaption || rightCaption}
    <div
      class="mt-2 flex items-center justify-between text-[11px] leading-4 text-[#6B6B6B]"
      aria-hidden="true"
    >
      <span>{leftCaption}</span>
      <span>{centerCaption}</span>
      <span>{rightCaption}</span>
    </div>
  {/if}
</div>

<style>
  .vl-range {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 16px;
    background: transparent;
    cursor: pointer;
  }

  .vl-range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 9999px;
    background: linear-gradient(
      to right,
      #d37918 0%,
      #d37918 var(--slider-pct),
      #262626 var(--slider-pct),
      #262626 100%
    );
  }

  .vl-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    margin-top: -3px;
    border: 0;
    border-radius: 9999px;
    background: #d37918;
    transition: transform 120ms ease;
  }

  .vl-range:hover::-webkit-slider-thumb {
    transform: scale(1.15);
  }

  .vl-range:focus-visible {
    outline: none;
  }

  .vl-range:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px rgba(211, 121, 24, 0.3);
  }

  .vl-range::-moz-range-track {
    height: 4px;
    border-radius: 9999px;
    background: #262626;
  }

  .vl-range::-moz-range-progress {
    height: 4px;
    border-radius: 9999px;
    background: #d37918;
  }

  .vl-range::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border: 0;
    border-radius: 9999px;
    background: #d37918;
  }
</style>
