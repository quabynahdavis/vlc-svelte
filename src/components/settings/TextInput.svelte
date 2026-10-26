<script lang="ts">
  export let value = '';
  export let placeholder = '';
  export let ariaLabel = '';
  export let readonly = false;
  export let mono = false;
</script>

<input
  bind:value
  type="text"
  {placeholder}
  {readonly}
  aria-label={ariaLabel}
  autocomplete="off"
  spellcheck="false"
  class="h-9 w-full rounded-[8px] border border-[#262626] bg-[#1A1A1A] px-3 text-[13px] text-[#EAEAEA] outline-none transition-colors placeholder:text-[#6B6B6B] hover:border-[#343434] focus:border-[#D37918]/70 read-only:cursor-default"
  class:tabular-nums={mono}
/>
