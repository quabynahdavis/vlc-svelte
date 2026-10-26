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
    class="h-9 w-full appearance-none rounded-[8px] border border-[#262626] bg-[#1A1A1A] pl-3 pr-9 text-[13px] text-[#EAEAEA] outline-none transition-colors hover:border-[#343434] focus:border-[#D37918]/70"
  >
    {#each options as option}
      <option class="bg-[#1A1A1A] text-[#EAEAEA]" value={optionValue(option)}>
        {optionLabel(option)}
      </option>
    {/each}
  </select>
  <ChevronDown
    size={14}
    strokeWidth={1.8}
    class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8F8F8F]"
    aria-hidden="true"
  />
</div>
