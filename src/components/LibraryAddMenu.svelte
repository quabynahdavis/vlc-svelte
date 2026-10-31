<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { FilePlus2, FolderPlus, Plus, Radio, X } from 'lucide-svelte';
  import {
    addImportedItems,
    createLibraryItemId,
    libraryImportLog,
    updateLibraryItemDuration,
    type LibraryImportEntry,
  } from '../stores/library';

  const MEDIA_EXTENSIONS =
    /\.(mp4|m4v|mkv|webm|mov|avi|ogv|mp3|m4a|aac|flac|ogg|oga|opus|wav|wma|mka)$/i;

  const menuItemClass =
    'flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50';

  let rootEl: HTMLDivElement;
  let triggerEl: HTMLButtonElement;
  let menuEl: HTMLDivElement;
  let fileInputEl: HTMLInputElement;
  let folderInputEl: HTMLInputElement;
  let streamInputEl: HTMLInputElement;

  let menuOpen = false;
  let streamOpen = false;
  let streamValue = '';
  let streamError = '';

  async function toggleMenu(): Promise<void> {
    if (menuOpen) {
      closeMenu(true);
      return;
    }

    streamOpen = false;
    streamError = '';
    menuOpen = true;

    await tick();
    menuEl?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }

  function closeMenu(refocus = false): void {
    if (!menuOpen) return;
    menuOpen = false;

    if (!refocus) return;
    requestAnimationFrame(() => triggerEl?.focus());
  }

  function closeStream(refocus = false): void {
    if (!streamOpen) return;
    streamOpen = false;
    streamError = '';

    if (!refocus) return;
    requestAnimationFrame(() => triggerEl?.focus());
  }

  function closeAll(refocus = false): void {
    const wasOpen = menuOpen || streamOpen;
    menuOpen = false;
    streamOpen = false;
    streamError = '';

    if (!refocus || !wasOpen) return;
    requestAnimationFrame(() => triggerEl?.focus());
  }

  function handleMenuKeydown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const items = Array.from(menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = 0;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === 'End') nextIndex = items.length - 1;

    items[nextIndex]?.focus();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (!menuOpen && !streamOpen) return;

    event.preventDefault();
    closeAll(true);
  }

  function handleWindowClick(event: MouseEvent): void {
    if (!menuOpen && !streamOpen) return;

    // Use the dispatch-time path: the menu item that opened the stream dialog
    // may already be detached by the time this window-level handler runs.
    if (event.composedPath().includes(rootEl)) return;

    closeAll(false);
  }

  function handleMenuFocusOut(event: FocusEvent): void {
    if (!menuOpen) return;

    const next = event.relatedTarget;
    if (next === triggerEl) return;
    if (next instanceof Node && menuEl?.contains(next)) return;

    menuOpen = false;
  }

  /**
   * The shell menu can request a picker without knowing where the add button
   * lives; the library toolbar forwards the request to this menu.
   */
  function handleShellOpen(event: Event): void {
    const detail = (event as CustomEvent<'file' | 'folder' | 'network'>).detail;

    if (detail === 'file') openFilePicker();
    else if (detail === 'folder') openFolderPicker();
    else if (detail === 'network') void openStreamDialog();
  }

  // The shell menu has no direct reference to this component, so it asks for a
  // picker through a window event. A native listener keeps the Svelte typings
  // happy for the custom event name.
  onMount(() => {
    window.addEventListener('vlc-open-media', handleShellOpen);
    return () => window.removeEventListener('vlc-open-media', handleShellOpen);
  });

  function openFilePicker(): void {
    closeMenu(false);
    triggerEl?.focus();
    fileInputEl?.click();
  }

  function openFolderPicker(): void {
    closeMenu(false);
    triggerEl?.focus();
    folderInputEl?.click();
  }

  async function openStreamDialog(): Promise<void> {
    menuOpen = false;
    streamOpen = true;
    streamError = '';
    streamValue = '';

    await tick();
    streamInputEl?.focus();
  }

  function isSupportedMedia(file: File): boolean {
    return (
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/') ||
      MEDIA_EXTENSIONS.test(file.name)
    );
  }

  function titleFromFileName(name: string): string {
    const withoutExtension = name.replace(/\.[^./\\]+$/, '').trim();
    return withoutExtension || name;
  }

  function safeDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function titleFromStreamUrl(url: URL): string {
    const lastSegment = url.pathname.split('/').filter(Boolean).pop();
    const fromPath = lastSegment
      ? safeDecode(lastSegment).replace(/\.[a-z0-9]{2,5}$/i, '').trim()
      : '';

    return fromPath || url.hostname || 'Network stream';
  }

  function parseStreamUrl(raw: string): URL | null {
    if (!/^(https?|rtsp):\/\//i.test(raw)) return null;

    try {
      const url = new URL(raw);
      if (!url.hostname) return null;
      if (!['http:', 'https:', 'rtsp:'].includes(url.protocol)) return null;
      return url;
    } catch {
      return null;
    }
  }

  /**
   * Read duration with a detached <video> so the library row can show a real
   * time without blocking the import. The probe uses its own object URL and
   * revokes it once metadata loads (or fails); the item keeps the URL that was
   * created for playback.
   */
  function probeDuration(file: File, id: string): void {
    const probeUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    video.preload = 'metadata';

    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(probeUrl);
    };

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        updateLibraryItemDuration(id, video.duration);
      }
      cleanup();
    };

    video.onerror = cleanup;
    video.src = probeUrl;
  }

  function importFiles(files: FileList | null, source: 'file' | 'folder'): void {
    const selected = files ? Array.from(files) : [];
    const supported = selected.filter(isSupportedMedia);

    if (supported.length === 0) {
      libraryImportLog.set(
        selected.length > 0 ? 'No supported media files in selection' : 'No files selected',
      );
      return;
    }

    const entries: LibraryImportEntry[] = supported.map((file) => ({
      id: createLibraryItemId(),
      title: titleFromFileName(file.name),
      durationSeconds: 0,
      progress: 0,
      src: URL.createObjectURL(file),
    }));

    addImportedItems(entries);
    supported.forEach((file, index) => probeDuration(file, entries[index].id));

    const skipped = selected.length - supported.length;
    const noun = supported.length === 1 ? 'file' : 'files';
    const origin = source === 'folder' ? ' from folder' : '';
    const skippedLabel = skipped > 0 ? `, skipped ${skipped}` : '';
    libraryImportLog.set(`Added ${supported.length} ${noun}${origin}${skippedLabel}`);
  }

  function handleFileChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    importFiles(input.files, 'file');
    input.value = '';
    triggerEl?.focus();
  }

  function handleFolderChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    importFiles(input.files, 'folder');
    input.value = '';
    triggerEl?.focus();
  }

  function submitStream(): void {
    const raw = streamValue.trim();
    const url = parseStreamUrl(raw);

    if (!url) {
      streamError = 'Enter a valid http(s):// or rtsp:// URL.';
      libraryImportLog.set('Invalid stream URL');
      return;
    }

    const title = titleFromStreamUrl(url);
    addImportedItems([
      {
        id: createLibraryItemId(),
        title,
        durationSeconds: 0,
        progress: 0,
        src: url.href,
      },
    ]);
    libraryImportLog.set(`Added stream: ${title}`);
    closeStream(true);
  }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} />

