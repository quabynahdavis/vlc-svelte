<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value = false;
  export let ariaLabel = 'Toggle';

  const dispatch = createEventDispatcher<{ change: boolean }>();

  function toggle(): void {
    value = !value;
    dispatch('change', value);
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={value}
  aria-label={ariaLabel}
  class="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
  class:bg-vlc-orange={value}
  class:bg-vlc-borderStrong={!value}
  data-toggle-pill
  on:click={toggle}
>
  <span
    class="absolute top-1/2 h-[18px] w-[16px] -translate-y-1/2 rounded-[5px] transition-all duration-150"
    class:left-[3px]={!value}
    class:left-[25px]={value}
    class:bg-vlc-muted={!value}
    class:bg-vlc-orangeDeep={value}
    aria-hidden="true"
  ></span>

  <span
    class="absolute inset-0 flex items-center text-[11px] font-medium leading-none"
    class:justify-end={!value}
    class:justify-start={value}
    class:pr-[5px]={!value}
    class:pl-[5px]={value}
    class:text-vlc-secondary={!value}
    class:text-vlc-orangeDeep={value}
    aria-hidden="true"
  >
    {value ? 'ON' : 'OFF'}
  </span>
</button>
