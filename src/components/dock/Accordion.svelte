<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';

  export let title = 'Collapse Settings';
  export let open = true;
</script>

<section
  class="overflow-hidden rounded-[12px] border border-vlc-border bg-vlc-card"
  data-accordion
>
  <button
    type="button"
    class="flex h-[52px] w-full items-center justify-between gap-3 px-5 text-left text-vlc-dim transition-colors hover:text-vlc-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vlc-orange/40"
    aria-expanded={open}
    data-accordion-header
    on:click={() => (open = !open)}
  >
    <span class="min-w-0 truncate text-[15px] leading-5">{title}</span>
    <span
      class="flex shrink-0 items-center justify-center text-vlc-dim transition-transform duration-150"
      class:-rotate-90={!open}
      aria-hidden="true"
    >
      <ChevronDown size={18} strokeWidth={1.8} />
    </span>
  </button>

  <div
    class:hidden={!open}
    class="space-y-5 p-5"
    data-accordion-body
  >
    <slot />
  </div>
</section>
