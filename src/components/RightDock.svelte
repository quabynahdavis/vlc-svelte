<script lang="ts">
  import {
    AudioLines,
    Bookmark,
    Captions,
    ChevronLeft,
    ChevronRight,
    Clapperboard,
    Play,
    X,
    Activity,
  } from 'lucide-svelte';
  import { tick, type ComponentType } from 'svelte';
  import { player } from '../stores/player';
  import { dockMode, openDock } from '../stores/ui';
  import type { DockMode } from '../stores/ui';
  import EqPanel from './dock/EqPanel.svelte';
  import { layout } from '../stores/layout';

  export let onAdvancedSettings: (category?: string) => void = () => {};

  type DockTab = {
    id: DockMode;
    label: string;
    icon: ComponentType;
  };

  const tabs: DockTab[] = [
    { id: 'playback', label: 'Playback', icon: Play },
    { id: 'video', label: 'Video', icon: Clapperboard },
    { id: 'audio', label: 'Audio', icon: AudioLines },
    { id: 'visualizer', label: 'Visualizer', icon: Activity },
    { id: 'subtitles', label: 'Subtitles', icon: Captions },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  ];

  /** Tabs follow the user's saved layout order; unknown ids are ignored. */
  $: orderedTabs = $layout.dockTabOrder
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is DockTab => Boolean(tab));

  const titles: Record<DockMode, string> = {
    closed: '',
    playback: 'Playback',
    audio: 'Audio',
    subtitles: 'Subtitles',
    video: 'Video',
    queue: 'Playing Queue',
    visualizer: 'Visualizer',
    bookmarks: 'Bookmarks & Chapters',
  };

  $: title = titles[$dockMode] ?? 'Panel';
  $: showTabs = $dockMode !== 'closed' && $dockMode !== 'queue';
  $: queueCount = `${$player.queue.length} ${$player.queue.length === 1 ? 'item' : 'items'}`;

  async function loadPanel(name: string): Promise<ComponentType> {
    const mod = await import(`./dock/${name}.svelte`);
    return mod.default;
  }

  function selectTab(mode: DockMode): void {
    if (mode === 'closed' || mode === 'queue') return;
    dockMode.set(mode);
  }

  // Horizontal tab strip overflow state.
  const TAB_SCROLL_STEP = 80;
  const EDGE_EPSILON = 1;

  let tabsEl: HTMLDivElement | null = null;
  let hasOverflow = false;
  let canScrollLeft = false;
  let canScrollRight = false;

  function measureTabs(el: HTMLElement): void {
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    // The scroller shares its row with the chevrons, so compare against the
    // full row width: the chevrons should disappear as soon as the tabs would
    // fit without them.
    const availableWidth = el.parentElement?.clientWidth ?? el.clientWidth;
    const overflows = el.scrollWidth > availableWidth + EDGE_EPSILON;
    const wasOverflowing = hasOverflow;

    hasOverflow = overflows;
    canScrollLeft = overflows && el.scrollLeft > EDGE_EPSILON;
    canScrollRight = overflows && el.scrollLeft < maxScroll - EDGE_EPSILON;

    // Chevrons steal width from the strip, so re-reveal once they appear.
    if (!wasOverflowing && overflows) {
      void revealActiveTab();
    }
  }

  function updateScrollState(): void {
    if (tabsEl) measureTabs(tabsEl);
  }

  function scrollTabs(direction: -1 | 1): void {
    tabsEl?.scrollBy({ left: direction * TAB_SCROLL_STEP, behavior: 'smooth' });
  }

  async function revealActiveTab(): Promise<void> {
    await tick();
    const el = tabsEl;
    if (!el) return;

    const activeTab = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measureTabs(el);
  }

  function trackTabOverflow(node: HTMLDivElement): { destroy: () => void } {
    measureTabs(node);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measureTabs(node));
      observer.observe(node);
      // Active tabs grow when their label appears, so watch each tab too.
      for (const child of Array.from(node.children)) observer.observe(child);
    }

    return {
      destroy() {
        observer?.disconnect();
      },
    };
  }

  function onTabKeydown(event: KeyboardEvent, index: number): void {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (index - 1 + orderedTabs.length) % orderedTabs.length;
        break;
      case 'ArrowRight':
        nextIndex = (index + 1) % orderedTabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = orderedTabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = orderedTabs[nextIndex];
    if (!next) return;

    selectTab(next.id);
    void tick().then(() => {
      tabsEl?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
    });
  }

  // Keep the selected tab visible when it changes (and on first paint).
  $: if (showTabs && $dockMode) {
    void revealActiveTab();
  }

  // Lazy-loaded panel components
  let AudioEffectsPanel: ComponentType | null = null;
  let AudioVisualizerPanel: ComponentType | null = null;
  let BookmarksPanel: ComponentType | null = null;
  let PlaybackPanel: ComponentType | null = null;
  let QueuePanel: ComponentType | null = null;
  let SubtitleDockPanel: ComponentType | null = null;
  let VideoEffectsPanel: ComponentType | null = null;

  // Load panels on demand
  $: if ($dockMode === 'playback' && !PlaybackPanel) {
    void loadPanel('PlaybackPanel').then((mod) => (PlaybackPanel = mod));
  }
  $: if ($dockMode === 'audio' && !AudioEffectsPanel) {
    void loadPanel('AudioEffectsPanel').then((mod) => (AudioEffectsPanel = mod));
  }
  $: if ($dockMode === 'visualizer' && !AudioVisualizerPanel) {
    void loadPanel('AudioVisualizerPanel').then((mod) => (AudioVisualizerPanel = mod));
  }
  $: if ($dockMode === 'subtitles' && !SubtitleDockPanel) {
    void loadPanel('SubtitleDockPanel').then((mod) => (SubtitleDockPanel = mod));
  }
  $: if ($dockMode === 'bookmarks' && !BookmarksPanel) {
    void loadPanel('BookmarksPanel').then((mod) => (BookmarksPanel = mod));
  }
  $: if ($dockMode === 'video' && !VideoEffectsPanel) {
    void loadPanel('VideoEffectsPanel').then((mod) => (VideoEffectsPanel = mod));
  }
  $: if ($dockMode === 'queue' && !QueuePanel) {
    void loadPanel('QueuePanel').then((mod) => (QueuePanel = mod));
  }
