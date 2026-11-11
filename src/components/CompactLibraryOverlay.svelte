<script lang="ts">
  import { tick } from 'svelte';
  import { X, Music, Radio, Film, Play, Search } from 'lucide-svelte';
  import { handleHorizontalWheel } from '../lib/horizontalScroll';
  import { startTrackDrag } from '../lib/dragTrack';
  import { bookmarks, removeBookmark, formatTimestamp } from '../stores/bookmarks';
  import { watchLater, removeWatchLater, toggleWatchLater } from '../stores/watchLater';
  import { history, removeHistory, clearHistory } from '../stores/history';
  import { player, requestSeek, setQueue, type Track } from '../stores/player';
  import { watchEntries, removeWatch } from '../stores/watch';
  import {
    openBookmarkContextMenu,
    openHistoryContextMenu,
    openWatchLaterContextMenu,
  } from '../stores/ui';
  import type { ViewMode } from '../stores/viewModes';
  import SortMenu from './SortMenu.svelte';
  import ViewModeToggle from './ViewModeToggle.svelte';

  export let open = false;
  export let onClose: () => void = () => {};
  export let returnFocusTo: HTMLElement | null = null;

  // ---- active tab & focus trap ----
  let activeTab = 0; // 0=Bookmarks,1=Watch Later,2=History
  let panelEl: HTMLDivElement | null = null;
  let searchQueries = [ '', '', '' ];
  // sort option per tab: 'new' descending / 'old' ascending
  let sortOptions = [ 'new', 'new', 'new' ];
  // layout per tab, like the grid/list switcher on the browse pages
  let tabViewModes: ViewMode[] = [ 'list', 'list', 'list' ];

  const dateSortOptions = [
    { key: 'new', label: 'Newest' },
    { key: 'old', label: 'Oldest' },
  ];

  // Search and sort per tab
  $: filteredBookmarks = $bookmarks
    .filter(b => {
      const q = searchQueries[0].trim().toLowerCase();
      return q === '' || (b.label && b.label.toLowerCase().includes(q)) || formatTimestamp(b.time).includes(q);
    })
    .slice()
    .sort((a, b) => (sortOptions[0] === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));

  $: filteredWatchLater = $watchLater
    .filter(wl => {
      const q = searchQueries[1].trim().toLowerCase();
      return q === '' || wl.title.toLowerCase().includes(q) || (wl.artist && wl.artist.toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => (sortOptions[1] === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));

  $: filteredHistory = $history
    .filter(h => {
      const q = searchQueries[2].trim().toLowerCase();
      return q === '' || h.title.toLowerCase().includes(q) || (h.artist && h.artist.toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => (sortOptions[2] === 'new' ? b.lastPlayedAt - a.lastPlayedAt : a.lastPlayedAt - b.lastPlayedAt));


  // ---- Mini Continue strip (unchanged) ----
  $: miniContinueItems = $watchEntries
    .filter(e => !e.watched && e.position > 0 && e.duration > 0 && e.position / e.duration < 0.98 && e.position / e.duration > 0.02)
    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
    .slice(0, 3);

  $: if (open) {
    void tick();
  }

  type FlatEntry = { mediaKey: string; title: string; artist?: string; duration: number; src?: string };

  /** Build the queue payload for a stored entry. */
  function makeTrack(entry: FlatEntry): Track {
    return {
      id: entry.mediaKey,
      title: entry.title,
      artist: entry.artist || undefined,
      duration: entry.duration,
      src: entry.src ?? '',
    };
  }

  function startEntryDrag(event: DragEvent, entry: FlatEntry): void {
    startTrackDrag(event, makeTrack(entry));
  }

  function playEntry(entry: FlatEntry): void {
    if (!entry.src) return;
    setQueue([makeTrack(entry)], 0);
  }

  /** Bookmarks double as positions in the earlier media: resume there. */
  function playBookmark(bm: { mediaKey: string; time: number }): void {
    const entry = $watchEntries.find(e => e.mediaKey === bm.mediaKey);
    if (!entry || !entry.src) return;
    requestSeek(bm.time);
    setQueue([makeTrack(entry)], 0);
  }

  // Hover action buttons shared by the grid cards, mirroring MediaCard.
  const cardActionClass =
    'flex h-6 w-6 items-center justify-center rounded-[4px] bg-black/65 text-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-vlc-orange hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70';

  function close(): void {
    onClose();
    requestAnimationFrame(() => returnFocusTo?.focus());
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === 'Escape' && !event.defaultPrevented) {
      // Sort menus and the like mark Escape as handled first.
      event.preventDefault();
      close();
      return;
    }
    // Focus trap for Tab key
    if (event.key !== 'Tab' || !panelEl) return;
    const focusable = Array.from(
      panelEl.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter(el => el.offsetParent !== null);
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


  function handleTabKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      activeTab = (activeTab + 1) % 3;
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      activeTab = (activeTab + 2) % 3;
      event.preventDefault();
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
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div
    id="compact-library-overlay"
    bind:this={panelEl}
    class="compact-library absolute inset-y-0 left-0 z-30 flex w-[420px] max-w-[calc(100%-16px)] flex-col border-r border-vlc-border bg-vlc-panel/95 shadow-2xl backdrop-blur-md"
    role="dialog"
    aria-label="Library"
    data-compact-library
  >
    <header class="flex shrink-0 items-start gap-2 border-b border-vlc-border px-3 py-2.5">
      <div class="min-w-0 flex-1">
        <h2 class="text-[13px] font-medium leading-5 text-vlc-text">Library</h2>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
          title="Close"
          aria-label="Close"
          on:click={close}
        >
          <X size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </header>

    <!-- Mini Continue strip -->
    {#if miniContinueItems.length > 0}
      <div data-hscroll on:wheel|nonpassive={handleHorizontalWheel} class="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-vlc-orange/40 scrollbar-track-vlc-raised px-3">
        {#each miniContinueItems as item}
          <button
            type="button"
            class="group min-w-[120px] shrink-0 rounded-control border border-vlc-border bg-vlc-panel p-1.5 text-left hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
            aria-label={`Resume ${item.title}`}
            on:click={() => {
              if (item.src) {
                requestSeek(item.position);
                setQueue([{ id: item.mediaKey, title: item.title, artist: item.artist, duration: item.duration, src: item.src }], 0);
              }
            }}
          >
            <div class="relative aspect-video w-full overflow-hidden rounded bg-vlc-app flex items-center justify-center">
              {#if item.thumbnail}
                <img src={item.thumbnail} alt="" class="h-full w-full object-cover" />
              {:else if item.type === 'music'}
                <Music size={20} class="text-vlc-muted" aria-hidden="true" />
              {:else if item.type === 'stream'}
                <Radio size={20} class="text-vlc-muted" aria-hidden="true" />
              {:else}
                <Film size={20} class="text-vlc-muted" aria-hidden="true" />
              {/if}
              <span class="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/80">
                {item.type === 'music' ? 'Music' : item.type === 'stream' ? 'Stream' : 'Video'}
              </span>

              <button
                type="button"
                class="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-black/70 text-white/85 opacity-100 shadow-sm backdrop-blur-sm transition-[opacity,background-color,color] hover:bg-vlc-orange hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange focus-visible:ring-offset-1 focus-visible:ring-offset-black md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                title="Remove from Continue"
                aria-label={`Remove ${item.title} from Continue`}
                on:click={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  removeWatch(item.mediaKey, item.type);
                }}
              >
                <X size={11} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
            <p class="mt-1 truncate text-[10px] text-vlc-text">{item.title}</p>
            <div class="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-vlc-raised">
              <div class="h-full bg-vlc-orange" style={`width:${Math.min(100, Math.max(0, (item.position / item.duration) * 100))}%`} />
            </div>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Tabs + scrollable panel content -->
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <!-- Tab bar -->
    <div role="tablist" tabindex="0" class="sticky top-0 z-10 flex-shrink-0 border-b border-vlc-border bg-vlc-panel/95" on:keydown={handleTabKey}>
      <button
        type="button"
        role="tab"
        id="tab-0"
        aria-controls="panel-0"
        aria-selected={activeTab === 0}
        tabindex={activeTab === 0 ? 0 : -1}
        class="flex-1 py-1.5 px-2 text-[11px] font-medium text-center transition-colors {activeTab === 0 ? 'bg-vlc-card text-vlc-text' : 'text-vlc-muted hover:text-vlc-text hover:bg-vlc-raised'}"
        on:click={() => (activeTab = 0)}
      >Bookmarks</button>
      <button
        type="button"
        role="tab"
        id="tab-1"
        aria-controls="panel-1"
        aria-selected={activeTab === 1}
        tabindex={activeTab === 1 ? 0 : -1}
        class="flex-1 py-1.5 px-2 text-[11px] font-medium text-center transition-colors {activeTab === 1 ? 'bg-vlc-card text-vlc-text' : 'text-vlc-muted hover:text-vlc-text hover:bg-vlc-raised'}"
        on:click={() => (activeTab = 1)}
      >Watch Later</button>
      <button
        type="button"
        role="tab"
        id="tab-2"
        aria-controls="panel-2"
        aria-selected={activeTab === 2}
        tabindex={activeTab === 2 ? 0 : -1}
        class="flex-1 py-1.5 px-2 text-[11px] font-medium text-center transition-colors {activeTab === 2 ? 'bg-vlc-card text-vlc-text' : 'text-vlc-muted hover:text-vlc-text hover:bg-vlc-raised'}"
        on:click={() => (activeTab = 2)}
      >History</button>
    </div>

    <!-- Panel 0: Bookmarks -->
    {#if activeTab === 0}
      <div role="tabpanel" id="panel-0" aria-labelledby="tab-0" class="flex-1 px-3 py-2">
        <div class="mb-2 flex items-center gap-1.5">
          <label class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-control border border-vlc-border bg-vlc-app px-2.5" aria-label="Search bookmarks">
            <Search size={14} strokeWidth={1.8} class="shrink-0 text-vlc-muted" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search bookmarks..."
              class="min-w-0 flex-1 bg-transparent text-[12px] text-vlc-text outline-none placeholder:text-vlc-muted"
              bind:value={searchQueries[0]}
            />
          </label>
          <SortMenu
            options={dateSortOptions}
            value={sortOptions[0]}
            onValueChange={(key) => (sortOptions[0] = key)}
            label="Sort bookmarks"
          />
          <ViewModeToggle
            value={tabViewModes[0]}
            onChange={(mode) => (tabViewModes[0] = mode)}
            options={['grid', 'list']}
            label="Bookmarks view mode"
          />
        </div>

        {#if tabViewModes[0] === 'grid'}
          <div class="grid grid-cols-2 gap-x-3 gap-y-3 pb-2" role="group" aria-label="Bookmarks, grid view">
            {#each filteredBookmarks as bm (bm.id)}
              <div
                class="group relative"
                role="group"
                aria-label={`${bm.label || formatTimestamp(bm.time)} actions`}
                on:contextmenu={(event) => openBookmarkContextMenu(event, bm.id)}
              >
                <button
                  type="button"
                  class="block w-full text-left focus:outline-none"
                  aria-label={`Play ${bm.label || formatTimestamp(bm.time)}`}
                  on:click={() => playBookmark(bm)}
                >
                  <div class="rounded-lg border border-vlc-border bg-[linear-gradient(180deg,#1B1B1B_0%,#0E0E0E_100%)] px-3 py-3 transition-[border-color,filter] duration-150 group-hover:border-vlc-borderStrong group-hover:brightness-105 group-focus-within:border-vlc-orange/70">
                    <p class="font-mono text-[15px] leading-5 tabular-nums text-vlc-orangeText">{formatTimestamp(bm.time)}</p>
                    <p class="mt-1 truncate text-[11px] leading-4 text-vlc-secondary">{bm.label || 'Bookmark'}</p>
                  </div>
                </button>
                <div class="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    class={cardActionClass}
                    title="Play bookmark"
                    aria-label={`Play ${bm.label || formatTimestamp(bm.time)}`}
                    on:click={() => playBookmark(bm)}
                  >
                    <Play size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class={cardActionClass}
                    title="Remove bookmark"
                    aria-label={`Remove ${bm.label || formatTimestamp(bm.time)}`}
                    on:click={() => removeBookmark(bm.id)}
                  >
                    <X size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="mb-2 overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel" role="group" aria-label="Bookmarks, list view">
            {#each filteredBookmarks as bm (bm.id)}
              <div
                class="group flex items-center gap-1 border-b border-vlc-border px-2 py-1.5 transition-colors last:border-b-0 hover:bg-vlc-raised"
                role="group"
                aria-label={`${bm.label || formatTimestamp(bm.time)} actions`}
                on:contextmenu={(event) => openBookmarkContextMenu(event, bm.id)}
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] text-vlc-text">{bm.label || formatTimestamp(bm.time)}</p>
                  <p class="font-mono text-[10px] tabular-nums text-vlc-muted">{formatTimestamp(bm.time)}</p>
                </div>
                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
                  title="Play bookmark"
                  aria-label={`Play ${bm.label || formatTimestamp(bm.time)}`}
                  on:click={() => playBookmark(bm)}
                >
                  <Play size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
                  title="Remove bookmark"
                  aria-label={`Remove ${bm.label || formatTimestamp(bm.time)}`}
                  on:click={() => removeBookmark(bm.id)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            {/each}
          </div>
        {/if}
        {#if filteredBookmarks.length === 0}
          <p class="py-4 text-center text-vlc-muted">No bookmarks</p>
        {/if}
      </div>
    {:else if activeTab === 1}
    <!-- Panel 1: Watch Later -->
      <div role="tabpanel" id="panel-1" aria-labelledby="tab-1" class="flex-1 px-3 py-2">
        <div class="mb-2 flex items-center gap-1.5">
          <label class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-control border border-vlc-border bg-vlc-app px-2.5" aria-label="Search watch later">
            <Search size={14} strokeWidth={1.8} class="shrink-0 text-vlc-muted" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search watch later..."
              class="min-w-0 flex-1 bg-transparent text-[12px] text-vlc-text outline-none placeholder:text-vlc-muted"
              bind:value={searchQueries[1]}
            />
          </label>
          <SortMenu
            options={dateSortOptions}
            value={sortOptions[1]}
            onValueChange={(key) => (sortOptions[1] = key)}
            label="Sort watch later"
          />
          <ViewModeToggle
            value={tabViewModes[1]}
            onChange={(mode) => (tabViewModes[1] = mode)}
            options={['grid', 'list']}
            label="Watch later view mode"
          />
        </div>

        {#if tabViewModes[1] === 'grid'}
          <div class="grid grid-cols-2 gap-x-3 gap-y-3 pb-2" role="group" aria-label="Watch later, grid view">
            {#each filteredWatchLater as wl (wl.id)}
              <div
                class="group relative"
                role="group"
                draggable={Boolean(wl.src)}
                title={`${wl.title} — drag to the queue`}
                on:dragstart={(event) => startEntryDrag(event, wl)}
                on:contextmenu={(event) => openWatchLaterContextMenu(event, wl.id)}
              >
                <button
                  type="button"
                  class="block w-full text-left focus:outline-none"
                  aria-label={`Play ${wl.title}`}
                  on:click={() => playEntry(wl)}
                >
                  <div class="relative aspect-video w-full overflow-hidden rounded-lg border border-vlc-border bg-[linear-gradient(180deg,#1B1B1B_0%,#0E0E0E_100%)] transition-[border-color,filter] duration-150 group-hover:border-vlc-borderStrong group-hover:brightness-105 group-focus-within:border-vlc-orange/70">
                    {#if wl.thumbnail}
                      <img src={wl.thumbnail} alt="" class="h-full w-full object-cover" loading="lazy" draggable="false" />
                    {:else if wl.type === 'music'}
                      <Music size={22} strokeWidth={1.8} class="text-white/25" aria-hidden="true" />
                    {:else if wl.type === 'stream'}
                      <Radio size={22} strokeWidth={1.8} class="text-white/25" aria-hidden="true" />
                    {:else}
                      <Film size={22} strokeWidth={1.8} class="text-white/25" aria-hidden="true" />
                    {/if}
                    <span class="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-white/85">
                      {formatDuration(wl.duration)}
                    </span>
                  </div>
                  <p class="mt-2 truncate text-[11px] leading-4 text-vlc-text">{wl.title}</p>
                  {#if wl.artist}
                    <p class="truncate text-[10px] leading-4 text-vlc-muted">{wl.artist}</p>
                  {/if}
                </button>
                <div class="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    class={cardActionClass}
                    title="Add to queue"
                    aria-label={`Add ${wl.title} to the queue`}
                    on:click={() => playEntry(wl)}
                  >
                    <Play size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class={cardActionClass}
                    title="Remove from Watch Later"
                    aria-label={`Remove ${wl.title} from Watch Later`}
                    on:click={() => removeWatchLater(wl.id)}
                  >
                    <X size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="mb-2 overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel" role="group" aria-label="Watch later, list view">
            {#each filteredWatchLater as wl (wl.id)}
              <div
                class="group flex items-center gap-2 border-b border-vlc-border px-2 py-1.5 transition-colors last:border-b-0 hover:bg-vlc-raised"
                role="group"
                draggable={Boolean(wl.src)}
                on:dragstart={(event) => startEntryDrag(event, wl)}
                on:contextmenu={(event) => openWatchLaterContextMenu(event, wl.id)}
              >
                <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-vlc-app flex items-center justify-center">
                  {#if wl.thumbnail}
                    <img src={wl.thumbnail} alt="" class="h-full w-full object-cover" loading="lazy" draggable="false" />
                  {:else if wl.type === 'music'}
                    <Music size={16} class="text-vlc-muted" aria-hidden="true" />
                  {:else if wl.type === 'stream'}
                    <Radio size={16} class="text-vlc-muted" aria-hidden="true" />
                  {:else}
                    <Film size={16} class="text-vlc-muted" aria-hidden="true" />
                  {/if}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] text-vlc-text">{wl.title}</p>
                  {#if wl.artist}
                    <p class="truncate text-[10px] text-vlc-muted">{wl.artist}</p>
                  {/if}
                  <p class="font-mono text-[10px] tabular-nums text-vlc-muted">{formatDuration(wl.duration)}</p>
                </div>
                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
                  title="Add to queue"
                  aria-label={`Add ${wl.title} to the queue`}
                  on:click={() => playEntry(wl)}
                >
                  <Play size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
                  title="Remove from Watch Later"
                  aria-label={`Remove ${wl.title} from Watch Later`}
                  on:click={() => removeWatchLater(wl.id)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            {/each}
          </div>
        {/if}
        {#if filteredWatchLater.length === 0}
          <p class="py-4 text-center text-vlc-muted">Watch later list empty</p>
        {/if}
      </div>
    {:else}
    <!-- Panel 2: History -->
      <div role="tabpanel" id="panel-2" aria-labelledby="tab-2" class="flex-1 px-3 py-2">
        <div class="mb-2 flex items-center gap-1.5">
          <label class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-control border border-vlc-border bg-vlc-app px-2.5" aria-label="Search history">
            <Search size={14} strokeWidth={1.8} class="shrink-0 text-vlc-muted" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search history..."
              class="min-w-0 flex-1 bg-transparent text-[12px] text-vlc-text outline-none placeholder:text-vlc-muted"
              bind:value={searchQueries[2]}
            />
          </label>
          <SortMenu
            options={dateSortOptions}
            value={sortOptions[2]}
            onValueChange={(key) => (sortOptions[2] = key)}
            label="Sort history"
          />
          <ViewModeToggle
            value={tabViewModes[2]}
            onChange={(mode) => (tabViewModes[2] = mode)}
            options={['grid', 'list']}
            label="History view mode"
          />
        </div>

        {#if tabViewModes[2] === 'grid'}
          <div class="grid grid-cols-2 gap-x-3 gap-y-3 pb-2" role="group" aria-label="History, grid view">
            {#each filteredHistory as h (h.id)}
              <div
                class="group relative"
                role="group"
                draggable={Boolean(h.src)}
                title={`${h.title} — drag to the queue`}
                on:dragstart={(event) => startEntryDrag(event, h)}
                on:contextmenu={(event) => openHistoryContextMenu(event, h.id)}
              >
                <button
                  type="button"
                  class="block w-full text-left focus:outline-none"
                  aria-label={`Play ${h.title}`}
                  on:click={() => playEntry(h)}
                >
                  <div class="relative aspect-video w-full overflow-hidden rounded-lg border border-vlc-border bg-[linear-gradient(180deg,#1B1B1B_0%,#0E0E0E_100%)] transition-[border-color,filter] duration-150 group-hover:border-vlc-borderStrong group-hover:brightness-105 group-focus-within:border-vlc-orange/70">
                    {#if h.thumbnail}
                      <img src={h.thumbnail} alt="" class="h-full w-full object-cover" loading="lazy" draggable="false" />
                    {:else if h.type === 'music'}
                      <Music size={22} strokeWidth={1.8} class="text-white/25" aria-hidden="true" />
                    {:else if h.type === 'stream'}
                      <Radio size={22} strokeWidth={1.8} class="text-white/25" aria-hidden="true" />
                    {:else}
                      <Film size={22} strokeWidth={1.8} class="text-white/25" aria-hidden="true" />
                    {/if}
                    <span class="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-white/85">
                      {formatDuration(h.duration)}
                    </span>
                    {#if h.position > 0 && h.duration > 0}
                      <div class="absolute inset-x-0 bottom-0 h-[3px] bg-black/40" aria-hidden="true">
                        <div class="h-full bg-vlc-orange" style={`width: ${Math.min(100, (h.position / h.duration) * 100)}%`}></div>
                      </div>
                    {/if}
                  </div>
                  <p class="mt-2 truncate text-[11px] leading-4 text-vlc-text">{h.title}</p>
                  {#if h.artist}
                    <p class="truncate text-[10px] leading-4 text-vlc-muted">{h.artist}</p>
                  {/if}
                </button>
                <div class="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    class={cardActionClass}
                    title="Add to queue"
                    aria-label={`Add ${h.title} to the queue`}
                    on:click={() => playEntry(h)}
                  >
                    <Play size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class={cardActionClass}
                    title="Remove from history"
                    aria-label={`Remove ${h.title} from history`}
                    on:click={() => removeHistory(h.id)}
                  >
                    <X size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="mb-2 overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel" role="group" aria-label="History, list view">
            {#each filteredHistory as h (h.id)}
              <div
                class="group flex items-center gap-2 border-b border-vlc-border px-2 py-1.5 transition-colors last:border-b-0 hover:bg-vlc-raised"
                role="group"
                draggable={Boolean(h.src)}
                on:dragstart={(event) => startEntryDrag(event, h)}
                on:contextmenu={(event) => openHistoryContextMenu(event, h.id)}
              >
                <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-vlc-app flex items-center justify-center">
                  {#if h.thumbnail}
                    <img src={h.thumbnail} alt="" class="h-full w-full object-cover" loading="lazy" draggable="false" />
                  {:else if h.type === 'music'}
                    <Music size={16} class="text-vlc-muted" aria-hidden="true" />
                  {:else if h.type === 'stream'}
                    <Radio size={16} class="text-vlc-muted" aria-hidden="true" />
                  {:else}
                    <Film size={16} class="text-vlc-muted" aria-hidden="true" />
                  {/if}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] text-vlc-text">{h.title}</p>
                  {#if h.artist}
                    <p class="truncate text-[10px] text-vlc-muted">{h.artist}</p>
                  {/if}
                  <p class="font-mono text-[10px] tabular-nums text-vlc-muted">{formatDuration(h.duration)}</p>
                </div>
                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
                  title="Add to queue"
                  aria-label={`Add ${h.title} to the queue`}
                  on:click={() => playEntry(h)}
                >
                  <Play size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
                  title="Remove from history"
                  aria-label={`Remove ${h.title} from history`}
                  on:click={() => removeHistory(h.id)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            {/each}
          </div>
        {/if}
        {#if filteredHistory.length === 0}
          <p class="py-4 text-center text-vlc-muted">History empty</p>
        {/if}
        <div class="flex justify-center py-2">
          <button
            type="button"
            class="rounded-control border border-vlc-border bg-vlc-card px-3 py-1 text-sm text-vlc-text hover:bg-vlc-raised"
            on:click={clearHistory}
          >Clear All</button>
        </div>
      </div>
    {/if}
    </div>

    <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-vlc-border px-3 py-1.5">
      <span class="text-[10px] text-vlc-muted">Drag an item onto the queue to add it.</span>
      <span class="text-[10px] text-vlc-muted">{$player.queue.length} queued</span>
    </footer>
  </div>
{/if}

