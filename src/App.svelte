<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import PlayerView from './views/PlayerView.svelte';
  import SettingsView from './views/SettingsView.svelte';

  let view: 'player' | 'settings' = 'player';

  onMount(async () => {
    // Placeholder for future Tauri command checks
  });
</script>

<nav class="h-12 border-b border-gray-200 bg-gray-50 flex items-center justify-between px-6 shadow-sm">
  <div class="flex items-center gap-2 font-bold text-xl text-gray-800">
    <span>VLC</span>
    <span class="text-gray-400">Redesign</span>
  </div>
  <div class="flex items-center gap-4">
    <button
      class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
      class:bg-gray-100={view === 'player'}
      class:text-gray-900={view === 'player'}
      class:bg-transparent={view === 'settings'}
      class:text-gray-600={view === 'settings'}
      on:click={() => (view = 'player')}
    >
      Player
    </button>
    <button
      class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
      class:bg-gray-100={view === 'settings'}
      class:text-gray-900={view === 'settings'}
      class:bg-transparent={view === 'player'}
      class:text-gray-600={view === 'player'}
      on:click={() => (view = 'settings')}
    >
      Settings
    </button>
  </div>
</nav>

<main class="flex-1 overflow-hidden flex">
  {#if view === 'player'}
    <PlayerView />
  {:else}
    <SettingsView />
  {/if}
</main>
