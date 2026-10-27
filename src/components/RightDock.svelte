<script lang="ts">
  import {
    AudioLines,
    Captions,
    Clapperboard,
    Play,
    X,
    Activity,
  } from 'lucide-svelte';
  import type { ComponentType } from 'svelte';
  import { player } from '../stores/player';
  import { dockMode, openDock } from '../stores/ui';
  import type { DockMode } from '../stores/ui';
  import EqPanel from './dock/EqPanel.svelte';

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
  ];

  const titles: Record<DockMode, string> = {
    closed: '',
    playback: 'Playback',
    audio: 'Audio',
    subtitles: 'Subtitles',
    video: 'Video',
    queue: 'Playing Queue',
    visualizer: 'Visualizer',
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

  // Lazy-loaded panel components
  let AudioEffectsPanel: ComponentType | null = null;
  let AudioVisualizerPanel: ComponentType | null = null;
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
      <div
        class="grid h-14 shrink-0 grid-cols-5 items-stretch border-b border-vlc-border"
        role="tablist"
        aria-label="Dock tabs"
      >
        {#each tabs as tab (tab.id)}
          {@const active = $dockMode === tab.id}
          <button
            type="button"
            role="tab"
            aria-selected={active}
            class="relative flex h-full min-w-0 items-center justify-center gap-1.5 px-0.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vlc-orange/40"
            class:text-vlc-text={active}
            class:text-vlc-dim={!active}
            class:hover:text-vlc-text={!active}
            on:click={() => selectTab(tab.id)}
          >
            <svelte:component
              this={tab.icon}
              size={18}
              strokeWidth={1.7}
              class={active ? 'shrink-0 text-vlc-orangeText' : 'shrink-0'}
            />
            <span class="truncate">{tab.label}</span>
            {#if active}
              <span
                class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-vlc-orange"
                aria-hidden="true"
              ></span>
            {/if}
          </button>
        {/each}
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
</style>
