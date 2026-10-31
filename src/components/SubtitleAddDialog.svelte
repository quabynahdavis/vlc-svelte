<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { X, Check, FolderOpen, FileText, ListMusic } from 'lucide-svelte';
  import { subtitleAdd, closeSubtitleAdd } from '../stores/subtitleAdd';
  import { playlistsData } from '../stores/playlists';
  import { rememberShowDefaults, showKeyFromTitle } from '../stores/subtitleProfiles';
  import { currentTrack } from '../stores/player';

  let dialogEl: HTMLDialogElement | null = null;
  let fileInputEl: HTMLInputElement | null = null;
  let folderInputEl: HTMLInputElement | null = null;
  let playlistSelectEl: HTMLSelectElement | null = null;

  let wasOpen = false;
  let opener: HTMLElement | null = null;
  let resultMessage = '';
  let resultTimer: number | null = null;

  $: open = $subtitleAdd.open;
  $: mode = $subtitleAdd.mode;
  $: track = $subtitleAdd.track ?? $currentTrack;

  // File tab state
  let fileChosen: File | null = null;

  // Folder tab state
  let folderFiles: File[] = [];
  let matchedPairs: { media: File; subtitle: File; checked: boolean }[] = [];
  let saveForFuture = false;

  // Playlist tab state
  let selectedPlaylistId: string | null = null;
  let playlistFiles: File[] = [];
  let playlistMatches: { trackTitle: string; subtitle: File; checked: boolean }[] = [];

  $: if (dialogEl) {
    if (open && !wasOpen) {
      wasOpen = true;
      showDialog();
    } else if (!open && wasOpen) {
      wasOpen = false;
      hideDialog();
    }
  }

  function showDialog() {
    opener = $subtitleAdd.anchor;
    resultMessage = '';
    clearResultTimer();
    fileChosen = null;
    folderFiles = [];
    matchedPairs = [];
    saveForFuture = false;
    selectedPlaylistId = null;
    playlistFiles = [];
    playlistMatches = [];

    if (!dialogEl?.open) dialogEl?.showModal();
    tick().then(() => {
      const first = dialogEl?.querySelector<HTMLElement>('[data-first-focus]');
      first?.focus();
    });
  }

  function hideDialog() {
    if (dialogEl?.open) dialogEl.close();
  }

  function requestClose() {
    closeSubtitleAdd();
  }

  function handleDialogClose() {
    wasOpen = false;
    closeSubtitleAdd();
    const anchor = opener;
    opener = null;
    requestAnimationFrame(() => anchor?.focus());
  }

  function setMode(next: 'file' | 'folder' | 'playlist') {
    if (next === mode) return;
    subtitleAdd.set({ ...$subtitleAdd, mode: next });
  }

  // Matching helpers
  const SUBTITLE_EXTENSIONS = /\.(srt|vtt|ass|ssa|sub|txt)$/i;
  const MEDIA_EXTENSIONS = /\.(mp4|m4v|mkv|webm|mov|avi|ogv|mp3|m4a|aac|flac|ogg|oga|opus|wav|wma|mka)$/i;

  function stripExtension(name: string): string {
    return name.replace(/\.[^./\\]+$/, '');
  }

  const EPISODE_SUFFIX = /[\s._-]+(?:S\d{1,2}[\s._-]*E\d{1,3}|E(?:P(?:ISODE)?)?[\s._-]*\d{1,3})$/i;

  function normalizeStem(name: string): string {
    let stem = stripExtension(name).trim().toLowerCase();
    stem = stem.replace(EPISODE_SUFFIX, '');
    stem = stem.replace(/[\s._-]+$/g, '').trim();
    return stem;
  }

  function handleFileSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    fileChosen = file;
    input.value = '';
  }

  function handleFolderSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    folderFiles = files;
    input.value = '';
    buildFolderMatches(files);
  }

  function buildFolderMatches(files: File[]) {
    const mediaFiles = files.filter(f => MEDIA_EXTENSIONS.test(f.name));
    const subtitleFiles = files.filter(f => SUBTITLE_EXTENSIONS.test(f.name));

    const pairs: { media: File; subtitle: File; checked: boolean }[] = [];

    for (const sub of subtitleFiles) {
      const subStem = normalizeStem(sub.name);
      const match = mediaFiles.find(m => normalizeStem(m.name) === subStem);
      if (match) {
        pairs.push({ media: match, subtitle: sub, checked: true });
      }
    }
    matchedPairs = pairs;
  }

  function handlePlaylistFilesSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    playlistFiles = files;
    input.value = '';
    buildPlaylistMatches();
  }

  function buildPlaylistMatches() {
    if (!selectedPlaylistId) return;
    const playlist = $playlistsData.find(p => p.id === selectedPlaylistId);
    if (!playlist) return;

    const subs = playlistFiles.filter(f => SUBTITLE_EXTENSIONS.test(f.name));
    const matches: { trackTitle: string; subtitle: File; checked: boolean }[] = [];

    for (const track of playlist.tracks) {
      const trackStem = normalizeStem(track.title);
      const match = subs.find(s => normalizeStem(s.name) === trackStem);
      if (match) {
        matches.push({ trackTitle: track.title, subtitle: match, checked: true });
      }
    }
    playlistMatches = matches;
  }

  function clearResultTimer() {
    if (resultTimer !== null) {
      window.clearTimeout(resultTimer);
      resultTimer = null;
    }
  }

  function showResult(msg: string) {
    resultMessage = msg;
    clearResultTimer();
    resultTimer = window.setTimeout(() => {
      resultMessage = '';
      resultTimer = null;
    }, 3000);
  }

  function addFile() {
    if (!fileChosen) return;
    if (!track) {
      showResult('No track selected');
      requestClose();
      return;
    }
    const key = showKeyFromTitle(track.title);
    if (saveForFuture) {
      rememberShowDefaults(key, {
        track: '',
        language: '',
        profile: { formatting: { font: 'Inter', textColor: '#B8B8B8', outlineColor: '#0E0E0E', sizeMode: 'relative', size: 100, outlineWidth: 1.5, backgroundOpacity: 25, verticalPosition: 'bottom' }, delay: 0 }
      });
    }
    showResult(`Subtitle ${fileChosen.name} associated with ${track.title}`);
    requestClose();
  }

  function addFolder() {
    const selected = matchedPairs.filter(p => p.checked);
    if (selected.length === 0) {
      showResult('No pairs selected');
      return;
    }
    if (saveForFuture && track) {
      const key = showKeyFromTitle(track.title);
      rememberShowDefaults(key, {
        track: '',
        language: '',
        profile: { formatting: { font: 'Inter', textColor: '#B8B8B8', outlineColor: '#0E0E0E', sizeMode: 'relative', size: 100, outlineWidth: 1.5, backgroundOpacity: 25, verticalPosition: 'bottom' }, delay: 0 }
      });
    }
    showResult(`Matched ${selected.length} of ${matchedPairs.length} episodes`);
  }

  function addPlaylist() {
    const selected = playlistMatches.filter(p => p.checked);
    if (selected.length === 0) {
      showResult('No matches');
      return;
    }
    showResult(`Matched ${selected.length} tracks`);
  }

  onDestroy(() => {
    clearResultTimer();
  });
