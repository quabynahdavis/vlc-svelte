<script lang="ts">
  import { tick } from 'svelte';
  import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    ArrowUpDown,
    Check,
    ChevronRight,
    MoreHorizontal,
    Search,
  } from 'lucide-svelte';
  import type { LibrarySortKey, SortDirection } from '../stores/library';
  import { libraryViewMode } from '../stores/viewModes';
  import ViewModeToggle from './ViewModeToggle.svelte';

  export let breadcrumb: string[] = [];
  export let itemCount = 0;
  export let searchValue = '';
  export let sortKey: LibrarySortKey = 'episode';
  export let sortDirection: SortDirection = 'asc';
  export let onBack: () => void = () => {};
  export let onSearch: (value: string) => void = () => {};
  export let onSortKeyChange: (key: LibrarySortKey) => void = () => {};
  export let onToggleSortDirection: () => void = () => {};

  const sortOptions: { key: LibrarySortKey; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'duration', label: 'Duration' },
    { key: 'progress', label: 'Progress' },
    { key: 'episode', label: 'Episode' },
  ];

  let sortOpen = false;
  let sortRoot: HTMLDivElement;
  let sortMenu: HTMLDivElement;

  $: activeSortLabel = sortOptions.find((option) => option.key === sortKey)?.label ?? 'Title';
  $: directionLabel = sortDirection === 'asc' ? 'Ascending' : 'Descending';

  function handleSearchInput(event: Event) {
    onSearch((event.currentTarget as HTMLInputElement).value);
  }

  async function toggleSortMenu() {
    sortOpen = !sortOpen;
    if (!sortOpen) return;

    await tick();
    sortMenu?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }

  function closeSortMenu(refocus = false) {
    sortOpen = false;
    if (!refocus) return;

    requestAnimationFrame(() => {
      sortRoot?.querySelector<HTMLElement>('[data-sort-trigger]')?.focus();
    });
  }

  function selectSortKey(key: LibrarySortKey) {
    onSortKeyChange(key);
    closeSortMenu(true);
  }

  function toggleSortDirection() {
    onToggleSortDirection();
    closeSortMenu(true);
  }

  function handleWindowPointer(event: MouseEvent) {
    if (!sortOpen) return;
    const target = event.target;
    if (target instanceof Node && sortRoot?.contains(target)) return;
    sortOpen = false;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!sortOpen || event.key !== 'Escape') return;
    event.preventDefault();
    closeSortMenu(true);
  }

  function handleSortMenuKeydown(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const items = Array.from(sortMenu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = 0;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === 'End') nextIndex = items.length - 1;

    items[nextIndex]?.focus();
  }

  function handleSortFocusOut(event: FocusEvent) {
    if (!sortOpen) return;
    const next = event.relatedTarget;
    if (next instanceof Node && sortRoot?.contains(next)) return;
    sortOpen = false;
  }
</script>

<svelte:window on:click={handleWindowPointer} on:keydown={handleWindowKeydown} />

<header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
  <button
    type="button"
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
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
        class:text-vlc-text={index === breadcrumb.length - 1}
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

    <div class="relative" bind:this={sortRoot} on:focusout={handleSortFocusOut}>
      <button
        type="button"
        data-sort-trigger
        class="flex h-8 items-center gap-1.5 rounded-control px-2 text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
        title={`Sort: ${activeSortLabel} (${directionLabel.toLowerCase()})`}
        aria-label={`Sort items, currently ${activeSortLabel}, ${directionLabel.toLowerCase()}`}
        aria-haspopup="menu"
        aria-expanded={sortOpen}
        aria-controls={sortOpen ? 'library-sort-menu' : undefined}
        on:click={toggleSortMenu}
      >
        <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden="true" />
        <span class="whitespace-nowrap text-xs">{activeSortLabel}</span>
        {#if sortDirection === 'asc'}
          <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
        {:else}
          <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
        {/if}
      </button>

      {#if sortOpen}
        <div
          id="library-sort-menu"
          bind:this={sortMenu}
          role="menu"
          tabindex="-1"
          aria-label="Sort library by"
          class="absolute right-0 top-full z-30 mt-1 w-44 rounded-control border border-vlc-borderStrong bg-vlc-panel p-1 shadow-2xl"
          on:keydown={handleSortMenuKeydown}
        >
          <p class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-vlc-muted">
            Sort by
          </p>

          {#each sortOptions as option (option.key)}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sortKey === option.key}
              tabindex="-1"
              class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50 {sortKey === option.key
                ? 'bg-vlc-raised text-vlc-text'
                : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'}"
              on:click={() => selectSortKey(option.key)}
            >
              <Check
                size={13}
                strokeWidth={2}
                class={sortKey === option.key ? 'text-vlc-orangeText' : 'text-transparent'}
                aria-hidden="true"
              />
              <span class="flex-1">{option.label}</span>
            </button>
          {/each}

          <div class="my-1 h-px bg-vlc-border" role="separator"></div>

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={sortDirection === 'desc'}
            tabindex="-1"
            class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
            title="Toggle sort direction"
            on:click={toggleSortDirection}
          >
            <Check
              size={13}
              strokeWidth={2}
              class={sortDirection === 'desc' ? 'text-vlc-orangeText' : 'text-transparent'}
              aria-hidden="true"
            />
            <span class="flex-1">Descending</span>
            {#if sortDirection === 'desc'}
              <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
            {:else}
              <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
            {/if}
          </button>
        </div>
      {/if}
    </div>

    <ViewModeToggle
      value={$libraryViewMode}
      onChange={(mode) => libraryViewMode.set(mode)}
      label="Library view mode"
    />

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
        class="h-8 w-full rounded-input border border-vlc-border bg-vlc-card pl-8 pr-3 text-xs text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/40 focus:ring-1 focus:ring-vlc-orange/40"
      />
    </label>

    <span class="mx-2 h-5 w-px bg-vlc-border" aria-hidden="true"></span>

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
      title="More"
      aria-label="More options"
    >
      <MoreHorizontal size={18} strokeWidth={1.75} />
    </button>
  </div>
</header>
