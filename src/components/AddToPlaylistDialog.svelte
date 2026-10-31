<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { Check, ListMusic, Plus, X } from 'lucide-svelte';
  import {
    addTrackToPlaylist,
    createPlaylistWithTrack,
    playlistsData,
  } from '../stores/playlists';
  import {
    closePlaylistTarget,
    playlistTarget,
  } from '../stores/playlistTarget';
  import type { PlaylistTrack } from '../lib/mock';

  let dialogEl: HTMLDialogElement | null = null;
  let nameEl: HTMLInputElement | null = null;
  let newName = '';
  let creating = false;
  let addedTo = '';
  let wasOpen = false;
  let closeTimer: number | null = null;
  /** Opener captured at show time; requestClose resets the store's anchor. */
  let opener: HTMLElement | null = null;

  $: open = $playlistTarget.open;
  $: track = $playlistTarget.track;
  $: playlistTrack = track
    ? ({
        id: track.id,
        title: track.title,
        artist: track.artist ?? 'Unknown artist',
        durationSeconds: track.duration,
        source: track.src,
      } satisfies PlaylistTrack)
    : null;

  $: if (dialogEl) {
    if (open && !wasOpen) {
      wasOpen = true;
      showDialog();
    } else if (!open && wasOpen) {
      wasOpen = false;
      hideDialog();
    }
  }

  function clearCloseTimer(): void {
    if (closeTimer === null) return;
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  function scheduleClose(): void {
    clearCloseTimer();
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      requestClose();
    }, 650);
  }

  onDestroy(clearCloseTimer);

  async function showDialog(): Promise<void> {
    clearCloseTimer();
    opener = $playlistTarget.anchor;
    newName = '';
    creating = false;
    addedTo = '';

    if (!dialogEl?.open) dialogEl?.showModal();
    await tick();
    const firstTarget =
      dialogEl?.querySelector<HTMLElement>('[data-add-target-first]') ?? nameEl;
    firstTarget?.focus();
  }

  function hideDialog(): void {
    if (dialogEl?.open) dialogEl.close();
  }

  function requestClose(): void {
    clearCloseTimer();
    closePlaylistTarget();
  }

  function handleDialogClose(): void {
    clearCloseTimer();

    // A queued close event from the previous close can arrive after a new
    // request already reopened the dialog. Leave that open state alone.
    if (open) return;

    wasOpen = false;

    // requestClose() resets the store before this event fires, so restore
    // focus from the opener captured when the dialog was shown.
    const anchor = opener;
    opener = null;
    closePlaylistTarget();

    if (anchor?.isConnected) requestAnimationFrame(() => anchor.focus());
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    requestClose();
  }

  function addTo(playlistId: string, playlistName: string): void {
    if (!playlistTrack) return;

    const added = addTrackToPlaylist(playlistId, playlistTrack);
    addedTo = added
      ? `Added to ${playlistName}`
      : `Already in ${playlistName}`;

    if (added) {
      // Keep the dialog open briefly so the result is visible, then close.
      scheduleClose();
    }
  }

  function createAndAdd(event: SubmitEvent): void {
    event.preventDefault();
    if (!playlistTrack) return;

    const name = newName.trim();
    if (!name) {
      nameEl?.focus();
      return;
    }

    creating = true;
    const playlist = createPlaylistWithTrack(name, playlistTrack);
    addedTo = `Created ${playlist.name}`;
    scheduleClose();
  }
</script>

<dialog
  bind:this={dialogEl}
  class="add-to-playlist-dialog m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-vlc-text"
  aria-modal="true"
  aria-labelledby="add-to-playlist-title"
  on:cancel={handleCancel}
  on:close={handleDialogClose}
>
  <div class="relative flex min-h-full items-center justify-center p-4">
    <button
      type="button"
      tabindex="-1"
      aria-label="Close add to playlist dialog"
      class="absolute inset-0 cursor-default bg-transparent"
      on:click={requestClose}
    ></button>

    <div
      class="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-panel border border-vlc-borderStrong bg-vlc-panel shadow-2xl"
    >
      <header class="flex items-start gap-3 border-b border-vlc-border px-5 py-4">
        <div class="min-w-0 flex-1">
          <h2 id="add-to-playlist-title" class="text-[15px] font-medium text-vlc-text">
            Add to playlist
          </h2>
          <p class="mt-1 truncate text-[12px] leading-5 text-vlc-muted" title={track?.title}>
            {track?.title ?? 'Nothing selected'}
          </p>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
          title="Close"
          aria-label="Close add to playlist dialog"
          on:click={requestClose}
        >
          <X size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {#if $playlistsData.length === 0}
          <p class="px-3 py-6 text-center text-[12px] text-vlc-muted">
            No playlists yet. Create one below.
          </p>
        {:else}
          <ul class="space-y-0.5" aria-label="Playlists">
            {#each $playlistsData as playlist (playlist.id)}
              <li>
                <button
                  type="button"
                  data-add-target-first={playlist.id === $playlistsData[0]?.id ? '' : undefined}
                  class="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left transition-colors hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                  on:click={() => addTo(playlist.id, playlist.name)}
                >
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] bg-vlc-raised text-vlc-muted"
                    aria-hidden="true"
                  >
                    <ListMusic size={15} strokeWidth={1.75} />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px] text-vlc-text">{playlist.name}</span>
                    <span class="text-[11px] text-vlc-muted">
                      {playlist.trackCount} {playlist.trackCount === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                  <Plus size={14} strokeWidth={2} class="shrink-0 text-vlc-muted" aria-hidden="true" />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <form class="border-t border-vlc-border px-4 py-3" on:submit={createAndAdd}>
        <label for="add-to-playlist-new" class="mb-1.5 block text-[11px] text-vlc-muted">
          New playlist
        </label>
        <div class="flex gap-1.5">
          <input
            id="add-to-playlist-new"
            bind:this={nameEl}
            bind:value={newName}
            type="text"
            maxlength={80}
            autocomplete="off"
            spellcheck="false"
            placeholder="Playlist name"
            disabled={creating}
            class="h-9 min-w-0 flex-1 rounded-control border border-vlc-border bg-vlc-card px-2.5 text-[12px] text-vlc-text outline-none placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50"
          />
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            class="flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-black transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vlc-orange disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
            Create
          </button>
        </div>
      </form>

      {#if addedTo}
        <p
          class="flex items-center gap-1.5 border-t border-vlc-border px-4 py-2 text-[11px] text-vlc-orangeText"
          role="status"
          aria-live="polite"
        >
          <Check size={13} strokeWidth={2.2} aria-hidden="true" />
          {addedTo}
        </p>
      {/if}
    </div>
  </div>
</dialog>

<style>
  .add-to-playlist-dialog::backdrop {
    background: rgb(0 0 0 / 0.55);
    backdrop-filter: blur(2px);
  }
</style>
