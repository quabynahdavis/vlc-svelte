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
    <ChevronDown
      size={18}
      strokeWidth={1.8}
      class={`shrink-0 text-vlc-dim transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
      aria-hidden="true"
    />
  </button>

  <div
    class:hidden={!open}
    class="space-y-5 p-5"
    data-accordion-body
  >
    <slot />
  </div>
</section>
