<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Search } from 'lucide-svelte';

  export let placeholder = 'Search…';

  const dispatch = createEventDispatcher<{ search: string }>();

  let value = '';
  let timeout: ReturnType<typeof setTimeout>;

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
  <Search size={16} strokeWidth={1.75} class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-vlc-muted" />
  <input
    type="search"
    {placeholder}
    value={value}
    on:input={handleInput}
    class="h-10 w-full rounded-[8px] bg-vlc-card pl-11 pr-3 text-[14px] text-vlc-text border border-vlc-border focus:outline-none focus:ring-1 focus:ring-vlc-orange/40 placeholder:text-vlc-muted"
  />
</div>
