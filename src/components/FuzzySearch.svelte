<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Search } from 'lucide-svelte';

  export let placeholder = 'Search…';
  /** Accessible name; defaults to the placeholder text. */
  export let label = '';

  const dispatch = createEventDispatcher<{ search: string }>();

  let value = '';
  let timeout: ReturnType<typeof setTimeout>;

  $: ariaLabel = label || placeholder;

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    value = target.value;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      dispatch('search', value.trim().toLowerCase());
    }, 200);
  }
</script>

<div class="relative w-full">
  <Search
    size={14}
    strokeWidth={1.75}
    class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-vlc-muted"
    aria-hidden="true"
  />
  <input
    type="search"
    {placeholder}
    aria-label={ariaLabel}
    value={value}
    on:input={handleInput}
    class="h-8 w-full rounded-input border border-vlc-border bg-vlc-card pl-8 pr-3 text-xs text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/40 focus:ring-1 focus:ring-vlc-orange/40"
  />
</div>
