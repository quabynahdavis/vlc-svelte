<script lang="ts">
  import { X } from 'lucide-svelte';
  import { dockMode, openDock } from '../stores/ui';
  import AudioEffectsPanel from './dock/AudioEffectsPanel.svelte';
  import EqPanel from './dock/EqPanel.svelte';
  import QueuePanel from './dock/QueuePanel.svelte';
  import SubtitleDockPanel from './dock/SubtitleDockPanel.svelte';
  import VideoEffectsPanel from './dock/VideoEffectsPanel.svelte';

  export let onAdvancedSettings: (category?: string) => void = () => {};

  const titles: Record<string, string> = {
    audio: 'Audio',
    subtitles: 'Subtitles',
    video: 'Video',
    queue: 'Playing Queue',
  };

  $: title = titles[$dockMode] ?? 'Panel';
</script>

{#if $dockMode !== 'closed'}
  <aside
    class="flex h-full w-[340px] shrink-0 flex-col border-l border-vlc-border bg-[#141414]"
    aria-label={`${title} dock`}
    data-right-dock
    data-dock-mode={$dockMode}
  >
    <header class="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-vlc-border px-4">
      <h2 class="min-w-0 truncate text-[14px] font-medium leading-5 text-vlc-text">{title}</h2>

      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
        title="Close panel"
        aria-label="Close panel"
        on:click={() => openDock('closed')}
      >
        <X size={18} strokeWidth={1.7} />
      </button>
    </header>

    <div class="dock-scroll min-h-0 flex-1 overflow-y-auto">
      {#if $dockMode === 'audio'}
        <div class="space-y-3 p-3">
          <EqPanel />
          <AudioEffectsPanel />
        </div>
      {:else if $dockMode === 'subtitles'}
        <SubtitleDockPanel {onAdvancedSettings} />
      {:else if $dockMode === 'video'}
        <div class="p-3">
          <VideoEffectsPanel />
        </div>
      {:else if $dockMode === 'queue'}
        <QueuePanel />
      {/if}
    </div>
  </aside>
{/if}

<style>
  .dock-scroll {
    scrollbar-width: thin;
    scrollbar-color: #2a2a2a transparent;
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
    background-color: #2a2a2a;
  }
</style>
