<script lang="ts">
  import { ListMusic, Search, Trash2, GripVertical, MoreHorizontal, CheckSquare, Square, ArrowUpDown } from 'lucide-svelte';
  import { isTrackDrag, readTrackDrag } from '../../lib/dragTrack';
  import { addToQueue, clearQueue, moveQueueItem, playAt, player, removeFromQueue, removeFromQueueMany } from '../../stores/player';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let dragActive = false;
  let search = '';
  let sortBy: 'number' | 'title' | 'duration' | 'artist' = 'number';
  let sortAsc = true;
  let selected = new Set<number>();
  let dragIndex: number | null = null;
  let showContextFor: number | null = null;

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  function formatDuration(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '--:--';
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  }

  $: queue = $player.queue;
  $: filtered = queue
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.artist ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'title') cmp = a.t.title.localeCompare(b.t.title);
      else if (sortBy === 'duration') cmp = a.t.duration - b.t.duration;
      else if (sortBy === 'artist') cmp = (a.t.artist ?? '').localeCompare(b.t.artist ?? '');
      else cmp = a.i - b.i;
      return sortAsc ? cmp : -cmp;
    });

  function handleDragOver(event: DragEvent): void {
    if (!isTrackDrag(event)) {
      dragActive = false;
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dragActive = true;
  }

  function handleDragLeave(event: DragEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    dragActive = false;
  }

  function handleDrop(event: DragEvent): void {
    if (!isTrackDrag(event)) {
      dragActive = false;
      return;
    }
    event.preventDefault();
    dragActive = false;
    const track = readTrackDrag(event);
    if (track) addToQueue(track);
  }

  function toggleSelectAll() {
    if (selected.size === queue.length) {
      selected = new Set();
    } else {
      selected = new Set(queue.map((_, i) => i));
    }
  }

  function toggleSelect(index: number) {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    selected = next;
  }

  function clearSelection() {
    selected = new Set();
  }

  function removeSelected() {
    const indices = Array.from(selected).sort((a, b) => b - a);
    removeFromQueueMany(indices);
    clearSelection();
  }

  function handleDragStart(event: DragEvent, index: number) {
    dragIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-queue-move', String(index));
    }
  }

  function handleDragOverItem(event: DragEvent, index: number) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function handleDropItem(event: DragEvent, index: number) {
    event.preventDefault();
    const from = event.dataTransfer?.getData('application/x-queue-move');
    if (from) {
      const fromIndex = Number(from);
      if (!Number.isNaN(fromIndex) && fromIndex !== index) {
        moveQueueItem(fromIndex, index);
      }
    }
    dragIndex = null;
  }

  function openContext(index: number) {
    showContextFor = index;
  }

  function closeContext() {
    showContextFor = null;
  }
</script>

