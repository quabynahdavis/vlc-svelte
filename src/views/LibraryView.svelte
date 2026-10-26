<script lang="ts">
  import { Film, SearchX } from 'lucide-svelte';
  import LibraryToolbar from '../components/LibraryToolbar.svelte';
  import MediaCard from '../components/MediaCard.svelte';
  import type { MediaItem } from '../lib/mock';
  import { breadcrumb, filteredItems, searchQuery } from '../stores/library';

  $: activeQuery = $searchQuery.trim();

  function handleSelect(item: MediaItem) {
    // Navigation into the player arrives in a later phase.
    void item;
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <LibraryToolbar
    breadcrumb={$breadcrumb}
    itemCount={$filteredItems.length}
    searchValue={$searchQuery}
    onSearch={(value) => searchQuery.set(value)}
  />

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if $filteredItems.length > 0}
      <div
        class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {#each $filteredItems as item (item.id)}
          <MediaCard {item} onSelect={handleSelect} />
        {/each}
      </div>
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
            class="mt-4 rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-[#3A3A3A] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
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
