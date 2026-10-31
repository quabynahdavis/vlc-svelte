<script lang="ts">
  import InfoTip from './InfoTip.svelte';

  export let label = '';
  export let info = false;
  export let hint = '';
</script>

<div class="flex min-h-[44px] items-center justify-between gap-6">
  <div class="flex min-w-0 items-center gap-2">
    <span class="truncate text-[14px] leading-5 text-vlc-secondary">
      <slot name="label">{label}</slot>
    </span>
    {#if info && hint}
      <InfoTip text={hint} label={`About ${label || 'this setting'}`} />
    {/if}
  </div>
  <div class="flex shrink-0 items-center justify-end gap-3">
    <slot />
  </div>
</div>
