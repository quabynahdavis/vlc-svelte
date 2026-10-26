<script lang="ts">
  export let value = false;
  export let label = 'Toggle setting';
</script>

<button
  type="button"
  role="switch"
  aria-checked={value}
  aria-label={label}
  class="h-[22px] w-11 shrink-0 rounded-full text-[9px] font-semibold tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D37918]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E0E]"
  class:bg-[#D37918]={value}
  class:text-[#0E0E0E]={value}
  class:bg-[#2A2A2A]={!value}
  class:text-[#8F8F8F]={!value}
  on:click={() => (value = !value)}
>
  {value ? 'ON' : 'OFF'}
</button>
