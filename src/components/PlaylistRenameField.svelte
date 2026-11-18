<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Check, X } from 'lucide-svelte';

  export let value = '';
  export let error = '';
  export let label = 'Playlist name';

  const dispatch = createEventDispatcher<{ commit: void; cancel: void; input: void }>();

  const MAX_NAME_LENGTH = 80;

  let inputEl: HTMLInputElement | null = null;

  onMount(() => {
    inputEl?.focus();
    inputEl?.select();
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dispatch('cancel');
  }
</script>

<form class="flex w-full min-w-0 flex-col" on:submit|preventDefault={() => dispatch('commit')}>
  <div class="flex min-w-0 items-center gap-1">
    <input
      bind:this={inputEl}
      bind:value
      type="text"
      maxlength={MAX_NAME_LENGTH}
      autocomplete="off"
      spellcheck="false"
      aria-label={label}
      aria-invalid={error.length > 0}
      aria-describedby={error ? 'playlist-rename-error' : undefined}
      class="h-8 min-w-0 flex-1 rounded-control border bg-vlc-card px-2 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50 {error
        ? 'border-vlc-danger'
        : 'border-vlc-border'}"
      on:input={() => dispatch('input')}
      on:keydown={handleKeydown}
    />
    <button
      type="submit"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70"
      title="Save name"
      aria-label="Save playlist name"
    >
      <Check size={14} strokeWidth={2} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70"
      title="Cancel"
      aria-label="Cancel rename"
      on:click={() => dispatch('cancel')}
    >
      <X size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  </div>
  {#if error}
    <p id="playlist-rename-error" class="mt-1 text-[11px] text-vlc-danger" role="alert">
      {error}
    </p>
  {/if}
</form>
