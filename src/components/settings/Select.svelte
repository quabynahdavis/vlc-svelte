<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';

  type Option = string | { value: string; label: string };

  export let value = '';
  export let options: Option[] = [];
  export let ariaLabel = '';

  function optionValue(option: Option): string {
    return typeof option === 'string' ? option : option.value;
  }

  function optionLabel(option: Option): string {
    return typeof option === 'string' ? option : option.label;
  }
</script>

<div class="relative w-full">
  <select
    bind:value
    aria-label={ariaLabel}
    class="h-9 w-full appearance-none rounded-[8px] border border-vlc-border bg-vlc-card pl-3 pr-9 text-[13px] text-vlc-text outline-none transition-colors hover:border-vlc-borderStrong focus:border-vlc-orange/70"
  >
    {#each options as option}
      <option class="bg-vlc-card text-vlc-text" value={optionValue(option)}>
        {optionLabel(option)}
      </option>
    {/each}
  </select>
  <ChevronDown
    size={14}
    strokeWidth={1.8}
    class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-vlc-dim"
    aria-hidden="true"
  />
</div>
