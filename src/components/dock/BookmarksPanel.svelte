<script lang="ts">
  import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-svelte';
  import { currentTrack, player, seek } from '../../stores/player';
  import {
    addBookmark,
    bookmarks,
    formatTimestamp,
    mediaKeyFor,
    removeBookmark,
  } from '../../stores/bookmarks';

  // Placeholder chapters until real chapter metadata is exposed by the media
  // engine. Each marker is scaled to the current item's duration.
  const chapterTemplates = [
    { label: 'Intro', ratio: 0 },
    { label: 'Act One', ratio: 0.15 },
    { label: 'Act Two', ratio: 0.4 },
    { label: 'Act Three', ratio: 0.7 },
    { label: 'Credits', ratio: 0.92 },
  ] as const;

  let draftLabel = '';

  $: mediaKey = mediaKeyFor($currentTrack);
  $: duration = $player.duration > 0 ? $player.duration : 0;
  $: canSeek = duration > 0;
  $: canAdd = mediaKey !== null && canSeek;
  $: currentPosition = canSeek ? clamp($player.currentTime, 0, duration) : 0;
  $: currentTimeLabel = formatTimestamp(currentPosition);
  $: mediaBookmarks = mediaKey
    ? $bookmarks
        .filter((bookmark) => bookmark.mediaKey === mediaKey)
        .sort((a, b) => a.time - b.time)
    : [];
  $: chapters = chapterTemplates.map((chapter) => ({
    label: chapter.label,
    time: duration * chapter.ratio,
  }));

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function handleAdd(): void {
    if (!mediaKey || !canSeek) return;
    addBookmark(mediaKey, currentPosition, draftLabel);
    draftLabel = '';
  }

  function handleJump(time: number): void {
    if (!canSeek) return;
    seek(clamp(time, 0, duration));
  }
</script>

<div class="space-y-3" data-bookmarks-panel>
  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4">
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Add Bookmark</h3>
      {#if $currentTrack}
        <span class="shrink-0 text-[11px] tabular-nums text-vlc-muted">{currentTimeLabel}</span>
      {/if}
    </div>

    <form class="mt-3 space-y-2" on:submit|preventDefault={handleAdd}>
      <label
        for="bookmark-label"
        class="block text-[11px] font-medium uppercase tracking-wide text-vlc-muted"
      >
        Label (optional)
      </label>
      <input
        id="bookmark-label"
        bind:value={draftLabel}
        maxlength={120}
        placeholder={`e.g. Chapter at ${currentTimeLabel}`}
        disabled={!canAdd}
        class="h-9 w-full rounded-[6px] border border-vlc-border/70 bg-vlc-app px-3 text-[12px] text-vlc-secondary outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!canAdd}
        class="flex h-9 w-full items-center justify-center gap-2 rounded-[6px] border border-vlc-orange/50 bg-vlc-orange/10 px-3 text-[12px] font-medium text-vlc-orangeText transition-colors hover:bg-vlc-orange/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-vlc-orange/10"
      >
        <BookmarkPlus size={15} strokeWidth={1.8} aria-hidden="true" />
        Add bookmark at current position
      </button>
    </form>

    {#if !$currentTrack}
      <p class="mt-2 text-[11px] leading-4 text-vlc-muted">
        No media loaded — load a track or video first.
      </p>
    {:else if !canSeek}
      <p class="mt-2 text-[11px] leading-4 text-vlc-muted">
        This item has no known duration yet.
      </p>
    {/if}
  </section>

  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4">
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Bookmarks</h3>
      {#if $currentTrack}
        <span class="shrink-0 text-[11px] tabular-nums text-vlc-muted">
          {mediaBookmarks.length}
        </span>
      {/if}
    </div>

    {#if !$currentTrack}
      <p class="mt-2 text-[12px] leading-5 text-vlc-muted">
        No media loaded. Bookmarks appear for the item you are playing.
      </p>
    {:else if mediaBookmarks.length === 0}
      <div
        class="mt-3 rounded-[8px] border border-dashed border-vlc-border bg-vlc-app/60 px-3 py-4 text-center"
      >
        <Bookmark size={18} strokeWidth={1.6} class="mx-auto text-vlc-muted" aria-hidden="true" />
        <p class="mt-1.5 text-[12px] leading-5 text-vlc-secondary">No bookmarks yet</p>
        <p class="text-[11px] leading-4 text-vlc-muted">Mark the current position to create one.</p>
      </div>
    {:else}
      <ul class="mt-3 space-y-1.5">
        {#each mediaBookmarks as bookmark (bookmark.id)}
          <li class="flex items-center gap-1 rounded-[8px] border border-vlc-border bg-vlc-app p-1">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSeek}
              title={`Seek to ${formatTimestamp(bookmark.time)}`}
              on:click={() => handleJump(bookmark.time)}
            >
              <span class="shrink-0 text-[11px] font-medium tabular-nums text-vlc-orangeText">
                {formatTimestamp(bookmark.time)}
              </span>
              <span class="min-w-0 truncate text-[12px] text-vlc-secondary">{bookmark.label}</span>
            </button>
            <button
              type="button"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-vlc-muted transition-colors hover:bg-vlc-danger/10 hover:text-vlc-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
              aria-label={`Delete bookmark ${bookmark.label}`}
              title="Delete bookmark"
              on:click={() => removeBookmark(bookmark.id)}
            >
              <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>

      {#if !canSeek}
        <p class="mt-2 text-[11px] leading-4 text-vlc-muted">
          Seeking is unavailable until the duration is known.
        </p>
      {/if}
    {/if}
  </section>

  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4">
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Chapters</h3>
      <span class="shrink-0 text-[11px] leading-4 text-vlc-muted">Demo</span>
    </div>
    <p class="mt-1 text-[11px] leading-4 text-vlc-muted">
      Placeholder markers scale with the current duration.
    </p>

    <ul class="mt-3 space-y-1">
      {#each chapters as chapter (chapter.label)}
        <li>
          <button
            type="button"
            class="flex h-9 w-full items-center justify-between gap-3 rounded-[6px] px-2 text-left transition-colors hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSeek}
            on:click={() => handleJump(chapter.time)}
          >
            <span class="min-w-0 truncate text-[13px] text-vlc-secondary">{chapter.label}</span>
            <span class="shrink-0 text-[11px] tabular-nums text-vlc-muted">
              {canSeek ? formatTimestamp(chapter.time) : '—'}
            </span>
          </button>
        </li>
      {/each}
    </ul>

    {#if !canSeek}
      <p class="mt-2 text-[11px] leading-4 text-vlc-muted">
        Chapter markers appear when the item reports a duration.
      </p>
    {/if}
  </section>
</div>
