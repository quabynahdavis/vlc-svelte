<script lang="ts">
  export let value = '';
  export let placeholder = '';
  export let ariaLabel = '';
  export let readonly = false;
  export let mono = false;
  export let type = 'text';
</script>

{#if type === 'password'}
  <input
    type="password"
    bind:value
    {placeholder}
    {readonly}
    aria-label={ariaLabel}
    autocomplete="off"
    spellcheck="false"
    class="h-9 w-full rounded-[8px] border border-vlc-border bg-vlc-card px-3 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted hover:border-vlc-borderStrong focus:border-vlc-orange/70 read-only:cursor-default"
    class:tabular-nums={mono}
  />
{:else}
  <input
    type="text"
    bind:value
    {placeholder}
    {readonly}
    aria-label={ariaLabel}
    autocomplete="off"
    spellcheck="false"
    class="h-9 w-full rounded-[8px] border border-vlc-border bg-vlc-card px-3 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted hover:border-vlc-borderStrong focus:border-vlc-orange/70 read-only:cursor-default"
    class:tabular-nums={mono}
  />
{/if}
