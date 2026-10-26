<script lang="ts">
  type Option = string | { value: string; label: string };

  export let value = '';
  export let options: Option[] = [];

  function optionValue(option: Option): string {
    return typeof option === 'string' ? option : option.value;
  }

  function optionLabel(option: Option): string {
    return typeof option === 'string' ? option : option.label;
  }
</script>

<div
  class="grid overflow-hidden rounded-[8px] border border-[#262626] bg-[#1A1A1A]"
  style={`grid-template-columns: repeat(${Math.max(options.length, 1)}, minmax(0, 1fr));`}
  role="group"
>
  {#each options as option (optionValue(option))}
    {@const optionVal = optionValue(option)}
    <button
      type="button"
      class="h-9 border-r border-[#262626] text-[13px] transition-colors last:border-r-0"
      class:bg-[#D37918]={value === optionVal}
      class:text-[#0E0E0E]={value === optionVal}
      class:text-[#8F8F8F]={value !== optionVal}
      class:hover:bg-[#212121]={value !== optionVal}
      class:hover:text-[#EAEAEA]={value !== optionVal}
      aria-pressed={value === optionVal}
      on:click={() => (value = optionVal)}
    >
      {optionLabel(option)}
    </button>
  {/each}
</div>
