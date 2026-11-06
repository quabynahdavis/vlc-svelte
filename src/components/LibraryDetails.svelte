<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowLeft,
    Check,
    EyeOff,
    ListMusic,
    ListPlus,
    Play,
  } from 'lucide-svelte';
  import type { MediaItem } from '../lib/mock';
  import { isItemWatched, libraryImportLog, toggleItemWatched } from '../stores/library';
  import { addToQueue, type Track } from '../stores/player';
  import { openPlaylistTarget } from '../stores/playlistTarget';

  export let item: MediaItem;
  export let breadcrumb: string[] = [];
  export let onBack: () => void = () => {};
  export let onPlay: (item: MediaItem) => void = () => {};

  let backButton: HTMLButtonElement | null = null;

  $: progress = Math.min(Math.max(item.progress, 0), 1);
  $: progressPercent = `${progress * 100}%`;
  $: watched = isItemWatched(item);
  $: progressLabel = watched ? `${Math.round(progress * 100)}% watched` : 'Not started';
  $: episodeCode = `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`;
  $: durationLabel = formatDuration(item.durationSeconds);
  $: pathLabel = breadcrumb.join(' / ');
  $: hasSource = Boolean(item.src);
  // `description` is not part of the current MediaItem contract yet; read it
  // defensively so the panel picks it up when the mock or a future import adds it.
  $: description = (item as MediaItem & { description?: string }).description?.trim() ?? '';

  const primaryActionClass =
    'flex h-8 items-center gap-1.5 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-[var(--selection-ink)] transition-[filter,background-color] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-app disabled:cursor-not-allowed disabled:opacity-40';

  const secondaryActionClass =
    'flex h-8 items-center gap-1.5 rounded-control border border-vlc-border bg-vlc-card px-3 text-[12px] text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60 disabled:cursor-not-allowed disabled:opacity-40';

  onMount(() => {
    backButton?.focus();
  });

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

  function queueItem(): void {
    if (!hasSource) return;

    addToQueue(trackFromItem());
    libraryImportLog.set(`Queued ${item.title}`);
  }

  function addToPlaylist(event: MouseEvent): void {
    if (!hasSource) return;

    openPlaylistTarget(
      trackFromItem(),
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    );
  }

  function toggleWatched(): void {
    const wasWatched = watched;
    toggleItemWatched(item.id);
    libraryImportLog.set(
      wasWatched ? `Marked ${item.title} as unwatched` : `Marked ${item.title} as watched`,
    );
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="flex shrink-0 items-center gap-2 border-b border-vlc-border px-6 py-2.5">
    <button
      bind:this={backButton}
      type="button"
      class="flex h-7 items-center gap-1.5 rounded-control px-2 text-xs text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
      title="Back to library"
      aria-label="Back to library"
      on:click={onBack}
    >
      <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
      Back
    </button>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <div
      class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 lg:flex-row lg:items-start lg:gap-8"
    >
      <div class="w-full shrink-0 lg:max-w-[520px] lg:flex-1">
        <div
          class="relative aspect-video w-full overflow-hidden rounded-panel border border-vlc-border bg-[linear-gradient(180deg,#1B1B1B_0%,#0E0E0E_100%)]"
        >
          {#if item.thumbnailPath}
            <img
              src={item.thumbnailPath}
              alt=""
              class="h-full w-full object-cover"
              draggable="false"
            />
          {:else}
            <div class="flex h-full w-full items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-16 w-16 text-white opacity-[0.16]" fill="currentColor">
                <path d="M9 6.4v11.2L18.8 12 9 6.4Z" />
              </svg>
            </div>
          {/if}

          {#if watched}
            <div class="absolute inset-x-0 bottom-0 h-1 bg-black/45" aria-hidden="true">
              <div class="h-full bg-vlc-orange" style={`width: ${progressPercent}`}></div>
            </div>
          {/if}
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-medium uppercase tracking-[0.08em] text-vlc-muted">
          TV episode
        </p>

        <h1 class="mt-1.5 break-words text-xl font-semibold leading-tight text-vlc-text lg:text-2xl">
          {item.title}
        </h1>

        <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-vlc-secondary">
          <span class="tabular-nums">{episodeCode}</span>
          <span class="text-vlc-dim" aria-hidden="true">·</span>
          <span class="tabular-nums">{durationLabel}</span>
          <span class="text-vlc-dim" aria-hidden="true">·</span>
          <span class={watched ? 'text-vlc-orangeText' : 'text-vlc-muted'}>
            {watched ? 'Watched' : 'Unwatched'}
          </span>
        </div>

        <p class="mt-4 max-w-prose text-[13px] leading-5 text-vlc-secondary">
          {description || 'No description available for this item.'}
        </p>

        <dl class="mt-5 space-y-2 border-t border-vlc-border pt-4">
          <div class="flex items-center gap-3">
            <dt class="w-20 shrink-0 text-[11px] uppercase tracking-wide text-vlc-muted">Progress</dt>
            <dd class="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-vlc-secondary">
              <span
                class="h-[3px] w-28 shrink-0 overflow-hidden rounded-full bg-vlc-raised"
                aria-hidden="true"
              >
                <span class="block h-full rounded-full bg-vlc-orange" style={`width: ${progressPercent}`}
                ></span>
              </span>
              <span class="truncate tabular-nums text-vlc-muted">{progressLabel}</span>
            </dd>
          </div>

          <div class="flex items-baseline gap-3">
            <dt class="w-20 shrink-0 text-[11px] uppercase tracking-wide text-vlc-muted">Duration</dt>
            <dd class="min-w-0 text-[12px] tabular-nums text-vlc-secondary">{durationLabel}</dd>
          </div>

          <div class="flex items-baseline gap-3">
            <dt class="w-20 shrink-0 text-[11px] uppercase tracking-wide text-vlc-muted">Location</dt>
            <dd class="min-w-0 truncate text-[12px] text-vlc-secondary" title={pathLabel}>
              {pathLabel}
            </dd>
          </div>
        </dl>

        <div class="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class={primaryActionClass}
            disabled={!hasSource}
            title={hasSource ? `Play ${item.title}` : 'No playable source'}
            on:click={() => onPlay(item)}
          >
            <Play size={13} strokeWidth={2.2} class="translate-x-px" aria-hidden="true" />
            Play
          </button>

          <button
            type="button"
            class={secondaryActionClass}
            disabled={!hasSource}
            title={hasSource ? 'Add to queue' : 'No playable source'}
            on:click={queueItem}
          >
            <ListMusic size={13} strokeWidth={1.9} aria-hidden="true" />
            Queue
          </button>

          <button
            type="button"
            class={secondaryActionClass}
            disabled={!hasSource}
            title={hasSource ? 'Add to playlist' : 'No playable source'}
            on:click={addToPlaylist}
          >
            <ListPlus size={13} strokeWidth={1.9} aria-hidden="true" />
            Add to playlist
          </button>

          <button type="button" class={secondaryActionClass} on:click={toggleWatched}>
            {#if watched}
              <EyeOff size={13} strokeWidth={1.9} aria-hidden="true" />
              Mark unwatched
            {:else}
              <Check size={13} strokeWidth={2.2} aria-hidden="true" />
              Mark watched
            {/if}
          </button>
        </div>

        {#if !hasSource}
          <p class="mt-2 text-[11px] text-vlc-muted">
            No playable source is attached to this item.
          </p>
        {/if}
      </div>
    </div>
  </div>
</div>
