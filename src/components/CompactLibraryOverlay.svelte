<script lang="ts">
  import { tick } from 'svelte';
  import { ArrowDown, ArrowUp, ChevronRight, Eye, EyeOff, Play, Search, X } from 'lucide-svelte';
  import LibraryAddMenu from './LibraryAddMenu.svelte';
  import { startTrackDrag } from '../lib/dragTrack';
  import type { MediaItem } from '../lib/mock';
  import {
    breadcrumb,
    filteredItems,
    isItemWatched,
    libraryItems,
    librarySortDirection,
    librarySortKey,
    libraryWatchFilter,
    searchQuery,
    sortedItems,
    type LibrarySortKey,
    type LibraryWatchFilter,
  } from '../stores/library';
  import { player, setQueue, type Track } from '../stores/player';

  export let open = false;
  export let fullscreen = false;
  export let onClose: () => void = () => {};
  export let returnFocusTo: HTMLElement | null = null;

  const sortOptions: { key: LibrarySortKey; label: string }[] = [
    { key: 'episode', label: 'Episode' },
    { key: 'title', label: 'Title' },
    { key: 'duration', label: 'Duration' },
    { key: 'progress', label: 'Progress' },
    { key: 'watched', label: 'Watched' },
  ];

  const watchFilters: { value: LibraryWatchFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'unwatched', label: 'Unwatched' },
    { value: 'watched', label: 'Watched' },
  ];

  let searchEl: HTMLInputElement | null = null;
  let panelEl: HTMLDivElement | null = null;

  $: activeQuery = $searchQuery.trim();
  $: watchFilterActive = $libraryWatchFilter !== 'all';
  $: sortLabel = sortOptions.find((option) => option.key === $librarySortKey)?.label ?? 'Episode';
  $: emptyFilterLabel = $libraryWatchFilter === 'watched' ? 'watched' : 'unwatched';
  $: visibleCount = $sortedItems.length;

  $: if (open) {
    void focusSearch();
  }

  async function focusSearch(): Promise<void> {
    await tick();
    searchEl?.focus();
  }

  function close(): void {
    onClose();
    requestAnimationFrame(() => returnFocusTo?.focus());
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab' || !panelEl) return;

    const focusable = Array.from(
      panelEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function formatDuration(seconds: number): string {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }

    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  function episodeCode(item: MediaItem): string {
    return `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`;
  }

  function trackFromItem(item: MediaItem): Track {
    return {
      id: item.id,
      title: item.title,
      duration: item.durationSeconds,
      src: item.src,
    };
  }

  function handleSelect(item: MediaItem): void {
    const track = trackFromItem(item);
    setQueue([track], 0);
    close();
  }

  function clearSearch(): void {
    searchQuery.set('');
    searchEl?.focus();
  }

  function clearWatchFilter(): void {
    libraryWatchFilter.set('all');
  }

  function toggleSortDirection(): void {
    librarySortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
  }

  function handleDragStart(event: DragEvent, item: MediaItem): void {
    startTrackDrag(event, trackFromItem(item));
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div
    id="compact-library-overlay"
    bind:this={panelEl}
    class="compact-library absolute inset-y-0 left-0 z-30 flex w-[420px] max-w-[calc(100%-16px)] flex-col border-r border-vlc-border bg-vlc-panel/95 shadow-2xl backdrop-blur-md"
    role="dialog"
    aria-label="Library browser"
    data-compact-library
  >
    <header class="flex shrink-0 items-start gap-2 border-b border-vlc-border px-3 py-2.5">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 class="text-[13px] font-medium leading-5 text-vlc-text">Library</h2>
          <span class="text-[11px] text-vlc-muted">{visibleCount}</span>
        </div>
        <nav class="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-vlc-muted" aria-label="Library location">
          {#each $breadcrumb as segment, index (index)}
            {#if index > 0}
              <ChevronRight size={10} strokeWidth={1.8} aria-hidden="true" class="shrink-0" />
            {/if}
            <span
              class="truncate"
              class:text-vlc-secondary={index === $breadcrumb.length - 1}
            >
              {segment}
            </span>
          {/each}
        </nav>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <LibraryAddMenu />
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
          title="Close library"
          aria-label="Close library"
          on:click={close}
        >
          <X size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="shrink-0 space-y-2 border-b border-vlc-border px-3 py-2.5">
      <label class="flex h-8 items-center gap-2 rounded-control border border-vlc-border bg-vlc-app px-2.5">
        <Search size={14} strokeWidth={1.8} class="shrink-0 text-vlc-muted" aria-hidden="true" />
        <input
          bind:this={searchEl}
          class="min-w-0 flex-1 bg-transparent text-[12px] text-vlc-text outline-none placeholder:text-vlc-muted"
          type="search"
          placeholder="Search library"
          aria-label="Search library"
          value={$searchQuery}
          on:input={(event) => searchQuery.set(event.currentTarget.value)}
        />
        {#if activeQuery}
          <button
            type="button"
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-input text-vlc-muted hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
            title="Clear search"
            aria-label="Clear search"
            on:click={clearSearch}
          >
            <X size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        {/if}
      </label>

      <div class="flex items-center gap-1.5">
        <div class="flex min-w-0 flex-1 items-center gap-0.5 rounded-control bg-vlc-app p-0.5" role="group" aria-label="Watched filter">
          {#each watchFilters as filter (filter.value)}
            {@const active = $libraryWatchFilter === filter.value}
            <button
              type="button"
              class="flex h-6 flex-1 items-center justify-center gap-1 rounded-[4px] px-1.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
              class:bg-vlc-card={active}
              class:text-vlc-text={active}
              class:text-vlc-muted={!active}
              class:hover:text-vlc-secondary={!active}
              aria-pressed={active}
              on:click={() => libraryWatchFilter.set(filter.value)}
            >
              {#if filter.value === 'watched'}
                <Eye size={10} strokeWidth={2} aria-hidden="true" />
              {:else if filter.value === 'unwatched'}
                <EyeOff size={10} strokeWidth={2} aria-hidden="true" />
              {/if}
              {filter.label}
            </button>
          {/each}
        </div>

        <select
          class="h-7 min-w-0 max-w-[112px] rounded-control border border-vlc-border bg-vlc-app px-1.5 text-[10px] text-vlc-secondary outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
          aria-label="Sort library by"
          bind:value={$librarySortKey}
        >
          {#each sortOptions as option (option.key)}
            <option value={option.key}>{option.label}</option>
          {/each}
        </select>

        <button
          type="button"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-vlc-border bg-vlc-app text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
          title={`Sort ${$librarySortDirection === 'asc' ? 'ascending' : 'descending'}`}
          aria-label={`Sort ${sortLabel} ${$librarySortDirection === 'asc' ? 'ascending' : 'descending'}, toggle direction`}
          on:click={toggleSortDirection}
        >
          {#if $librarySortDirection === 'asc'}
            <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
          {:else}
            <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
          {/if}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2" class:pb-16={fullscreen}>
      {#if $libraryItems.length === 0}
        <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p class="text-[13px] font-medium text-vlc-secondary">Your library is empty</p>
          <p class="text-[11px] leading-4 text-vlc-muted">
            Add a file, folder or network stream from the menu above.
          </p>
        </div>
      {:else if $filteredItems.length === 0 && activeQuery}
        <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p class="text-[13px] font-medium text-vlc-secondary">No matches</p>
          <p class="text-[11px] leading-4 text-vlc-muted">
            Nothing in the library matches “{activeQuery}”.
          </p>
          <button
            type="button"
            class="rounded-control border border-vlc-border bg-vlc-card px-2.5 py-1 text-[11px] text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
            on:click={clearSearch}
          >
            Clear search
          </button>
        </div>
      {:else if $filteredItems.length === 0 && watchFilterActive}
        <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p class="text-[13px] font-medium text-vlc-secondary">No {emptyFilterLabel} items</p>
          <p class="text-[11px] leading-4 text-vlc-muted">
            Every item in this library is {emptyFilterLabel === 'watched' ? 'unwatched' : 'watched'}.
          </p>
          <button
            type="button"
            class="rounded-control border border-vlc-border bg-vlc-card px-2.5 py-1 text-[11px] text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
            on:click={clearWatchFilter}
          >
            Show all items
          </button>
        </div>
      {:else}
        <ul class="space-y-0.5" aria-label="Library items">
          {#each $sortedItems as item (item.id)}
            {@const watched = isItemWatched(item)}
            {@const progress = Math.min(Math.max(item.progress, 0), 1)}
            <li>
              <button
                type="button"
                class="group flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                draggable="true"
                title={`Play ${item.title}. Drag to add to the queue.`}
                aria-label={`Play ${item.title}, ${episodeCode(item)}, ${formatDuration(item.durationSeconds)}${watched ? ', watched' : ''}. Drag to add to the queue.`}
                on:click={() => handleSelect(item)}
                on:dragstart={(event) => handleDragStart(event, item)}
              >
                <span
                  class="relative flex aspect-video w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-vlc-border bg-vlc-panel-alt"
                  aria-hidden="true"
                >
                  {#if item.thumbnailPath}
                    <img src={item.thumbnailPath} alt="" class="h-full w-full object-cover" loading="lazy" draggable="false" />
                  {:else}
                    <Play size={13} strokeWidth={1.8} class="text-vlc-dim" />
                  {/if}
                </span>

                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12px] leading-4 text-vlc-text">{item.title}</span>
                  <span class="mt-0.5 flex items-center gap-1.5 text-[10px] leading-3 text-vlc-muted">
                    <span class="tabular-nums">{episodeCode(item)}</span>
                    <span aria-hidden="true">·</span>
                    <span class="tabular-nums">{formatDuration(item.durationSeconds)}</span>
                    {#if watched}
                      <span aria-hidden="true">·</span>
                      <span class="text-vlc-orangeText">Watched</span>
                    {/if}
                  </span>
                  <span class="mt-1 block h-[2px] w-full overflow-hidden rounded-full bg-vlc-raised" aria-hidden="true">
                    <span class="block h-full rounded-full bg-vlc-orange" style={`width: ${progress * 100}%`}></span>
                  </span>
                </span>

                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-vlc-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden="true"
                >
                  <Play size={12} strokeWidth={2} />
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-vlc-border px-3 py-1.5">
      <span class="text-[10px] text-vlc-muted">Drag an item onto the queue to add it.</span>
      <span class="text-[10px] text-vlc-muted">{$player.queue.length} queued</span>
    </footer>
  </div>
{/if}
