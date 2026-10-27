<script lang="ts">
  import {
    History,
    Home,
    ListVideo,
    Music,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Radio,
    Video,
  } from 'lucide-svelte';
  import type { ComponentType } from 'svelte';
  import {
    ADD_ITEM,
    NAV_ITEMS,
    type NavId,
    type RailItemId,
  } from '../lib/constants';

  export let active: NavId = 'home';
  export let expanded = false;
  export let onSelect: (id: RailItemId) => void = () => {};
  export let onExpandedChange: (value: boolean) => void = () => {};

  const iconComponents: Record<string, ComponentType> = {
    Home,
    Video,
    Music,
    Radio,
    ListVideo,
    History,
    Plus,
  };

  const railItems = [...NAV_ITEMS, ADD_ITEM];

  function toggleExpanded(): void {
    expanded = !expanded;
    onExpandedChange(expanded);
  }
</script>

<nav
  class="flex h-full shrink-0 flex-col overflow-hidden border-r border-vlc-border/60 bg-vlc-app transition-[width] duration-200 ease-out"
  class:w-16={!expanded}
  class:w-[200px]={expanded}
  data-expanded={expanded}
  aria-label="Primary navigation"
>
  <div class="flex min-h-0 flex-1 flex-col gap-1 p-2">
    {#each railItems as item (item.id)}
      {#if expanded && item.id === 'add'}
        <div class="mx-2 my-1.5 h-px shrink-0 bg-vlc-border/70" aria-hidden="true"></div>
      {/if}

      <button
        type="button"
        class="group relative flex h-10 shrink-0 items-center rounded-control transition-colors duration-150 hover:bg-vlc-raised"
        class:w-10={!expanded}
        class:justify-center={!expanded}
        class:w-full={expanded}
        class:gap-3={expanded}
        class:px-4={expanded}
        class:bg-vlc-card={active === item.id}
        title={item.label}
        aria-label={item.label}
        aria-current={active === item.id ? 'page' : undefined}
        data-rail-item={item.id}
        on:click={() => onSelect(item.id)}
      >
        <span
          class="flex shrink-0 items-center justify-center transition-colors duration-150"
          class:text-vlc-orangeText={active === item.id}
          class:text-vlc-dim={active !== item.id}
          class:group-hover:text-vlc-secondary={active !== item.id}
        >
          <svelte:component this={iconComponents[item.icon]} size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>

        {#if expanded}
          <span
            class="min-w-0 truncate text-[14px] leading-5 transition-colors duration-150"
            class:text-vlc-text={active === item.id}
            class:text-vlc-secondary={active !== item.id}
            class:group-hover:text-vlc-text={active !== item.id}
          >
            {item.label}
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="flex shrink-0 p-2" class:justify-center={!expanded}>
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-control text-vlc-muted transition-colors duration-150 hover:bg-vlc-raised hover:text-vlc-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
      title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-pressed={expanded}
      data-sidebar-toggle
      on:click={toggleExpanded}
    >
      {#if expanded}
        <PanelLeftClose size={18} strokeWidth={1.6} />
      {:else}
        <PanelLeftOpen size={18} strokeWidth={1.6} />
      {/if}
    </button>
  </div>
</nav>
