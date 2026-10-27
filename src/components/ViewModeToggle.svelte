<script lang="ts">
  import type { ComponentType } from 'svelte';
  import { LayoutGrid, List, Rows3 } from 'lucide-svelte';
  import {
    viewModeOptions,
    type ViewMode,
    type ViewModeIcon,
  } from '../stores/viewModes';

  export let value: ViewMode = 'grid';
  export let onChange: (mode: ViewMode) => void = () => {};
  export let options: ViewMode[] = ['grid', 'list', 'compact'];
  export let label = 'View mode';
  export let size: 'sm' | 'md' = 'md';

  const iconComponents: Record<ViewModeIcon, ComponentType> = {
    'layout-grid': LayoutGrid,
    list: List,
    'rows-3': Rows3,
  };

  // Keep the canonical option order and ignore duplicates or unknown values.
  $: visibleOptions = viewModeOptions.filter((option) => options.includes(option.value));
  $: containerSize = size === 'sm' ? 'h-7' : 'h-8';
  $: buttonSize = size === 'sm' ? 'h-6 w-7' : 'h-7 w-8';
  $: iconSize = size === 'sm' ? 14 : 16;

  function select(mode: ViewMode): void {
    if (mode === value) return;
    onChange(mode);
  }
</script>

<div
  class="inline-flex {containerSize} items-center gap-0.5 rounded-control border border-vlc-border bg-vlc-card p-px"
  role="group"
  aria-label={label}
>
  {#each visibleOptions as option (option.value)}
    {@const active = value === option.value}
    <button
      type="button"
      class="relative flex {buttonSize} items-center justify-center rounded-input transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-card"
      class:bg-vlc-raised={active}
      class:text-vlc-text={active}
      class:text-vlc-secondary={!active}
      title={option.title}
      aria-label={option.title}
      aria-pressed={active}
      on:click={() => select(option.value)}
    >
      <svelte:component
        this={iconComponents[option.icon]}
        size={iconSize}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </button>
  {/each}
</div>
