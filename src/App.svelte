<script lang="ts">
  import IconRail from './components/IconRail.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import TitleBar from './components/TitleBar.svelte';
  import { NAV_LABELS, type NavId, type RailItemId } from './lib/constants';
  import LibraryView from './views/LibraryView.svelte';
  import PlayerView from './views/PlayerView.svelte';

  let activeNav: NavId = 'home';
  let showSettings = false;
  let showRightPanel = false;

  function handleNavSelect(id: RailItemId) {
    if (id === 'add') return;
    activeNav = id;
  }
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-vlc-app text-white">
  <TitleBar onSettings={() => (showSettings = true)} />

  <div class="flex min-h-0 flex-1">
    <IconRail active={activeNav} onSelect={handleNavSelect} />

    <main class="relative min-w-0 flex-1 overflow-hidden bg-vlc-app">
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
</div>
