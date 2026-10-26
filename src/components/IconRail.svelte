<script lang="ts">
  import {
    History,
    Home,
    ListVideo,
    Music,
    Plus,
    Radio,
    Video,
  } from 'lucide-svelte';
  import {
    ADD_ITEM,
    NAV_ITEMS,
    type NavId,
    type RailItemId,
  } from '../lib/constants';

  export let active: NavId = 'home';
  export let onSelect: (id: RailItemId) => void = () => {};

  const iconComponents = {
    Home,
    Video,
    Music,
    Radio,
    ListVideo,
    History,
    Plus,
  };

  const railItems = [...NAV_ITEMS, ADD_ITEM];
</script>

<nav
  class="flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-vlc-border/40 bg-vlc-app py-2"
  aria-label="Primary navigation"
>
  {#each railItems as item (item.id)}
    <button
      type="button"
      class="relative flex h-10 w-10 items-center justify-center rounded-control text-[#8A8A8A] transition-colors hover:bg-vlc-card hover:text-white"
      class:text-vlc-orange={active === item.id}
      title={item.label}
      aria-label={item.label}
      aria-current={active === item.id ? 'page' : undefined}
      on:click={() => onSelect(item.id)}
    >
      {#if active === item.id}
        <span
          class="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-vlc-orange"
          aria-hidden="true"
        ></span>
      {/if}
      <svelte:component this={iconComponents[item.icon]} size={20} strokeWidth={1.75} />
    </button>
  {/each}
</nav>
