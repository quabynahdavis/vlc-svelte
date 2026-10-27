<script lang="ts">
  export let value = false;
  export let label = 'Toggle setting';
  /** Optional accessible name; falls back to `label`. */
  export let ariaLabel = '';
</script>

<button
  type="button"
  role="switch"
  aria-checked={value}
  aria-label={ariaLabel || label}
  class="h-[22px] w-11 shrink-0 rounded-full text-[9px] font-semibold tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-app"
  class:bg-vlc-orange={value}
  class:text-vlc-app={value}
  class:bg-vlc-raised={!value}
  class:text-vlc-dim={!value}
  on:click={() => (value = !value)}
>
  {value ? 'ON' : 'OFF'}
</button>