<div class="relative" bind:this={rootEl}>
  <button
    type="button"
    bind:this={triggerEl}
    class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
    title="Add media"
    aria-label="Add media"
    data-library-add
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    aria-controls={menuOpen ? 'library-add-menu' : undefined}
    on:click={toggleMenu}
  >
    <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
  </button>

  {#if menuOpen}
    <div
      id="library-add-menu"
      bind:this={menuEl}
      role="menu"
      tabindex="-1"
      aria-label="Add media"
      class="absolute right-0 top-full z-30 mt-1 w-52 rounded-control border border-vlc-borderStrong bg-vlc-panel p-1 shadow-2xl"
      on:keydown={handleMenuKeydown}
      on:focusout={handleMenuFocusOut}
    >
      <p class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-vlc-muted">
        Add to library
      </p>

      <button type="button" role="menuitem" tabindex="-1" class={menuItemClass} on:click={openFilePicker}>
        <FilePlus2 size={14} strokeWidth={1.75} class="text-vlc-muted" aria-hidden="true" />
        <span class="flex-1">Add file…</span>
      </button>

      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        class={menuItemClass}
        on:click={openFolderPicker}
      >
        <FolderPlus size={14} strokeWidth={1.75} class="text-vlc-muted" aria-hidden="true" />
        <span class="flex-1">Add folder…</span>
      </button>

      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        class={menuItemClass}
        on:click={openStreamDialog}
      >
        <Radio size={14} strokeWidth={1.75} class="text-vlc-muted" aria-hidden="true" />
        <span class="flex-1">Add network stream…</span>
      </button>
    </div>
  {/if}

  {#if streamOpen}
    <div
      class="absolute right-0 top-full z-30 mt-1 w-80 rounded-control border border-vlc-borderStrong bg-vlc-panel p-3 shadow-2xl"
      role="dialog"
      aria-modal="false"
      aria-labelledby="library-stream-title"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <h2 id="library-stream-title" class="text-xs font-medium text-vlc-text">Network stream</h2>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
          aria-label="Close network stream dialog"
          on:click={() => closeStream(true)}
        >
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <form on:submit|preventDefault={submitStream}>
        <label for="library-stream-url" class="mb-1 block text-[11px] text-vlc-secondary">
          Stream URL
        </label>
        <input
          id="library-stream-url"
          bind:this={streamInputEl}
          bind:value={streamValue}
          type="text"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="https://… or rtsp://…"
          class="h-8 w-full rounded-input border border-vlc-border bg-vlc-card px-2 text-xs text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/40 focus:ring-1 focus:ring-vlc-orange/40"
          aria-invalid={streamError ? 'true' : undefined}
          aria-describedby={streamError ? 'library-stream-error' : undefined}
          on:input={() => (streamError = '')}
        />

        {#if streamError}
          <p id="library-stream-error" role="alert" class="mt-1 text-[11px] text-vlc-danger">
            {streamError}
          </p>
        {/if}

        <div class="mt-3 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-control border border-vlc-border bg-vlc-card px-2.5 py-1 text-[11px] text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
            on:click={() => closeStream(true)}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-control bg-vlc-orange px-2.5 py-1 text-[11px] font-medium text-black transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-panel"
          >
            Add stream
          </button>
        </div>
      </form>
    </div>
  {/if}

  <input
    bind:this={fileInputEl}
    class="hidden"
    type="file"
    multiple
    accept="video/*,audio/*"
    tabindex="-1"
    aria-label="Choose media files"
    on:change={handleFileChange}
  />
  <input
    bind:this={folderInputEl}
    class="hidden"
    type="file"
    {...{ webkitdirectory: true }}
    multiple
    tabindex="-1"
    aria-label="Choose a folder of media files"
    on:change={handleFolderChange}
  />
</div>
