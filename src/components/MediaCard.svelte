<script lang="ts">
  import { ListMusic, ListPlus } from 'lucide-svelte';
  import { startTrackDrag } from '../lib/dragTrack';
  import type { MediaItem } from '../lib/mock';
  import { libraryImportLog } from '../stores/library';
  import { addToQueue, type Track } from '../stores/player';
  import { openPlaylistTarget } from '../stores/playlistTarget';

  export let item: MediaItem;
  export let onSelect: (item: MediaItem) => void = () => {};

  $: progress = Math.min(Math.max(item.progress, 0), 1);
  $: hasProgress = progress > 0;
  $: progressPercent = `${progress * 100}%`;

  const actionClass =
    'flex h-6 w-6 items-center justify-center rounded-[4px] bg-black/65 text-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-vlc-orange hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70';

  function trackFromItem(): Track {
    return {
      id: item.id,
      title: item.title,
      duration: item.durationSeconds,
      src: item.src ?? '',
    };
  }

  function handleDragStart(event: DragEvent): void {
    startTrackDrag(event, trackFromItem());
  }

  function queueItem(event: MouseEvent): void {
    event.stopPropagation();
    if (!item.src) return;

    addToQueue(trackFromItem());
    libraryImportLog.set(`Queued ${item.title}`);
  }

  function addToPlaylist(event: MouseEvent): void {
    event.stopPropagation();
    if (!item.src) return;

    openPlaylistTarget(
      trackFromItem(),
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    );
  }
</script>

<div
  class="group relative"
  role="group"
  aria-label={`${item.title} actions`}
  draggable={Boolean(item.src)}
  title={`${item.title} — drag to the queue`}
  on:dragstart={handleDragStart}
>
  <button
    type="button"
    class="block w-full cursor-pointer text-left focus:outline-none"
    aria-label={`Open ${item.title}. Drag to add to the queue.`}
    on:click={() => onSelect(item)}
  >
    <div
      class="relative aspect-video w-full overflow-hidden rounded-lg border border-vlc-border bg-[linear-gradient(180deg,#1B1B1B_0%,#0E0E0E_100%)] transition-[border-color,filter] duration-150 group-hover:border-vlc-borderStrong group-hover:brightness-105 group-focus-within:border-vlc-orange/70 group-focus-within:ring-1 group-focus-within:ring-vlc-orange/50"
    >
      {#if item.thumbnailPath}
        <img
          src={item.thumbnailPath}
          alt=""
          class="h-full w-full object-cover"
          loading="lazy"
          draggable="false"
        />
      {:else}
        <div class="flex h-full w-full items-center justify-center" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            class="h-9 w-9 text-white opacity-[0.18]"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9 6.4v11.2L18.8 12 9 6.4Z" />
          </svg>
        </div>
      {/if}

      {#if hasProgress}
        <div class="absolute inset-x-0 bottom-0 h-[2px] bg-black/40" aria-hidden="true">
          <div class="h-full bg-vlc-orange" style={`width: ${progressPercent}`}></div>
        </div>
      {/if}
    </div>

    <div class="mt-2.5 truncate text-[11px] leading-4 text-vlc-secondary">
      {item.title}
    </div>
  </button>

  <div
    class="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
  >
    <button
      type="button"
      class={actionClass}
      title="Add to queue"
      aria-label={`Add ${item.title} to the queue`}
      on:click={queueItem}
    >
      <ListMusic size={12} strokeWidth={2} aria-hidden="true" />
    </button>
    <button
      type="button"
      class={actionClass}
      title="Add to playlist"
      aria-label={`Add ${item.title} to a playlist`}
      on:click={addToPlaylist}
    >
      <ListPlus size={12} strokeWidth={2} aria-hidden="true" />
    </button>
  </div>
</div>
