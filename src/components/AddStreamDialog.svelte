<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { Link2, X } from 'lucide-svelte';
  import {
    addSavedStream,
    describeStreamUrlError,
    updateSavedStream,
    type SavedStream,
  } from '../stores/network';

  export let open = false;
  export let mode: 'add' | 'edit' = 'add';
  /** Stream being edited when mode is 'edit'. */
  export let stream: SavedStream | null = null;
  /** Element that opened the dialog; focus returns here when it closes. */
  export let returnFocusTo: HTMLElement | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    saved: { stream: SavedStream; message: string };
  }>();

  let dialogEl: HTMLDialogElement | null = null;
  let urlEl: HTMLInputElement | null = null;

  let url = '';
  let name = '';
  let urlTouched = false;
  let submitAttempted = false;
  let serverError = '';
  let returnFocus: HTMLElement | null = null;
  let wasOpen = false;

  $: urlError = describeStreamUrlError(url);
  $: showUrlError = (urlTouched || submitAttempted) && urlError !== null;
  $: visibleError = showUrlError ? urlError : serverError || null;
  $: canSubmit = urlError === null;

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

    urlTouched = false;
    submitAttempted = false;
    serverError = '';

    if (mode === 'edit' && stream) {
      url = stream.url;
      name = stream.name;
    } else {
      url = '';
      name = '';
    }

    if (!dialogEl?.open) dialogEl?.showModal();
    await tick();
    urlEl?.focus();
    if (mode === 'edit') urlEl?.select();
  }

  function hideDialog() {
    if (dialogEl?.open) dialogEl.close();
  }

  function requestClose() {
    dispatch('close');
  }

  function handleDialogClose() {
    wasOpen = false;
    dispatch('close');

    // Prefer the latest trigger prop: the parent may replace a trigger that
    // disappears after a successful save.
    const target = returnFocusTo ?? returnFocus;
    returnFocus = null;
    requestAnimationFrame(() => target?.focus());
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    requestClose();
  }

  function clearServerError() {
    serverError = '';
  }

  function handleUrlBlur() {
    urlTouched = true;
  }

  function submit() {
    submitAttempted = true;
    if (urlError) {
      urlEl?.focus();
      return;
    }

    if (mode === 'edit' && stream) {
      const result = updateSavedStream(stream.id, { url, name });
      if (!result.ok) {
        serverError = result.error;
        urlEl?.focus();
        return;
      }
      dispatch('saved', { stream: result.stream, message: 'Stream updated' });
      return;
    }

    const result = addSavedStream({ url, name });
    if (!result.ok) {
      serverError = result.error;
      urlEl?.focus();
      return;
    }

    dispatch('saved', {
      stream: result.stream,
      message: result.duplicate ? 'Stream already saved' : 'Stream added',
    });
  }

  /**
   * Enter always submits when the URL is valid. When it is not, show the
   * inline error instead of silently doing nothing because the button is
   * disabled while invalid.
   */
  function handleEnter(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();

    if (canSubmit) {
      submit();
    } else {
      submitAttempted = true;
      urlTouched = true;
      urlEl?.focus();
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  class="add-stream-dialog m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-vlc-text"
  aria-labelledby="add-stream-title"
  on:cancel={handleCancel}
  on:close={handleDialogClose}
>
  <div class="relative flex min-h-full items-center justify-center p-4">
    <!-- Native dialogs do not expose backdrop clicks; this full-viewport
         button closes on pointer interaction without joining the tab order. -->
    <button
      type="button"
      tabindex="-1"
      aria-label="Close stream dialog"
      class="absolute inset-0 cursor-default bg-transparent"
      on:click={requestClose}
    ></button>

    <form
      class="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-[460px] flex-col overflow-hidden rounded-panel border border-vlc-borderStrong bg-vlc-panel shadow-2xl"
      novalidate
      on:submit|preventDefault={submit}
    >
      <header class="flex items-start gap-3 border-b border-vlc-border px-5 py-4">
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-vlc-border bg-vlc-card text-vlc-secondary"
          aria-hidden="true"
        >
          <Link2 size={17} strokeWidth={1.75} />
        </span>
        <div class="min-w-0 flex-1">
          <h2 id="add-stream-title" class="text-[15px] font-medium text-vlc-text">
            {mode === 'edit' ? 'Edit stream' : 'Add stream'}
          </h2>
          <p class="mt-1 text-[12px] leading-5 text-vlc-muted">
            {mode === 'edit'
              ? 'Update the address or display name of this saved stream.'
              : 'Save a radio, podcast or video stream for quick access.'}
          </p>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-panel"
          title="Close"
          aria-label="Close stream dialog"
          on:click={requestClose}
        >
          <X size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <label
            for="add-stream-url"
            class="mb-1.5 block text-[12px] font-medium text-vlc-secondary"
          >
            Stream URL <span class="text-vlc-danger" aria-hidden="true">*</span>
          </label>
          <input
            id="add-stream-url"
            bind:this={urlEl}
            bind:value={url}
            on:input={clearServerError}
            on:blur={handleUrlBlur}
            on:keydown={handleEnter}
            type="url"
            required
            maxlength={2048}
            autocomplete="url"
            spellcheck="false"
            placeholder="https://example.com/stream"
            class="h-10 w-full rounded-control border bg-vlc-card px-3 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50 {visibleError
              ? 'border-vlc-danger'
              : 'border-vlc-border'}"
            aria-required="true"
            aria-invalid={visibleError !== null}
            aria-describedby={visibleError ? 'add-stream-url-error' : 'add-stream-url-hint'}
          />
          {#if visibleError}
            <p id="add-stream-url-error" class="mt-1 text-[11px] text-vlc-danger" role="alert">
              {visibleError}
            </p>
          {:else}
            <p id="add-stream-url-hint" class="mt-1 text-[11px] text-vlc-muted">
              HTTP, HTTPS, RTSP, RTMP or MMS. Required.
            </p>
          {/if}
        </div>

        <div>
          <label
            for="add-stream-name"
            class="mb-1.5 block text-[12px] font-medium text-vlc-secondary"
          >
            Name <span class="font-normal text-vlc-muted">(optional)</span>
          </label>
          <input
            id="add-stream-name"
            bind:value={name}
            on:input={clearServerError}
            on:keydown={handleEnter}
            type="text"
            maxlength={120}
            autocomplete="off"
            spellcheck="false"
            placeholder="My favourite station"
            class="h-10 w-full rounded-control border border-vlc-border bg-vlc-card px-3 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50"
            aria-describedby="add-stream-name-hint"
          />
          <p id="add-stream-name-hint" class="mt-1 text-[11px] text-vlc-muted">
            Defaults to the stream host and file name.
          </p>
        </div>
      </div>

      <footer class="flex justify-end gap-2 border-t border-vlc-border px-5 py-3">
        <button
          type="button"
          class="h-8 rounded-control px-3 text-[12px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-panel"
          on:click={requestClose}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          class="h-8 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-vlc-orangeDeep transition-[filter,background-color] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-panel disabled:cursor-not-allowed disabled:opacity-40"
        >
          {mode === 'edit' ? 'Save changes' : 'Add stream'}
        </button>
      </footer>
    </form>
  </div>
</dialog>

<style>
  .add-stream-dialog::backdrop {
    background: rgb(var(--bg-app-rgb) / 0.72);
    backdrop-filter: blur(2px);
  }
</style>
