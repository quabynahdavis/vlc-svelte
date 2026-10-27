<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let color = '#D37918';
  export let label = 'Accent color';
  export let selected = false;

  const dispatch = createEventDispatcher<{ select: string }>();

  function selectColor(): void {
    dispatch('select', color);
  }
</script>

<button
  type="button"
  class="flex h-9 w-[42px] items-center justify-center rounded-[7px] transition-colors hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
  aria-label={label}
  aria-pressed={selected}
  title={label}
  on:click={selectColor}
>
  <span
    class="block h-[18px] w-[18px] rounded-[3px]"
    style={`background-color: ${color}; ${
      selected
        ? 'box-shadow: 0 0 0 2px var(--bg-app), 0 0 0 4px var(--accent);'
        : 'box-shadow: inset 0 0 0 1px var(--border);'
    }`}
  ></span>
</button>
