<script lang="ts">
  export let value = '#B8B8B8';
  export let ariaLabel = 'Color';

  $: preview = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : '#000000';
</script>

<div
  class="flex h-9 w-[190px] items-center gap-2 rounded-[8px] border border-vlc-border bg-vlc-card pl-3 pr-2 transition-colors focus-within:border-vlc-orange/70 hover:border-vlc-borderStrong"
>
  <input
    bind:value
    type="text"
    aria-label={`${ariaLabel} hex value`}
    autocomplete="off"
    spellcheck="false"
    class="min-w-0 flex-1 bg-transparent text-[13px] uppercase text-vlc-text outline-none placeholder:text-vlc-muted"
  />
  <span
    class="relative block h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[4px] border border-white/15"
    style={`background-color: ${preview};`}
  >
    <input
      bind:value
      type="color"
      aria-label={`${ariaLabel} picker`}
      class="absolute -inset-2 h-10 w-10 cursor-pointer opacity-0"
    />
  </span>
</div>