</script>

{#if $dockMode !== 'closed'}
  <aside
    class="dock-shadow absolute inset-y-0 right-0 z-20 flex w-[340px] flex-col border-l border-vlc-border bg-vlc-panel"
    aria-label={`${title} dock`}
    data-right-dock
    data-dock-mode={$dockMode}
  >
    <header class="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-vlc-border px-4">
      <div class="flex min-w-0 items-center gap-2">
        <h2 class="min-w-0 truncate text-[14px] font-medium leading-5 text-vlc-text">{title}</h2>
        {#if $dockMode === 'queue'}
          <span class="shrink-0 text-[11px] leading-4 text-vlc-muted">{queueCount}</span>
        {/if}
      </div>

      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
        title="Close panel"
        aria-label="Close panel"
        on:click={() => openDock('closed')}
      >
        <X size={18} strokeWidth={1.7} />
      </button>
    </header>

    {#if showTabs}
      <div class="flex h-14 shrink-0 items-stretch border-b border-vlc-border">
        {#if hasOverflow}
          <button
            type="button"
            class="flex w-7 shrink-0 items-center justify-center text-vlc-dim transition-colors hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vlc-orange/40 disabled:pointer-events-none disabled:opacity-30"
            title="Scroll tabs left"
            aria-label="Scroll tabs left"
            disabled={!canScrollLeft}
            on:click={() => scrollTabs(-1)}
          >
            <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        {/if}

        <div
          bind:this={tabsEl}
          class="dock-tabs-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto overscroll-x-contain"
          role="tablist"
          aria-label="Dock tabs"
          aria-orientation="horizontal"
          use:trackTabOverflow
          on:scroll={updateScrollState}
        >
          {#each orderedTabs as tab, index (tab.id)}
            {@const active = $dockMode === tab.id}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              tabindex={active ? 0 : -1}
              title={active ? null : tab.label}
              aria-label={active ? null : tab.label}
              class="relative flex h-full flex-none items-center justify-center gap-1.5 whitespace-nowrap text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vlc-orange/40"
              class:px-3={active}
              class:w-10={!active}
              class:text-vlc-text={active}
              class:text-vlc-dim={!active}
              class:hover:text-vlc-text={!active}
              on:click={() => selectTab(tab.id)}
              on:keydown={(event) => onTabKeydown(event, index)}
            >
              <svelte:component
                this={tab.icon}
                size={18}
                strokeWidth={1.7}
                aria-hidden="true"
                class={active ? 'shrink-0 text-vlc-orangeText' : 'shrink-0'}
              />
              {#if active}
                <span class="whitespace-nowrap">{tab.label}</span>
                <span
                  class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-vlc-orange"
                  aria-hidden="true"
                ></span>
              {/if}
            </button>
          {/each}
        </div>

        {#if hasOverflow}
          <button
            type="button"
            class="flex w-7 shrink-0 items-center justify-center text-vlc-dim transition-colors hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vlc-orange/40 disabled:pointer-events-none disabled:opacity-30"
            title="Scroll tabs right"
            aria-label="Scroll tabs right"
            disabled={!canScrollRight}
            on:click={() => scrollTabs(1)}
          >
            <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        {/if}
      </div>
    {/if}

    <div class="dock-scroll min-h-0 flex-1 overflow-y-auto">
      {#if $dockMode === 'playback'}
        <div class="p-4 pb-6">
          {#if PlaybackPanel}
            <svelte:component this={PlaybackPanel} />
          {/if}
        </div>
      {:else if $dockMode === 'audio'}
        <div class="p-4 pb-6 space-y-3">
          <EqPanel />
          {#if AudioEffectsPanel}
            <svelte:component this={AudioEffectsPanel} />
          {/if}
        </div>
      {:else if $dockMode === 'subtitles'}
        <div class="p-4 pb-6">
          {#if SubtitleDockPanel}
            <svelte:component this={SubtitleDockPanel} {onAdvancedSettings} />
          {/if}
        </div>
      {:else if $dockMode === 'bookmarks'}
        <div class="p-4 pb-6">
          {#if BookmarksPanel}
            <svelte:component this={BookmarksPanel} />
          {/if}
        </div>
      {:else if $dockMode === 'video'}
        <div class="p-4 pb-6">
          {#if VideoEffectsPanel}
            <svelte:component this={VideoEffectsPanel} />
          {/if}
        </div>
      {:else if $dockMode === 'visualizer'}
        <div class="p-4 pb-6">
          {#if AudioVisualizerPanel}
            <svelte:component this={AudioVisualizerPanel} />
          {/if}
        </div>
      {:else if $dockMode === 'queue'}
        <div class="p-4 pb-6">
          {#if QueuePanel}
            <svelte:component this={QueuePanel} />
          {/if}
        </div>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .dock-shadow {
    box-shadow: -18px 0 40px var(--shadow-color);
  }

  .dock-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }

  .dock-scroll::-webkit-scrollbar {
    width: 8px;
  }

  .dock-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .dock-scroll::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 9999px;
    background-clip: padding-box;
    background-color: var(--scrollbar-thumb);
  }

  /* The tab strip scrolls horizontally but keeps its chrome clean. */
  .dock-tabs-scroll {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .dock-tabs-scroll::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
</style>