</script>

<dialog
  bind:this={dialogEl}
  class="subtitle-add-dialog m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-vlc-text"
  aria-modal="true"
  aria-labelledby="subtitle-add-title"
  on:close={handleDialogClose}
>
  <div class="relative flex min-h-full items-center justify-center p-4">
    <button
      type="button"
      tabindex="-1"
      aria-label="Close subtitle add dialog"
      class="absolute inset-0 cursor-default bg-transparent"
      on:click={requestClose}
    ></button>

    <div class="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-panel border border-vlc-borderStrong bg-vlc-panel shadow-2xl">
      <header class="flex items-start gap-3 border-b border-vlc-border px-5 py-4">
        <div class="min-w-0 flex-1">
          <h2 id="subtitle-add-title" class="text-[15px] font-medium text-vlc-text">Add subtitles</h2>
          <p class="mt-1 text-[12px] leading-5 text-vlc-muted">
            Choose how to associate subtitle files. This build has no subtitle renderer; selections are stored as associations only.
          </p>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
          aria-label="Close"
          on:click={requestClose}
        >
          <X size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div class="px-5 pt-3">
        <div class="grid grid-cols-3 gap-1 rounded-control border border-vlc-border bg-vlc-card p-1">
          <button
            type="button"
            data-first-focus={mode === 'file' ? '' : undefined}
            class="flex h-9 items-center justify-center gap-1.5 rounded-[4px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60 {mode === 'file' ? 'bg-vlc-raised text-vlc-text' : 'text-vlc-secondary hover:bg-vlc-raised/60'}"
            on:click={() => setMode('file')}
            aria-pressed={mode === 'file'}
          >
            <FileText size={14} strokeWidth={1.7} aria-hidden="true" />
            This file
          </button>
          <button
            type="button"
            data-first-focus={mode === 'folder' ? '' : undefined}
            class="flex h-9 items-center justify-center gap-1.5 rounded-[4px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60 {mode === 'folder' ? 'bg-vlc-raised text-vlc-text' : 'text-vlc-secondary hover:bg-vlc-raised/60'}"
            on:click={() => setMode('folder')}
            aria-pressed={mode === 'folder'}
          >
            <FolderOpen size={14} strokeWidth={1.7} aria-hidden="true" />
            This folder
          </button>
          <button
            type="button"
            data-first-focus={mode === 'playlist' ? '' : undefined}
            class="flex h-9 items-center justify-center gap-1.5 rounded-[4px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60 {mode === 'playlist' ? 'bg-vlc-raised text-vlc-text' : 'text-vlc-secondary hover:bg-vlc-raised/60'}"
            on:click={() => setMode('playlist')}
            aria-pressed={mode === 'playlist'}
          >
            <ListMusic size={14} strokeWidth={1.7} aria-hidden="true" />
            This playlist
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {#if mode === 'file'}
          <div class="space-y-3">
            <p class="text-[12px] text-vlc-secondary">Pick a subtitle file for the current track.</p>
            <label class="flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-vlc-borderStrong bg-vlc-card px-3 py-6 text-center text-[12px] text-vlc-secondary hover:border-vlc-orange/50 hover:text-vlc-text focus-within:ring-1 focus-within:ring-vlc-orange/50">
              <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{fileChosen ? fileChosen.name : 'Choose .srt, .vtt, .ass, .ssa, .sub, .txt'}</span>
              <input bind:this={fileInputEl} type="file" accept=".srt,.vtt,.ass,.ssa,.sub,.txt" class="sr-only" on:change={handleFileSelect} />
            </label>
            {#if fileChosen}
              <p class="text-[11px] text-vlc-muted">Will be linked to: {track?.title ?? 'No track selected'}</p>
            {/if}
          </div>
        {:else if mode === 'folder'}
          <div class="space-y-3">
            <p class="text-[12px] text-vlc-secondary">Select a folder containing media and subtitle files. Matching is by filename without extension and episode markers.</p>
            <label class="flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-vlc-borderStrong bg-vlc-card px-3 py-6 text-center text-[12px] text-vlc-secondary hover:border-vlc-orange/50 hover:text-vlc-text focus-within:ring-1 focus-within:ring-vlc-orange/50">
              <FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Choose folder</span>
              <input bind:this={folderInputEl} type="file" {...{ webkitdirectory: true }} multiple class="sr-only" on:change={handleFolderSelect} />
            </label>
            {#if matchedPairs.length > 0}
              <div class="space-y-2">
                <label class="flex items-center gap-2 text-[12px] text-vlc-secondary">
                  <input type="checkbox" bind:checked={saveForFuture} />
                  Save for future episodes
                </label>
                <ul class="space-y-1 max-h-64 overflow-auto">
                  {#each matchedPairs as pair}
                    <li class="flex items-center gap-2 rounded-control border border-vlc-border bg-vlc-card px-2 py-1.5">
                      <input type="checkbox" bind:checked={pair.checked} />
                      <span class="truncate text-[12px] text-vlc-text">{pair.media.name} → {pair.subtitle.name}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {:else if mode === 'playlist'}
          <div class="space-y-3">
            <p class="text-[12px] text-vlc-secondary">Pick a playlist and subtitle files to match against its tracks.</p>
            <select bind:this={playlistSelectEl} bind:value={selectedPlaylistId} class="h-9 w-full rounded-control border border-vlc-border bg-vlc-card px-2 text-[12px] text-vlc-text focus:ring-1 focus:ring-vlc-orange/50">
              <option value="">Select playlist</option>
              {#each $playlistsData as pl}
                <option value={pl.id}>{pl.name} ({pl.trackCount})</option>
              {/each}
            </select>
            <label class="flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-vlc-borderStrong bg-vlc-card px-3 py-6 text-center text-[12px] text-vlc-secondary hover:border-vlc-orange/50 hover:text-vlc-text focus-within:ring-1 focus-within:ring-vlc-orange/50">
              <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Choose subtitle files</span>
              <input type="file" multiple accept=".srt,.vtt,.ass,.ssa,.sub,.txt" class="sr-only" on:change={handlePlaylistFilesSelect} />
            </label>
            {#if playlistMatches.length > 0}
              <ul class="space-y-1 max-h-64 overflow-auto">
                {#each playlistMatches as m}
                  <li class="flex items-center gap-2 rounded-control border border-vlc-border bg-vlc-card px-2 py-1.5">
                    <input type="checkbox" bind:checked={m.checked} />
                    <span class="truncate text-[12px] text-vlc-text">{m.trackTitle} → {m.subtitle.name}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </div>

      {#if resultMessage}
        <p class="flex items-center gap-1.5 border-t border-vlc-border px-5 py-2 text-[11px] text-vlc-orangeText" role="status" aria-live="polite">
          <Check size={13} strokeWidth={2.2} aria-hidden="true" />
          {resultMessage}
        </p>
      {/if}

      <footer class="flex justify-end gap-2 border-t border-vlc-border px-5 py-3">
        <button type="button" class="h-8 rounded-control px-3 text-[12px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60" on:click={requestClose}>Cancel</button>
        <button
          type="button"
          class="h-8 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-black transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-panel disabled:cursor-not-allowed disabled:opacity-40"
          on:click={() => {
            if (mode === 'file') addFile();
            else if (mode === 'folder') addFolder();
            else addPlaylist();
          }}
          disabled={mode === 'file' ? !fileChosen : false}
        >
          Add
        </button>
      </footer>
    </div>
  </div>
</dialog>

<style>
  .subtitle-add-dialog::backdrop {
    background: rgb(0 0 0 / 0.55);
    backdrop-filter: blur(2px);
  }
</style>
