<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { Upload, X } from 'lucide-svelte';
  import type { Playlist, PlaylistTrack } from '../lib/mock';

  export let open = false;
  /** Element that opened the dialog; focus returns here when it closes. */
  export let returnFocusTo: HTMLElement | null = null;

  const dispatch = createEventDispatcher<{ close: void; create: Playlist }>();

  const MAX_NAME_LENGTH = 80;
  const PROBE_TIMEOUT_MS = 8000;

  let dialogEl: HTMLDialogElement | null = null;
  let nameEl: HTMLInputElement | null = null;
  let fileInputEl: HTMLInputElement | null = null;

  let name = '';
  let files: File[] = [];
  let nameTouched = false;
  let creating = false;

  /** Focus target captured when the dialog opens (the "Create Playlist" button). */
  let returnFocus: HTMLElement | null = null;
  /** Invalidates in-flight duration probes when the dialog is closed. */
  let session = 0;
  let wasOpen = false;

  $: nameInvalid = name.trim().length === 0;
  $: showNameError = nameTouched && nameInvalid;
  $: if (dialogEl) {
    if (open && !wasOpen) {
      wasOpen = true;
      showDialog();
    } else if (!open && wasOpen) {
      wasOpen = false;
      hideDialog();
    }
  }

  async function showDialog() {
    returnFocus =
      returnFocusTo ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    session += 1;
    name = '';
    files = [];
    nameTouched = false;
    creating = false;
    if (fileInputEl) fileInputEl.value = '';

    if (!dialogEl?.open) dialogEl?.showModal();
    await tick();
    nameEl?.focus();
  }

  function hideDialog() {
    if (dialogEl?.open) dialogEl.close();
  }

  function requestClose() {
    if (creating) {
      // Cancel any pending probe so no playlist is created after closing.
      session += 1;
    }
    dispatch('close');
  }

  function handleDialogClose() {
    wasOpen = false;
    session += 1;
    dispatch('close');

    const target = returnFocus;
    returnFocus = null;
    requestAnimationFrame(() => target?.focus());
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    requestClose();
  }

  function handleNameInput() {
    nameTouched = true;
  }

  function handleNameBlur() {
    nameTouched = true;
  }

  function handleFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    files = Array.from(input.files ?? []);
    // Reset the native field so choosing the same file again still fires change.
    input.value = '';
  }

  function clearFiles() {
    files = [];
    if (fileInputEl) fileInputEl.value = '';
  }

  function makeId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function titleFromFilename(filename: string): string {
    const withoutExtension = filename.replace(/\.[^./\\]+$/, '');
    return withoutExtension || filename;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  /**
   * Probe duration with a temporary <video> element. The probe URL is revoked
   * immediately; the playback URL is created separately when the track is
   * built, so it stays valid for this session.
   */
  function probeDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const media = document.createElement('video');
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (duration: number) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        media.removeAttribute('src');
        media.load();
        URL.revokeObjectURL(objectUrl);
        resolve(duration);
      };

      timer = setTimeout(() => finish(0), PROBE_TIMEOUT_MS);
      media.preload = 'metadata';
      media.onloadedmetadata = () => {
        finish(Number.isFinite(media.duration) ? Math.max(0, Math.round(media.duration)) : 0);
      };
      media.onerror = () => finish(0);
      media.src = objectUrl;
    });
  }

  async function handleSubmit() {
    nameTouched = true;
    if (nameInvalid || creating) {
      nameEl?.focus();
      return;
    }

    creating = true;
    const token = session;
    // Snapshot the form so edits made while metadata loads cannot desync the
    // probe results from the tracks that are eventually created.
    const selectedFiles = files;
    const playlistName = name.trim();

    try {
      const durations = await Promise.all(selectedFiles.map((file) => probeDuration(file)));
      if (token !== session) return;

      const tracks: PlaylistTrack[] = selectedFiles.map((file, index) => ({
        id: makeId('pt'),
        title: titleFromFilename(file.name),
        artist: 'Imported',
        durationSeconds: durations[index] ?? 0,
        source: URL.createObjectURL(file),
      }));

      const playlist: Playlist = {
        id: makeId('pl'),
        name: playlistName,
        trackCount: tracks.length,
        totalDurationSeconds: tracks.reduce((total, track) => total + track.durationSeconds, 0),
        lastModified: Date.now(),
        tracks,
      };

      dispatch('create', playlist);
    } finally {
      if (token === session) creating = false;
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  class="create-playlist-dialog m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-vlc-text"
  aria-modal="true"
  aria-labelledby="create-playlist-title"
  on:cancel={handleCancel}
  on:close={handleDialogClose}
>
  <div class="relative flex min-h-full items-center justify-center p-4">
    <!-- Keyboard users dismiss with Escape (native dialog cancel); this
         full-viewport button handles pointer clicks on the backdrop. -->
    <button
      type="button"
      tabindex="-1"
      aria-label="Close create playlist dialog"
      class="absolute inset-0 cursor-default bg-transparent"
      on:click={requestClose}
    ></button>
    <form
      class="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-panel border border-vlc-borderStrong bg-vlc-panel shadow-2xl"
      on:submit|preventDefault={handleSubmit}
    >
      <header class="flex items-start gap-3 border-b border-vlc-border px-5 py-4">
        <div class="min-w-0 flex-1">
          <h2 id="create-playlist-title" class="text-[15px] font-medium text-vlc-text">
            Create playlist
          </h2>
          <p class="mt-1 text-[12px] leading-5 text-vlc-muted">
            Give it a name and optionally add media files.
          </p>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
          title="Close"
          aria-label="Close create playlist dialog"
          on:click={requestClose}
        >
          <X size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <label
            for="create-playlist-name"
            class="mb-1.5 block text-[12px] font-medium text-vlc-secondary"
          >
            Name
          </label>
          <input
            id="create-playlist-name"
            bind:this={nameEl}
            bind:value={name}
            type="text"
            required
            maxlength={MAX_NAME_LENGTH}
            autocomplete="off"
            spellcheck="false"
            placeholder="My playlist"
            disabled={creating}
            class="h-10 w-full rounded-control border border-vlc-border bg-vlc-card px-3 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-60 {showNameError
              ? 'border-vlc-danger'
              : ''}"
            aria-invalid={showNameError}
            aria-describedby={showNameError ? 'create-playlist-name-error' : 'create-playlist-name-hint'}
            on:input={handleNameInput}
            on:blur={handleNameBlur}
          />
          {#if showNameError}
            <p id="create-playlist-name-error" class="mt-1 text-[11px] text-vlc-danger" role="alert">
              Enter a playlist name.
            </p>
          {:else}
            <p id="create-playlist-name-hint" class="mt-1 text-[11px] text-vlc-muted">
              Required · {name.length}/{MAX_NAME_LENGTH} characters
            </p>
          {/if}
        </div>

        <div>
          <span class="mb-1.5 block text-[12px] font-medium text-vlc-secondary">
            Files <span class="font-normal text-vlc-muted">(optional)</span>
          </span>
          <label
            class="flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-vlc-borderStrong bg-vlc-card px-3 py-4 text-center text-[12px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-within:ring-1 focus-within:ring-vlc-orange/50 {creating
              ? 'pointer-events-none opacity-50'
              : ''}"
          >
            <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>
              {files.length === 0
                ? 'Choose audio or video files'
                : `${files.length} file${files.length === 1 ? '' : 's'} selected`}
            </span>
            <input
              bind:this={fileInputEl}
              type="file"
              multiple
              accept="audio/*,video/*"
              disabled={creating}
              class="sr-only"
              on:change={handleFiles}
            />
          </label>

          {#if files.length > 0}
            <div class="mt-2 flex items-start justify-between gap-3">
              <ul class="min-w-0 flex-1 space-y-1">
                {#each files as file, index (file.name + '-' + index)}
                  <li class="flex min-w-0 items-center gap-2 text-[11px] text-vlc-secondary">
                    <span class="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
                    <span class="shrink-0 text-vlc-muted">{formatFileSize(file.size)}</span>
                  </li>
                {/each}
              </ul>
              <button
                type="button"
                disabled={creating}
                class="shrink-0 rounded-input px-2 py-1 text-[11px] text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60 disabled:cursor-not-allowed disabled:opacity-40"
                on:click={clearFiles}
              >
                Clear
              </button>
            </div>
          {/if}
        </div>
      </div>

      <footer class="flex justify-end gap-2 border-t border-vlc-border px-5 py-3">
        <button
          type="button"
          class="h-8 rounded-control px-3 text-[12px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
          on:click={requestClose}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={nameInvalid || creating}
          class="h-8 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-[var(--selection-ink)] transition-colors hover:bg-vlc-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-panel disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? 'Creating…' : 'Create playlist'}
        </button>
      </footer>
    </form>
  </div>
</dialog>

<style>
  .create-playlist-dialog::backdrop {
    background: rgb(var(--bg-app-rgb) / 0.72);
    backdrop-filter: blur(2px);
  }
</style>
