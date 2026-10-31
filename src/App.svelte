<script lang="ts">
  import { get } from 'svelte/store';
  import { tick } from 'svelte';
  import AddToPlaylistDialog from './components/AddToPlaylistDialog.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import SubtitleAddDialog from './components/SubtitleAddDialog.svelte';
  import IconRail from './components/IconRail.svelte';
  import PropertyPanel, {
    compressorPreset,
    videoPreset,
  } from './components/PropertyPanel.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import HotkeysWindow from './components/settings/HotkeysWindow.svelte';
  import WelcomeScreen from './components/WelcomeScreen.svelte';
  import TitleBar from './components/TitleBar.svelte';
  import { NAV_LABELS, type NavId, type RailItemId } from './lib/constants';
  import { toggleFullscreen } from './lib/gestures';
  import { t } from './lib/t';
  import { applyWindowDecorations } from './lib/windowChrome';
  import {
    clearQueue,
    currentTrack,
    next as nextTrack,
    player,
    prev as prevTrack,
    seek,
    setVolume,
    stop as stopPlayer,
    toggle as togglePlayback,
    toggleMute,
  } from './stores/player';
  import { activeNav, navigate } from './stores/navigation';
  import { libraryImportLog } from './stores/library';
  import { completeOnboarding, onboarding } from './stores/onboarding';
  import { settings } from './stores/settings';
  import {
    closeContextMenu,
    contextMenu,
    openContextMenu,
    openDock,
    propertiesPanel,
  } from './stores/ui';
  import { openSubtitleAdd } from './stores/subtitleAdd';
  import LibraryView from './views/LibraryView.svelte';
  import PlayerView from './views/PlayerView.svelte';
  import MusicView from './views/MusicView.svelte';
  import NetworkView from './views/NetworkView.svelte';
  import RecentView from './views/RecentView.svelte';
  import PlaylistsView from './views/PlaylistsView.svelte';

  let activeNavLast = $activeNav;
  let sidebarExpanded = false;
  const sidebarPreference: Partial<Record<NavId, boolean>> = {};
  let showSettings = false;
  let showHotkeys = false;
  let hotkeysOpener: HTMLElement | null = null;
  let showWelcome = !get(onboarding).completed;
  let showRightPanel = false;
  let hideChrome = false;
  let menuCompact = false;
  let panelOpen = true;
  let propertyPreset: 'compressor' | 'video' = 'compressor';

  $: propertySections = propertyPreset === 'video' ? videoPreset : compressorPreset;
  $: propertyTitle = propertyPreset === 'video' ? 'Video Effects' : 'Collapse Settings';

  // Keep the native window decorations in sync with the title bar preference.
  // The guard avoids re-applying on every unrelated settings change.
  let appliedTitleBarMode: boolean | null = null;
  $: if ($settings.useSystemTitleBar !== appliedTitleBarMode) {
    appliedTitleBarMode = $settings.useSystemTitleBar;
    void applyWindowDecorations($settings.useSystemTitleBar);
  }

  // Keep the rail in step when views navigate programmatically (for example library -> player).
  $: if ($activeNav !== activeNavLast) {
    activeNavLast = $activeNav;
    sidebarExpanded = sidebarPreference[$activeNav] ?? $activeNav !== 'home';
  }

  function handleNavSelect(id: RailItemId) {
    if (id === 'add') return;
    navigate(id);
    sidebarExpanded = sidebarPreference[id] ?? id !== 'home';
  }

  function handleSidebarExpanded(value: boolean) {
    sidebarExpanded = value;
    sidebarPreference[$activeNav] = value;
  }

  /** Open Global Settings and select a category once the modal is mounted. */
  async function openSettingsAt(category: string): Promise<void> {
    showSettings = true;
    await tick();

    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        'aside[aria-label="Settings categories"] button',
      );
      const target = Array.from(buttons).find(
        (button) => button.textContent?.trim() === category,
      );
      target?.click();
    });
  }

  /**
   * Open the separate shortcuts window. The opener is remembered so focus can
   * return to it when the window closes; the menu item may already be gone by
   * then, in which case the window falls back to the main content area.
   */
  function openHotkeys(opener?: HTMLElement | null): void {
    const active = typeof document === 'undefined' ? null : document.activeElement;
    hotkeysOpener = opener ?? (active instanceof HTMLElement && active !== document.body ? active : null);
    showHotkeys = true;
  }

  function closeHotkeys(): void {
    showHotkeys = false;
  }

  function finishWelcome(): void {
    completeOnboarding();
    showWelcome = false;
  }

  /** Anchor the consolidated menu under the title-bar menu button. */
  function openAppMenu(event: MouseEvent): void {
    const trigger = event.currentTarget;
    const rect = trigger instanceof HTMLElement ? trigger.getBoundingClientRect() : null;
    menuCompact = false;
    contextMenu.set({
      open: true,
      x: Math.round(rect?.left ?? 12),
      y: Math.round((rect?.bottom ?? 44) + 4),
    });
  }

  /** Right-click keeps the shorter, playback-focused menu. */
  function handleContextMenu(event: MouseEvent): void {
    menuCompact = true;
    openContextMenu(event);
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

  /** Route a shell-menu request into the library's own add-media menu. */
  async function requestOpenMedia(kind: 'file' | 'folder' | 'network'): Promise<void> {
    navigate('videos');
    await tick();
    window.dispatchEvent(new CustomEvent('vlc-open-media', { detail: kind }));
  }

  function handleMenuAction(id: string): void {
    switch (id) {
      case 'play-pause':
        togglePlayback();
        break;
      case 'stop':
        stopPlayer();
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
        openDock('video');
        break;
      case 'effects-hide':
        propertiesPanel.set(false);
        break;
      case 'playback-speed':
        openDock('playback');
        break;
      case 'playback-jump-forward':
        seek(Math.min(get(player).duration, get(player).currentTime + 10));
        break;
      case 'playback-jump-backward':
        seek(Math.max(0, get(player).currentTime - 10));
        break;
      case 'video-fullscreen':
        toggleFullscreen(document.querySelector<HTMLElement>('.player-shell'));
        break;
      case 'video-zoom':
      case 'video-aspect-ratio':
        openDock('video');
        break;
      case 'audio-track':
        openDock('audio');
        break;
      case 'subtitle-add-file':
        openSubtitleAdd('file', get(currentTrack), null);
        break;
      case 'subtitle-track':
      case 'subtitle-delay':
        openDock('subtitles');
        break;
      case 'playlist-add':
        openDock('queue');
        break;
      case 'playlist-clear':
        clearQueue();
        break;
      case 'open-file':
        void requestOpenMedia('file');
        break;
      case 'open-folder':
        void requestOpenMedia('folder');
        break;
      case 'open-network':
        void requestOpenMedia('network');
        break;
      case 'open-disc':
        navigate('videos');
        libraryImportLog.set('Insert a disc, then open it from the system file manager.');
        break;
      case 'keyboard-shortcuts':
        openHotkeys();
        break;
      case 'settings':
        showSettings = true;
        break;
      case 'layout-settings':
        void openSettingsAt('Layout');
        break;
      case 'show-welcome':
        showWelcome = true;
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
  {#if !$settings.useSystemTitleBar}
    <div class="chrome-titlebar shrink-0">
      <TitleBar onMenu={openAppMenu} />
    </div>
  {/if}

  <div class="flex min-h-0 flex-1">
    <div class="chrome-rail h-full shrink-0">
      <IconRail
        active={$activeNav}
        expanded={sidebarExpanded}
        onSelect={handleNavSelect}
        onExpandedChange={handleSidebarExpanded}
      />
    </div>

    <main
      class="relative min-w-0 flex-1 overflow-hidden bg-vlc-app focus:outline-none"
      tabindex="-1"
      data-hotkeys-return-fallback
      on:contextmenu={handleContextMenu}
    >
      {#if $activeNav === 'home'}
        <PlayerView
          on:settings={() => (showSettings = true)}
          on:advancedSettings={(event) => void openSettingsAt(event.detail)}
        />
      {:else if $activeNav === 'videos'}
        <LibraryView />
      {:else if $activeNav === 'music'}
        <MusicView />
      {:else if $activeNav === 'network'}
        <NetworkView />
      {:else if $activeNav === 'recent'}
        <RecentView />
      {:else if $activeNav === 'playlists'}
        <PlaylistsView />
      {:else}
        <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p class="text-lg font-medium text-vlc-secondary">{NAV_LABELS[$activeNav]}</p>
          <p class="text-sm text-vlc-muted">{t('nav.coming_soon')}</p>
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
        <p class="text-[11px] uppercase tracking-[0.12em] text-vlc-muted">{t('details')}</p>
        <p class="mt-4 text-sm text-vlc-muted">{t('nothing_selected')}</p>
      </aside>
    {/if}
  </div>

  {#if showSettings}
    <SettingsModal
      onClose={() => (showSettings = false)}
      onOpenHotkeys={() => openHotkeys()}
    />
  {/if}

  <ContextMenu
    x={$contextMenu.x}
    y={$contextMenu.y}
    open={$contextMenu.open}
    compact={menuCompact}
    onClose={closeContextMenu}
    onAction={handleMenuAction}
  />

  <AddToPlaylistDialog />

  <SubtitleAddDialog />

  {#if showHotkeys}
    <HotkeysWindow returnFocus={hotkeysOpener} onClose={closeHotkeys} />
  {/if}

  <WelcomeScreen
    open={showWelcome}
    onComplete={finishWelcome}
    onSkip={finishWelcome}
  />
</div>

<style>
  .app-shell.chrome-hidden :global(.chrome-titlebar),
  .app-shell.chrome-hidden :global(.chrome-rail) {
    display: none;
  }
</style>
