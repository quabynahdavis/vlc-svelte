<script lang="ts">
  import { get } from 'svelte/store';
  import { Film, SearchX } from 'lucide-svelte';
  import LibraryToolbar from '../components/LibraryToolbar.svelte';
  import MediaCard from '../components/MediaCard.svelte';
  import MediaListRow from '../components/MediaListRow.svelte';
  import type { MediaItem } from '../lib/mock';
  import {
    breadcrumb,
    filteredItems,
    libraryImportLog,
    librarySortDirection,
    librarySortKey,
    searchQuery,
    sortedItems,
  } from '../stores/library';
  import { navigate } from '../stores/navigation';
  import { currentTrack, setQueue, type Track } from '../stores/player';
  import { libraryViewMode } from '../stores/viewModes';

  $: activeQuery = $searchQuery.trim();

  function handleSelect(item: MediaItem) {
    const items = get(sortedItems);
    const tracks: Track[] = items.map((entry) => ({
      id: entry.id,
      title: entry.title,
      duration: entry.durationSeconds,
      src: entry.src,
    }));
    const startIndex = items.findIndex((entry) => entry.id === item.id);

    setQueue(tracks, startIndex >= 0 ? startIndex : 0);
    navigate('home');
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <LibraryToolbar
    breadcrumb={$breadcrumb}
    itemCount={$filteredItems.length}
    searchValue={$searchQuery}
    sortKey={$librarySortKey}
    sortDirection={$librarySortDirection}
    onSearch={(value) => searchQuery.set(value)}
    onSortKeyChange={(key) => librarySortKey.set(key)}
    onToggleSortDirection={() =>
      librarySortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'))}
  />

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if $sortedItems.length > 0}
      {#if $libraryViewMode === 'grid'}
        <div
          class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {#each $sortedItems as item (item.id)}
            <MediaCard {item} onSelect={handleSelect} />
          {/each}
        </div>
      {:else if $libraryViewMode === 'list'}
        <div class="p-6">
          <div
            class="overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel"
            role="group"
            aria-label="Library items, list view"
          >
            {#each $sortedItems as item (item.id)}
              <MediaListRow
                {item}
                mode="list"
                onSelect={handleSelect}
                selected={$currentTrack?.id === item.id}
              />
            {/each}
          </div>
        </div>
      {:else}
        <div class="py-1" role="group" aria-label="Library items, compact view">
          {#each $sortedItems as item (item.id)}
            <MediaListRow
              {item}
              mode="compact"
              onSelect={handleSelect}
              selected={$currentTrack?.id === item.id}
            />
          {/each}
        </div>
      {/if}
    {:else}
      <div class="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <div
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-muted"
        >
          {#if activeQuery}
            <SearchX size={22} strokeWidth={1.5} aria-hidden="true" />
          {:else}
            <Film size={22} strokeWidth={1.5} aria-hidden="true" />
          {/if}
        </div>

        {#if activeQuery}
          <p class="text-sm font-medium text-vlc-secondary">
            No results for &ldquo;{activeQuery}&rdquo;
          </p>
          <p class="mt-1 text-xs text-vlc-muted">Try a different title or clear the search.</p>
          <button
            type="button"
            class="mt-4 rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
            on:click={() => searchQuery.set('')}
          >
            Clear search
          </button>
        {:else}
          <p class="text-sm font-medium text-vlc-secondary">Your video library is empty</p>
          <p class="mt-1 text-xs text-vlc-muted">Media you add will show up here.</p>
        {/if}
      </div>
    {/if}
  </div>
</div>
