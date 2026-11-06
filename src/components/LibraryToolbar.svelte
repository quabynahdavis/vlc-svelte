<script lang="ts">
  import { tick } from 'svelte';
  import { ArrowLeft, ChevronRight, Search } from 'lucide-svelte';
  import type { LibrarySortKey, LibraryWatchFilter, SortDirection } from '../stores/library';
  import { libraryViewMode } from '../stores/viewModes';
  import LibraryAddMenu from './LibraryAddMenu.svelte';
  import SortMenu from './SortMenu.svelte';
  import ViewModeToggle from './ViewModeToggle.svelte';

  export let breadcrumb: string[] = [];
  export let itemCount = 0;
  export let searchValue = '';
  export let sortKey: LibrarySortKey = 'episode';
  export let sortDirection: SortDirection = 'asc';
  export let watchFilter: LibraryWatchFilter = 'all';
  export let onBack: () => void = () => {};
  export let onSearch: (value: string) => void = () => {};
  export let onSortKeyChange: (key: LibrarySortKey) => void = () => {};
  export let onToggleSortDirection: () => void = () => {};
  export let onWatchFilterChange: (filter: LibraryWatchFilter) => void = () => {};
  export let onBreadcrumbSelect: (index: number) => void = () => {};

  const sortOptions: { key: LibrarySortKey; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'duration', label: 'Duration' },
    { key: 'progress', label: 'Progress' },
    { key: 'episode', label: 'Episode' },
    { key: 'watched', label: 'Watched' },
  ];

  const watchFilterOptions: { value: LibraryWatchFilter; label: string; ariaLabel: string }[] = [
    { value: 'all', label: 'All', ariaLabel: 'Show all items' },
    { value: 'unwatched', label: 'Unwatched', ariaLabel: 'Show unwatched items' },
    { value: 'watched', label: 'Watched', ariaLabel: 'Show watched items' },
  ];

  let watchFilterGroup: HTMLDivElement;

  function handleSortValueChange(key: string) {
    onSortKeyChange(key as LibrarySortKey);
  }

  function handleSearchInput(event: Event) {
    onSearch((event.currentTarget as HTMLInputElement).value);
  }

  function selectWatchFilter(value: LibraryWatchFilter) {
    if (value === watchFilter) return;
    onWatchFilterChange(value);
  }

  async function handleWatchFilterKeydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const count = watchFilterOptions.length;
    const current = Math.max(
      0,
      watchFilterOptions.findIndex((option) => option.value === watchFilter),
    );
    let next = current;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + count) % count;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % count;
    else if (event.key === 'End') next = count - 1;

    onWatchFilterChange(watchFilterOptions[next].value);

    await tick();
    watchFilterGroup?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }
</script>

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
      <button
        type="button"
        class="min-w-0 truncate whitespace-nowrap rounded-[4px] px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
        class:text-vlc-text={index === breadcrumb.length - 1}
        class:text-vlc-secondary={index !== breadcrumb.length - 1}
        class:hover:text-vlc-text={index !== breadcrumb.length - 1}
        aria-current={index === breadcrumb.length - 1 ? 'page' : undefined}
        title={index === breadcrumb.length - 1 ? crumb : `Go to ${crumb}`}
        on:click={() => onBreadcrumbSelect(index)}
      >
        {crumb}
      </button>
    {/each}
  </nav>

  <div class="ml-auto flex shrink-0 items-center gap-1">
    <span class="mr-2 whitespace-nowrap text-xs text-vlc-muted" aria-live="polite">
      {itemCount} {itemCount === 1 ? 'item' : 'items'}
    </span>

    <div
      bind:this={watchFilterGroup}
      class="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-control border border-vlc-border bg-vlc-card p-0.5"
      role="radiogroup"
      tabindex="-1"
      aria-label="Filter by watched status"
      on:keydown={handleWatchFilterKeydown}
    >
      {#each watchFilterOptions as option (option.value)}
        {@const active = watchFilter === option.value}
        <button
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={option.ariaLabel}
          tabindex={active ? 0 : -1}
          class="h-6 whitespace-nowrap rounded-input px-1.5 text-[11px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50 {active
            ? 'bg-vlc-raised text-vlc-text'
            : 'text-vlc-secondary hover:text-vlc-text'}"
          title={option.ariaLabel}
          on:click={() => selectWatchFilter(option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>

    <SortMenu
      options={sortOptions}
      value={sortKey}
      onValueChange={handleSortValueChange}
      direction={sortDirection}
      onToggleDirection={onToggleSortDirection}
      label="Sort items"
    />

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

    <LibraryAddMenu />
  </div>
</header>
