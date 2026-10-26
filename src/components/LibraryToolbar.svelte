<script lang="ts">
  import {
    ArrowLeft,
    ArrowUpDown,
    ChevronRight,
    LayoutGrid,
    MoreHorizontal,
    Search,
  } from 'lucide-svelte';

  export let breadcrumb: string[] = [];
  export let itemCount = 0;
  export let searchValue = '';
  export let onBack: () => void = () => {};
  export let onSearch: (value: string) => void = () => {};

  function handleSearchInput(event: Event) {
    onSearch((event.currentTarget as HTMLInputElement).value);
  }
</script>

<header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
  <button
    type="button"
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
    title="Back"
    aria-label="Go back"
    on:click={onBack}
  >
    <ArrowLeft size={18} strokeWidth={1.75} />
  </button>

  <nav
    class="flex min-w-0 items-center gap-2 text-[13px] leading-none"
    aria-label="Breadcrumb"
  >
    {#each breadcrumb as crumb, index}
      {#if index > 0}
        <ChevronRight
          size={14}
          strokeWidth={1.75}
          class="shrink-0 text-vlc-muted"
          aria-hidden="true"
        />
      {/if}
      <span
        class="min-w-0 truncate whitespace-nowrap"
        class:text-white={index === breadcrumb.length - 1}
        class:text-vlc-secondary={index !== breadcrumb.length - 1}
      >
        {crumb}
      </span>
    {/each}
  </nav>

  <div class="ml-auto flex shrink-0 items-center gap-1">
    <span class="mr-2 whitespace-nowrap text-xs text-vlc-muted" aria-live="polite">
      {itemCount} {itemCount === 1 ? 'item' : 'items'}
    </span>

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
      title="Sort"
      aria-label="Sort items"
    >
      <ArrowUpDown size={16} strokeWidth={1.75} />
    </button>

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
      title="Grid view"
      aria-label="Grid view"
    >
      <LayoutGrid size={16} strokeWidth={1.75} />
    </button>

    <label class="relative ml-2 block w-60">
      <Search
        size={14}
        strokeWidth={1.75}
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-vlc-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        placeholder="Search"
        aria-label="Search library"
        value={searchValue}
        on:input={handleSearchInput}
        class="h-8 w-full rounded-input border border-vlc-border bg-vlc-card pl-8 pr-3 text-xs text-white outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/40 focus:ring-1 focus:ring-vlc-orange/40"
      />
    </label>

    <span class="mx-2 h-5 w-px bg-vlc-border" aria-hidden="true"></span>

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
      title="More"
      aria-label="More options"
    >
      <MoreHorizontal size={18} strokeWidth={1.75} />
    </button>
  </div>
</header>
