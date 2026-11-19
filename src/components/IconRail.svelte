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
    type NavItem,
    type RailItemId,
  } from '../lib/constants';
  import { layout } from '../stores/layout';

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

  $: railItems = [
    ...$layout.railOrder
      .map((id) => NAV_ITEMS.find((item) => item.id === id))
      .filter((item): item is NavItem => Boolean(item)),
    ADD_ITEM,
  ];

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
  <div
    class="flex min-h-0 flex-1 flex-col gap-0.5 p-2"
    class:items-center={!expanded}
  >
    {#each railItems as item (item.id)}
      {#if item.id === 'add'}
        <div
          class="my-1.5 h-px shrink-0 bg-vlc-border/70"
          class:mx-2={expanded}
          class:w-8={!expanded}
          class:w-auto={expanded}
          class:self-stretch={expanded}
          aria-hidden="true"
        ></div>
      {/if}

      <button
        type="button"
        class="group relative flex h-10 shrink-0 items-center rounded-control transition-colors duration-150 hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
        class:w-10={!expanded}
        class:justify-center={!expanded}
        class:w-full={expanded}
        class:gap-3={expanded}
        class:px-3.5={expanded}
        class:bg-vlc-card={active === item.id}
        title={item.label}
        aria-label={item.label}
        aria-current={active === item.id ? 'page' : undefined}
        data-rail-item={item.id}
        on:click={() => onSelect(item.id)}
      >
        {#if active === item.id}
          <span
            class="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-vlc-orange"
            aria-hidden="true"
          ></span>
        {/if}

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
            class="min-w-0 truncate text-[13px] leading-5 transition-colors duration-150"
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
      class="flex h-9 w-9 items-center justify-center rounded-control text-vlc-muted transition-colors duration-150 hover:bg-vlc-raised hover:text-vlc-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-pressed={expanded}
      data-sidebar-toggle
      on:click={toggleExpanded}
    >
      {#if expanded}
        <PanelLeftClose size={18} strokeWidth={1.6} aria-hidden="true" />
      {:else}
        <PanelLeftOpen size={18} strokeWidth={1.6} aria-hidden="true" />
      {/if}
    </button>
  </div>
</nav>
