<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    ArrowDownUp,
    ArrowLeft,
    Ellipsis,
    ExternalLink,
    LayoutGrid,
    ListMusic,
    Search,
    X,
  } from 'lucide-svelte';
  import { isTrackDrag, readTrackDrag } from '../lib/dragTrack';
  import { addToQueue, playAt, player } from '../stores/player';

  const dispatch = createEventDispatcher<{ back: void; close: void }>();

  let dragActive = false;

  function handleDragOver(event: DragEvent): void {
    if (!isTrackDrag(event)) {
      // Let unrelated drags (files, text, tabs) fall through untouched.
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

  function formatDuration(seconds: number): string {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }
</script>

<aside
  class="flex h-full w-[300px] shrink-0 flex-col border-r border-vlc-border bg-vlc-panel"
  aria-label="Playlists"
>
  <header class="flex h-11 shrink-0 items-center gap-2 border-b border-vlc-border px-3">
    <button
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text"
      title="Back"
      aria-label="Back"
      on:click={() => dispatch('back')}
    >
      <ArrowLeft size={16} strokeWidth={1.75} />
    </button>

    <h2 class="min-w-0 flex-1 truncate text-[13px] font-medium text-vlc-text">Playlists</h2>

    <div class="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text"
        title="More options"
        aria-label="More options"
      >
        <Ellipsis size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text"
        title="Open in new window"
        aria-label="Open in new window"
      >
        <ExternalLink size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text"
        title="Close playlist"
        aria-label="Close playlist"
        on:click={() => dispatch('close')}
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
  </header>

  <div class="flex h-10 shrink-0 items-center justify-between border-b border-vlc-border px-4">
    <span class="text-[11px] text-vlc-secondary">{$player.queue.length} items</span>

    <div class="flex items-center gap-3">
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-control text-vlc-muted transition-colors hover:text-vlc-text"
        title="Sort"
        aria-label="Sort playlists"
      >
        <ArrowDownUp size={18} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-control text-vlc-muted transition-colors hover:text-vlc-text"
        title="Grid view"
        aria-label="Grid view"
      >
        <LayoutGrid size={18} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-control text-vlc-muted transition-colors hover:text-vlc-text"
        title="Search playlists"
        aria-label="Search playlists"
      >
        <Search size={18} strokeWidth={1.6} />
      </button>
    </div>
  </div>

  <div
    class="relative min-h-0 flex-1 overflow-y-auto px-2 py-2 transition-colors {dragActive
      ? 'bg-vlc-orange/5'
      : ''}"
    role="region"
    aria-label="Queue drop target"
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
  >
    {#if dragActive}
      <div
        class="pointer-events-none sticky top-0 z-10 mx-1 mb-1 flex items-center justify-center gap-1.5 rounded-control border border-dashed border-vlc-orange/60 bg-vlc-panel/95 px-2 py-2 text-[11px] text-vlc-orangeText shadow-sm"
        role="status"
      >
        <ListMusic size={13} strokeWidth={2} aria-hidden="true" />
        Drop to add to the queue
      </div>
    {/if}

    {#if $player.queue.length === 0}
      <p class="px-3 py-4 text-[12px] text-vlc-muted">
        The queue is empty. Open a video from the library to start playback.
      </p>
    {:else}
      <div class="space-y-0.5">
        {#each $player.queue as track, index (track.id)}
          <button
            type="button"
            class="flex h-9 w-full items-center gap-3 rounded-control px-3 text-left text-[13px] transition-colors"
            class:bg-vlc-raised={$player.currentIndex === index}
            class:text-vlc-text={$player.currentIndex === index}
            class:text-vlc-secondary={$player.currentIndex !== index}
            class:hover:bg-vlc-raised={$player.currentIndex !== index}
            class:hover:text-vlc-text={$player.currentIndex !== index}
            aria-current={$player.currentIndex === index ? 'true' : undefined}
            title={track.title}
            on:click={() => playAt(index)}
          >
            <ListMusic
              size={16}
              strokeWidth={1.75}
              class={`shrink-0 ${$player.currentIndex === index ? 'text-vlc-orangeText' : ''}`}
            />
            <span class="min-w-0 flex-1 truncate">{track.title}</span>
            <span class="shrink-0 text-[11px] tabular-nums text-vlc-muted">
              {formatDuration(track.duration)}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</aside>
