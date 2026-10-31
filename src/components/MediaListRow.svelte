<script lang="ts">
  import { ListMusic, ListPlus, Play } from 'lucide-svelte';
  import { startTrackDrag } from '../lib/dragTrack';
  import type { MediaItem } from '../lib/mock';
  import { libraryImportLog } from '../stores/library';
  import { addToQueue, type Track } from '../stores/player';
  import { openPlaylistTarget } from '../stores/playlistTarget';

  export let item: MediaItem;
  export let mode: 'list' | 'compact' = 'list';
  export let onSelect: (item: MediaItem) => void = () => {};
  export let selected = false;

  $: progress = Math.min(Math.max(item.progress, 0), 1);
  $: hasProgress = progress > 0;
  $: progressPercent = `${progress * 100}%`;
  $: progressLabel = `${Math.round(progress * 100)}% watched`;
  $: episodeCode = `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`;
  $: durationLabel = formatDuration(item.durationSeconds);
  $: ariaLabel = `Play ${item.title}, ${episodeCode}, ${durationLabel}${hasProgress ? `, ${progressLabel}` : ''}`;

  const actionClass =
    'flex h-6 w-6 items-center justify-center rounded-[4px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60';

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
  class="group relative border-b border-vlc-border last:border-b-0"
  role="group"
  aria-label={`${item.title} actions`}
  draggable={Boolean(item.src)}
  on:dragstart={handleDragStart}
>
  <button
    type="button"
    class="relative flex w-full items-center gap-3 text-left transition-colors hover:bg-vlc-raised focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vlc-orange/70 {mode ===
    'list'
      ? 'h-[72px] px-4'
      : 'h-10 px-4'} {selected ? 'bg-vlc-raised' : ''}"
    aria-label={ariaLabel}
    aria-current={selected ? 'true' : undefined}
    title={item.title}
    on:click={() => onSelect(item)}
  >
    {#if mode === 'list'}
      <span
        class="relative flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-vlc-border bg-vlc-panel-alt"
        aria-hidden="true"
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
          <Play size={16} strokeWidth={1.75} class="text-vlc-dim" aria-hidden="true" />
        {/if}
      </span>

      <span class="min-w-0 flex-1">
        <span class="block truncate text-[13px] leading-4 text-vlc-text">{item.title}</span>

        <span class="mt-1 flex items-center gap-1.5 text-[11px] leading-4 text-vlc-secondary">
          <span class="tabular-nums">{episodeCode}</span>
          <span class="text-vlc-dim" aria-hidden="true">·</span>
          <span class="tabular-nums">{durationLabel}</span>
          {#if hasProgress}
            <span class="text-vlc-dim" aria-hidden="true">·</span>
            <span class="text-vlc-muted">{progressLabel}</span>
          {/if}
        </span>

        <span
          class="mt-2 block h-[3px] w-full max-w-xs overflow-hidden rounded-full bg-vlc-raised"
          aria-hidden="true"
        >
          <span class="block h-full rounded-full bg-vlc-orange" style={`width: ${progressPercent}`}
          ></span>
        </span>
      </span>

      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-vlc-border bg-vlc-card text-vlc-secondary transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
        aria-hidden="true"
      >
        <Play size={13} strokeWidth={2} class="translate-x-px" />
      </span>
    {:else}
      <span class="flex w-4 shrink-0 justify-center text-vlc-dim" aria-hidden="true">
        <Play size={11} strokeWidth={2} />
      </span>

      <span class="min-w-0 flex-1 truncate text-xs text-vlc-text">{item.title}</span>

      <span
        class="hidden w-16 shrink-0 text-[11px] tabular-nums text-vlc-secondary sm:block"
        aria-hidden="true"
      >
        {episodeCode}
      </span>

      <span class="hidden w-24 shrink-0 items-center gap-2 sm:flex" aria-hidden="true">
        <span class="h-[2px] flex-1 overflow-hidden rounded-full bg-vlc-raised">
          <span class="block h-full bg-vlc-orange" style={`width: ${progressPercent}`}></span>
        </span>
        <span class="w-7 text-right text-[10px] tabular-nums text-vlc-muted">
          {hasProgress ? `${Math.round(progress * 100)}%` : '—'}
        </span>
      </span>

      <span class="w-12 shrink-0 text-right text-[11px] tabular-nums text-vlc-muted">
        {durationLabel}
      </span>

      <span
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-vlc-muted transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
        aria-hidden="true"
      >
        <Play size={12} strokeWidth={2} class="translate-x-px" />
      </span>
    {/if}
  </button>

  <div
    class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-control bg-vlc-panel/90 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
  >
    <button
      type="button"
      class={actionClass}
      title="Add to queue"
      aria-label={`Add ${item.title} to the queue`}
      on:click={queueItem}
    >
      <ListMusic size={13} strokeWidth={1.9} aria-hidden="true" />
    </button>
    <button
      type="button"
      class={actionClass}
      title="Add to playlist"
      aria-label={`Add ${item.title} to a playlist`}
      on:click={addToPlaylist}
    >
      <ListPlus size={13} strokeWidth={1.9} aria-hidden="true" />
    </button>
  </div>
</div>