<div
  class="flex min-h-full flex-col"
  data-queue-panel
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  {#if dragActive}
    <div
      class="pointer-events-none sticky top-0 z-10 mx-2 mb-2 flex items-center justify-center gap-1.5 rounded-control border border-dashed border-vlc-orange/60 bg-vlc-panel/95 px-2 py-2 text-[11px] text-vlc-orangeText shadow-sm"
      role="status"
    >
      <ListMusic size={13} strokeWidth={2} aria-hidden="true" />
      Drop to add to the queue
    </div>
  {/if}

  <div class="sticky top-0 z-10 border-b border-vlc-border bg-vlc-panel px-3 py-2">
    <div class="flex items-center gap-2">
      <div class="relative flex-1">
        <Search size={14} strokeWidth={1.8} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-vlc-muted" aria-hidden="true" />
        <input
          class="h-8 w-full rounded-control border border-vlc-border bg-vlc-app pl-8 pr-2 text-[12px] text-vlc-text placeholder:text-vlc-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
          placeholder="Search queue"
          bind:value={search}
        />
      </div>
      <button
        class="flex h-8 items-center gap-1 rounded-control border border-vlc-border bg-vlc-app px-2 text-[11px] text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text"
        on:click={() => {
          sortBy = sortBy === 'number' ? 'title' : sortBy === 'title' ? 'duration' : sortBy === 'duration' ? 'artist' : 'number';
        }}
        title="Change sort"
      >
        <ArrowUpDown size={14} strokeWidth={1.8} />
        {sortBy}
      </button>
      <button
        class="flex h-8 items-center gap-1 rounded-control border border-vlc-border bg-vlc-app px-2 text-[11px] text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text"
        on:click={() => { sortAsc = !sortAsc; }}
        title="Toggle sort direction"
      >
        {sortAsc ? '↑' : '↓'}
      </button>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-control border border-vlc-border bg-vlc-app text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text"
        title="Clear queue"
        on:click={clearQueue}
      >
        <Trash2 size={14} strokeWidth={1.8} />
      </button>
    </div>
    <div class="mt-2 flex items-center gap-2">
      <button
        class="flex h-6 items-center gap-1 rounded-control text-[11px] text-vlc-secondary hover:text-vlc-text"
        on:click={toggleSelectAll}
      >
        {#if selected.size === queue.length && queue.length > 0}
          <CheckSquare size={14} strokeWidth={1.8} />
        {:else}
          <Square size={14} strokeWidth={1.8} />
        {/if}
        Select all
      </button>
      {#if selected.size > 0}
        <button
          class="ml-auto flex h-6 items-center gap-1 rounded-control bg-vlc-raised px-2 text-[11px] text-vlc-text hover:bg-vlc-card"
          on:click={removeSelected}
        >
          <Trash2 size={12} strokeWidth={1.8} /> Remove {selected.size}
        </button>
      {/if}
    </div>
  </div>

  {#if queue.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <ListMusic size={28} strokeWidth={1.4} class="text-vlc-muted/60" aria-hidden="true" />
      <p class="text-[13px] leading-5 text-vlc-muted">Queue is empty</p>
    </div>
  {:else if filtered.length === 0}
    <div class="flex flex-1 items-center justify-center px-6 py-16 text-center text-[13px] text-vlc-muted">
      No matches
    </div>
  {:else}
    <ul class="py-1" aria-label="Playing queue">
      {#each filtered as { t, i } (t.id)}
        {@const active = $player.currentIndex === i}
        {@const isSelected = selected.has(i)}
        <li
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, i)}
          on:dragover={(e) => handleDragOverItem(e, i)}
          on:drop={(e) => handleDropItem(e, i)}
          class="group relative"
        >
          <div
            class="relative flex h-12 w-full items-center gap-2 px-3 text-left transition-colors {active ? 'bg-vlc-raised' : 'hover:bg-vlc-panelAlt'}"
          >
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-control text-vlc-muted hover:bg-vlc-raised hover:text-vlc-text"
              on:click={() => toggleSelect(i)}
              aria-label="Select"
            >
              {#if isSelected}
                <CheckSquare size={14} strokeWidth={1.8} />
              {:else}
                <Square size={14} strokeWidth={1.8} />
              {/if}
            </button>

            <button
              type="button"
              class="flex h-6 w-6 cursor-grab items-center justify-center rounded-control text-vlc-muted opacity-0 transition-opacity group-hover:opacity-100"
              draggable="false"
              aria-label="Drag to reorder"
            >
              <GripVertical size={14} strokeWidth={1.8} />
            </button>

            <button
              type="button"
              class="relative flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vlc-orange/40"
              on:click={() => playAt(i)}
            >
              {#if active}
                <span class="absolute inset-y-0 left-0 w-[2px] bg-vlc-orange" aria-hidden="true" />
              {/if}
              <span class="w-5 shrink-0 text-[11px] tabular-nums" class:text-vlc-orangeText={active} class:text-vlc-muted={!active}>
                {i + 1}
              </span>
              <span class="min-w-0 flex-1 truncate text-[13px] leading-5" class:text-vlc-orangeText={active} class:text-vlc-secondary={!active}>
                {t.title}
              </span>
              <span class="shrink-0 font-mono text-[11px] tabular-nums" class:text-vlc-secondary={active} class:text-vlc-muted={!active}>
                {formatDuration(t.duration)}
              </span>
            </button>

            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-muted hover:bg-vlc-raised hover:text-vlc-text"
              on:click={() => openContext(i)}
              aria-label="More"
            >
              <MoreHorizontal size={16} strokeWidth={1.8} />
            </button>

            {#if showContextFor === i}
              <div
                class="absolute right-3 top-12 z-20 w-48 rounded-control border border-vlc-border bg-vlc-panel p-1 shadow-xl"
                role="menu"
                on:mouseleave={closeContext}
              >
                <button
                  class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text"
                  on:click={() => { playAt(i); closeContext(); }}
                >Play</button>
                <button
                  class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text"
                  on:click={() => { removeFromQueue(i); closeContext(); }}
                >Remove</button>
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
