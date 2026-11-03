<script lang="ts">
  import { tick } from 'svelte';
  import { Check, ChevronRight, EyeOff, Film, Pencil, SearchX, X } from 'lucide-svelte';
  import LibraryDetails from '../components/LibraryDetails.svelte';
  import LibraryToolbar from '../components/LibraryToolbar.svelte';
  import MediaCard from '../components/MediaCard.svelte';
  import MediaListRow from '../components/MediaListRow.svelte';
  import type { MediaItem } from '../lib/mock';
  import {
    breadcrumb,
    filteredItems,
    libraryImportLog,
    libraryItems,
    librarySortDirection,
    librarySortKey,
    libraryWatchFilter,
    navigateToLibraryPath,
    searchQuery,
    sortedItems,
  } from '../stores/library';
  import { navigate } from '../stores/navigation';
  import { currentTrack, setQueue, type Track } from '../stores/player';
  import { libraryViewMode } from '../stores/viewModes';

  $: activeQuery = $searchQuery.trim();
  $: watchFilterActive = $libraryWatchFilter !== 'all';
  $: emptyFilterLabel = $libraryWatchFilter === 'watched' ? 'watched' : 'unwatched';

  /** Id of the item whose details are open; resolved against the store so edits stay live. */
  let detailsItemId: string | null = null;
  let detailsItem: MediaItem | null = null;

  let pathEditing = false;
  let pathDraft = '';
  let pathError = '';
  let pathInput: HTMLInputElement | null = null;
  let editPathButton: HTMLButtonElement | null = null;

  $: detailsItem = detailsItemId
    ? $libraryItems.find((item) => item.id === detailsItemId) ?? null
    : null;

  const emptyActionClass =
    'rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50';

  const pathIconButtonClass =
    'flex h-6 w-6 shrink-0 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60';

  function handleSelect(item: MediaItem) {
    const track: Track = {
      id: item.id,
      title: item.title,
      duration: item.durationSeconds,
      src: item.src ?? '',
    };

    setQueue([track], 0);
    navigate('home');
  }

  function handleBreadcrumbSelect(index: number) {
    searchQuery.set('');
    breadcrumb.update((segments) => segments.slice(0, index + 1));
    detailsItemId = null;
  }

  async function beginPathEdit() {
    pathDraft = $breadcrumb.join(' / ');
    pathError = '';
    pathEditing = true;

    await tick();
    pathInput?.focus();
    pathInput?.select();
  }

  async function closePathEdit(refocus = true) {
    pathEditing = false;
    pathError = '';

    await tick();
    if (refocus) editPathButton?.focus();
  }

  function handlePathInput() {
    if (pathError) pathError = '';
  }

  function submitPath() {
    const result = navigateToLibraryPath(pathDraft);

    if (!result.ok) {
      pathError = 'Path not found';
      pathInput?.focus();
      return;
    }

    searchQuery.set('');
    detailsItemId = null;
    void closePathEdit();
  }

  function handlePathKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    event.stopPropagation();
    void closePathEdit();
  }

  function openDetails(item: MediaItem) {
    detailsItemId = item.id;
  }

  async function closeDetails() {
    const id = detailsItemId;
    detailsItemId = null;

    await tick();
    if (id) document.querySelector<HTMLElement>(`[data-media-info="${id}"]`)?.focus();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !detailsItemId || pathEditing) return;
    // Let an open modal dialog handle its own Escape first.
    if (document.querySelector('dialog[open]')) return;

    event.preventDefault();
    void closeDetails();
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <LibraryToolbar
    itemCount={$filteredItems.length}
    searchValue={$searchQuery}
    sortKey={$librarySortKey}
    sortDirection={$librarySortDirection}
    watchFilter={$libraryWatchFilter}
    onSearch={(value) => searchQuery.set(value)}
    onSortKeyChange={(key) => librarySortKey.set(key)}
    onToggleSortDirection={() =>
      librarySortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'))}
    onWatchFilterChange={(filter) => libraryWatchFilter.set(filter)}
  />

  <div
    class="flex min-h-[40px] shrink-0 items-center gap-2 border-b border-vlc-border bg-vlc-app px-6"
  >
    {#if pathEditing}
      <form class="flex min-w-0 flex-1 items-center gap-2" on:submit|preventDefault={submitPath}>
        <label for="library-path-input" class="sr-only">Library path</label>
        <input
          id="library-path-input"
          bind:this={pathInput}
          bind:value={pathDraft}
          on:input={handlePathInput}
          on:keydown={handlePathKeydown}
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="Videos / Shows / The Wand"
          aria-invalid={pathError ? 'true' : undefined}
          aria-describedby={pathError ? 'library-path-error' : undefined}
          class="h-7 w-full max-w-[420px] rounded-input border bg-vlc-card px-2.5 text-xs text-vlc-text outline-none transition-colors placeholder:text-vlc-muted {pathError
            ? 'border-vlc-danger ring-1 ring-vlc-danger'
            : 'border-vlc-border focus:border-vlc-orange/40 focus:ring-1 focus:ring-vlc-orange/40'}"
        />
        <button
          type="submit"
          class={pathIconButtonClass}
          title="Go to path"
          aria-label="Go to path"
        >
          <Check size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={pathIconButtonClass}
          title="Cancel"
          aria-label="Cancel path edit"
          on:click={() => closePathEdit()}
        >
          <X size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {#if pathError}
          <span
            id="library-path-error"
            role="alert"
            class="shrink-0 text-[11px] font-medium text-vlc-danger"
          >
            Path not found
          </span>
        {/if}
      </form>
    {:else}
      <nav
        class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[12px] leading-none"
        aria-label="Library path"
      >
        {#each $breadcrumb as crumb, index (index)}
          {#if index > 0}
            <ChevronRight
              size={13}
              strokeWidth={1.75}
              class="shrink-0 text-vlc-muted"
              aria-hidden="true"
            />
          {/if}
          <button
            type="button"
            class="min-w-0 truncate whitespace-nowrap rounded-[4px] px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
            class:text-vlc-text={index === $breadcrumb.length - 1}
            class:text-vlc-secondary={index !== $breadcrumb.length - 1}
            class:hover:text-vlc-text={index !== $breadcrumb.length - 1}
            aria-current={index === $breadcrumb.length - 1 ? 'page' : undefined}
            title={index === $breadcrumb.length - 1 ? crumb : `Go to ${crumb}`}
            on:click={() => handleBreadcrumbSelect(index)}
          >
            {crumb}
          </button>
        {/each}
      </nav>

      <button
        bind:this={editPathButton}
        type="button"
        class={pathIconButtonClass}
        title="Edit path"
        aria-label="Edit path"
        on:click={beginPathEdit}
      >
        <Pencil size={12} strokeWidth={1.9} aria-hidden="true" />
      </button>
    {/if}
  </div>

  {#if $libraryImportLog}
    <div
      class="flex shrink-0 items-center gap-2 border-b border-vlc-border bg-vlc-panel px-6 py-1.5"
      role="status"
      aria-live="polite"
    >
      <span class="min-w-0 flex-1 truncate text-[11px] text-vlc-secondary">
        {$libraryImportLog}
      </span>
      <button
        type="button"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
        title="Dismiss"
        aria-label="Dismiss import status"
        on:click={() => libraryImportLog.set('')}
      >
        <X size={12} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  {/if}

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if detailsItem}
      <LibraryDetails
        item={detailsItem}
        breadcrumb={$breadcrumb}
        onBack={closeDetails}
        onPlay={handleSelect}
      />
    {:else if $sortedItems.length > 0}
      {#if $libraryViewMode === 'grid'}
        <div
          class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {#each $sortedItems as item (item.id)}
            <MediaCard {item} onSelect={handleSelect} on:info={(event) => openDetails(event.detail)} />
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
                on:info={(event) => openDetails(event.detail)}
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
              on:info={(event) => openDetails(event.detail)}
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
          {:else if watchFilterActive}
            <EyeOff size={22} strokeWidth={1.5} aria-hidden="true" />
          {:else}
            <Film size={22} strokeWidth={1.5} aria-hidden="true" />
          {/if}
        </div>

        {#if activeQuery}
          <p class="text-sm font-medium text-vlc-secondary">
            No results for &ldquo;{activeQuery}&rdquo;
          </p>
          <p class="mt-1 text-xs text-vlc-muted">Try a different title or clear the search.</p>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              class={emptyActionClass}
              on:click={() => searchQuery.set('')}
            >
              Clear search
            </button>
            {#if watchFilterActive}
              <button
                type="button"
                class={emptyActionClass}
                on:click={() => libraryWatchFilter.set('all')}
              >
                Show all items
              </button>
            {/if}
          </div>
        {:else if watchFilterActive}
          <p class="text-sm font-medium text-vlc-secondary">
            No {emptyFilterLabel} items
          </p>
          <p class="mt-1 text-xs text-vlc-muted">
            {$libraryWatchFilter === 'watched'
              ? 'Items show up here once you start watching them.'
              : 'Everything in this view already has playback progress.'}
          </p>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              class={emptyActionClass}
              on:click={() => libraryWatchFilter.set('all')}
            >
              Show all items
            </button>
          </div>
        {:else}
          <p class="text-sm font-medium text-vlc-secondary">Your video library is empty</p>
          <p class="mt-1 text-xs text-vlc-muted">Media you add will show up here.</p>
        {/if}
      </div>
    {/if}
  </div>
</div>
