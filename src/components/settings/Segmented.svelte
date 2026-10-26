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
  class="grid overflow-hidden rounded-[8px] border border-vlc-border bg-vlc-card"
  style={`grid-template-columns: repeat(${Math.max(options.length, 1)}, minmax(0, 1fr));`}
  role="group"
>
  {#each options as option (optionValue(option))}
    {@const optionVal = optionValue(option)}
    <button
      type="button"
      class="h-9 border-r border-vlc-border text-[13px] transition-colors last:border-r-0"
      class:bg-vlc-orange={value === optionVal}
      class:text-vlc-app={value === optionVal}
      class:text-vlc-dim={value !== optionVal}
      class:hover:bg-vlc-raised={value !== optionVal}
      class:hover:text-vlc-text={value !== optionVal}
      aria-pressed={value === optionVal}
      on:click={() => (value = optionVal)}
    >
      {optionLabel(option)}
    </button>
  {/each}
</div>
