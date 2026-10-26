<script lang="ts">
  import { get } from 'svelte/store';
  import ContextMenu from './components/ContextMenu.svelte';
  import IconRail from './components/IconRail.svelte';
  import PropertyPanel, {
    compressorPreset,
    videoPreset,
  } from './components/PropertyPanel.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import TitleBar from './components/TitleBar.svelte';
  import { NAV_LABELS, type NavId, type RailItemId } from './lib/constants';
  import {
    next as nextTrack,
    player,
    prev as prevTrack,
    setVolume,
    toggle as togglePlayback,
    toggleMute,
  } from './stores/player';
  import {
    closeContextMenu,
    contextMenu,
    openContextMenu,
    propertiesPanel,
  } from './stores/ui';
  import LibraryView from './views/LibraryView.svelte';
  import PlayerView from './views/PlayerView.svelte';

  let activeNav: NavId = 'home';
  let sidebarExpanded = false;
  const sidebarPreference: Partial<Record<NavId, boolean>> = {};
  let showSettings = false;
  let showRightPanel = false;
  let hideChrome = false;
  let panelOpen = true;
  let propertyPreset: 'compressor' | 'video' = 'compressor';

  $: propertySections = propertyPreset === 'video' ? videoPreset : compressorPreset;
  $: propertyTitle = propertyPreset === 'video' ? 'Video Effects' : 'Collapse Settings';

  function handleNavSelect(id: RailItemId) {
    if (id === 'add') return;
    activeNav = id;
    sidebarExpanded = sidebarPreference[id] ?? id !== 'home';
  }

  function handleSidebarExpanded(value: boolean) {
    sidebarExpanded = value;
    sidebarPreference[activeNav] = value;
  }

  function stopPlayback(): void {
    player.update((state) => ({ ...state, isPlaying: false, currentTime: 0 }));
  }

  async function quitApp(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch (error) {
      // Closing is only possible inside the Tauri shell; the browser preview stays open.
      console.warn('Quit is only available in the desktop shell.', error);
    }
  }

  function handleMenuAction(id: string): void {
    switch (id) {
      case 'play-pause':
        togglePlayback();
        break;
      case 'stop':
        stopPlayback();
        break;
      case 'previous-item':
        prevTrack();
        break;
      case 'next-item':
        nextTrack();
        break;
      case 'hide-ui':
        hideChrome = !hideChrome;
        break;
      case 'volume-up':
        setVolume(Math.min(100, get(player).volume + 5));
        break;
      case 'volume-down':
        setVolume(Math.max(0, get(player).volume - 5));
        break;
      case 'audio-mute':
        toggleMute();
        break;
      case 'effects-compressor':
        propertyPreset = 'compressor';
        panelOpen = true;
        propertiesPanel.set(true);
        break;
      case 'effects-video':
        propertyPreset = 'video';
        panelOpen = true;
        propertiesPanel.set(true);
        break;
      case 'effects-hide':
        propertiesPanel.set(false);
        break;
      case 'quit':
        void quitApp();
        break;
      default:
        // Remaining menu entries are placeholders for future media handling.
        break;
    }
  }
</script>

<div
  class="app-shell flex h-screen w-screen flex-col overflow-hidden bg-vlc-app text-vlc-text"
  class:chrome-hidden={hideChrome}
>
  <div class="chrome-titlebar shrink-0">
    <TitleBar onSettings={() => (showSettings = true)} />
  </div>

  <div class="flex min-h-0 flex-1">
    <div class="chrome-rail h-full shrink-0">
      <IconRail
        active={activeNav}
        expanded={sidebarExpanded}
        onSelect={handleNavSelect}
        onExpandedChange={handleSidebarExpanded}
      />
    </div>

    <main
      class="relative min-w-0 flex-1 overflow-hidden bg-vlc-app"
      on:contextmenu|preventDefault={openContextMenu}
    >
      {#if activeNav === 'home'}
        <PlayerView on:settings={() => (showSettings = true)} />
      {:else if activeNav === 'videos'}
        <LibraryView />
      {:else}
        <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p class="text-lg font-medium text-vlc-secondary">{NAV_LABELS[activeNav]}</p>
          <p class="text-sm text-vlc-muted">Coming soon</p>
        </div>
      {/if}
    </main>

    {#if $propertiesPanel}
      <aside
        class="property-dock h-full w-[400px] shrink-0 overflow-y-auto border-l border-vlc-border bg-vlc-app p-4"
        aria-label="Effect settings"
      >
        <PropertyPanel title={propertyTitle} sections={propertySections} bind:open={panelOpen} />
      </aside>
    {/if}

    {#if showRightPanel}
      <aside
        class="h-full w-72 shrink-0 border-l border-vlc-border bg-vlc-panel p-4"
        aria-label="Details panel"
      >
        <p class="text-[11px] uppercase tracking-[0.12em] text-vlc-muted">Details</p>
        <p class="mt-4 text-sm text-vlc-muted">Nothing selected</p>
      </aside>
    {/if}
  </div>

  {#if showSettings}
    <SettingsModal onClose={() => (showSettings = false)} />
  {/if}

  <ContextMenu
    x={$contextMenu.x}
    y={$contextMenu.y}
    open={$contextMenu.open}
    onClose={closeContextMenu}
    onAction={handleMenuAction}
  />
</div>

<style>
  .app-shell.chrome-hidden :global(.chrome-titlebar),
  .app-shell.chrome-hidden :global(.chrome-rail) {
    display: none;
  }
</style>
