<script lang="ts">
  import { tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { Check, ChevronRight, EyeOff, Film, Folder, Pencil, SearchX, X } from 'lucide-svelte';
  import LibraryDetails from '../components/LibraryDetails.svelte';
  import LibraryToolbar from '../components/LibraryToolbar.svelte';
  import MediaCard from '../components/MediaCard.svelte';
  import MediaListRow from '../components/MediaListRow.svelte';
  import type { MediaItem } from '../lib/mock';
  import { ensureItemThumbnail, mediaThumbnails } from '../lib/thumbnails';
  import {
    breadcrumb,
    currentFolders,
    filteredItems,
    goUpOneLevel,
    libraryImportLog,
    libraryItems,
    libraryRootName,
    librarySortDirection,
    librarySortKey,
    libraryWatchFilter,
    navigateToLibraryPath,
    openLibraryFolder,
    rootFolders,
    searchQuery,
    sortedItems,
    subfolders,
    type LibraryFolder,
  } from '../stores/library';
  import { navigate } from '../stores/navigation';
  import { currentTrack, setQueue, type Track } from '../stores/player';
  import { libraryViewMode } from '../stores/viewModes';

  const dispatch = createEventDispatcher<{ advancedSettings: string }>();

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

  /** Configured roots are listed under the Library level; deeper levels show imported subfolders. */
  $: atLibraryRoot = $breadcrumb.length === 0;

  /** Disambiguate folder names when siblings share a name: Name[ParentName] */
  let displayFolderNames: Map<string, string> = new Map();
  $: displayFolderNames = (() => {
    const folders = $currentFolders;
    const names = folders.map(f => f.name);
    const dupes = new Set(names.filter((n, i) => names.indexOf(n) !== i));
    return new Map(folders.map(f => {
      if (!dupes.has(f.name)) return [f.path, f.name];
      const parent = f.path.split('/').slice(-2, -1)[0] ?? f.name;
      return [f.path, `${f.name}[${parent}]`];
    }));
  })();

  function getDisplayName(folder: LibraryFolder): string {
    return displayFolderNames.get(folder.path) ?? folder.name;
  }

  /**
   * Representative folder frames: finding a folder's representative item and
   * queueing its capture is idempotent (cached/pending/failed ids no-op), so
   * this re-run is cheap whenever folders or items change, e.g. after a scan.
   */
  function ensureFolderRepresentatives(folders: LibraryFolder[], items: MediaItem[]): void {
    for (const folder of folders) {
      const repId = folder.representativeId;
      if (!repId) continue;
      const item = items.find((candidate) => candidate.id === repId);
      if (item) ensureItemThumbnail(item);
    }
  }

  $: ensureFolderRepresentatives($currentFolders, $libraryItems);

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

  function handleBreadcrumbSelect(renderedIndex: number) {
    // The rendered trail starts with the fixed Library root label.
    searchQuery.set('');
    breadcrumb.update((segments) => segments.slice(0, renderedIndex));
    detailsItemId = null;
  }

  function openFolder(folder: LibraryFolder) {
    searchQuery.set('');
    detailsItemId = null;
    openLibraryFolder(folder.name);
  }

  async function beginPathEdit() {
    pathDraft = [libraryRootName, ...$breadcrumb].join(' / ');
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
    onBack={goUpOneLevel}
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
          placeholder="Library / Videos / Shows"
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
        {#each [libraryRootName, ...$breadcrumb] as crumb, index (index)}
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
            class:text-vlc-text={index === $breadcrumb.length}
            class:text-vlc-secondary={index !== $breadcrumb.length}
            class:hover:text-vlc-text={index !== $breadcrumb.length}
            aria-current={index === $breadcrumb.length ? 'page' : undefined}
            title={index === $breadcrumb.length ? crumb : `Go to ${crumb}`}
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
        breadcrumb={[libraryRootName, ...$breadcrumb]}
        onBack={closeDetails}
        onPlay={handleSelect}
      />
    {:else if $currentFolders.length > 0 || $sortedItems.length > 0}
      {#if $currentFolders.length > 0}
        {#if $libraryViewMode === 'grid'}
          <div
            class="grid grid-cols-2 gap-x-5 gap-y-7 px-6 pt-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            role="group"
            aria-label="Library folders"
          >
            {#each $currentFolders as folder (folder.path)}
              <button
                type="button"
                class="group text-left focus-visible:outline-none"
                aria-label={`Open folder ${getDisplayName(folder)}`}
                title={folder.path}
                on:click={() => openFolder(folder)}
              >
                <div class="relative flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-lg border border-vlc-border bg-[linear-gradient(180deg,#1B1B1B_0%,#0E0E0E_100%)] p-4 transition-[border-color,filter] duration-150 group-hover:border-vlc-borderStrong group-hover:brightness-105">
                  {#if folder.representativeId && $mediaThumbnails.has(folder.representativeId)}
                    <img
                      src={$mediaThumbnails.get(folder.representativeId)}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      class="absolute inset-0 h-full w-full object-cover"
                    />
                    <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.72)_100%)]" aria-hidden="true"></div>
                  {/if}
                  <div class="flex h-11 w-11 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-orange">
                    <Folder size={22} strokeWidth={1.6} aria-hidden="true" />
                  </div>
                </div>
                <div class="mt-2.5 truncate text-[12px] font-medium leading-4 text-vlc-secondary group-hover:text-vlc-text">
                  {getDisplayName(folder)}
                </div>
                <div class="text-[10px] leading-4 text-vlc-muted">
                  {folder.total} {folder.total === 1 ? 'item' : 'items'}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="px-6 pt-6">
            <div
              class="overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel"
              role="group"
              aria-label="Library folders"
            >
              {#each $currentFolders as folder (folder.path)}
                <button
                  type="button"
                  class="flex w-full items-center gap-3 border-b border-vlc-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-vlc-orange/50"
                  aria-label={`Open folder ${getDisplayName(folder)}`}
                  title={folder.path}
                  on:click={() => openFolder(folder)}
                >
                  <span class="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-input border border-vlc-border bg-vlc-card text-vlc-orange">
                    {#if folder.representativeId && $mediaThumbnails.has(folder.representativeId)}
                      <img
                        src={$mediaThumbnails.get(folder.representativeId)}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        class="absolute inset-0 h-full w-full object-cover"
                      />
                      <span class="absolute inset-0 bg-black/45" aria-hidden="true"></span>
                    {/if}
                    <Folder size={18} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px] text-vlc-text">{getDisplayName(folder)}</span>
                    <span class="block truncate font-mono text-[10px] text-vlc-muted">{folder.path}</span>
                  </span>
                  <span class="shrink-0 text-[11px] tabular-nums text-vlc-muted">
                    {folder.total} {folder.total === 1 ? 'item' : 'items'}
                  </span>
                  <ChevronRight size={14} strokeWidth={1.75} class="shrink-0 text-vlc-muted" aria-hidden="true" />
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      {#if $sortedItems.length > 0}
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
          <p class="text-sm font-medium text-vlc-secondary">
            {atLibraryRoot ? 'Your video library is empty' : 'This folder is empty'}
          </p>
          <p class="mt-1 text-xs text-vlc-muted">
            {atLibraryRoot
              ? 'Point Kanea at your media folders to browse them here.'
              : 'Media inside this folder shows up here once it is imported.'}
          </p>
          {#if atLibraryRoot}
            <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                class={emptyActionClass}
                on:click={() => dispatch('advancedSettings', 'Library')}
              >
                Add folders in Settings
              </button>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>
