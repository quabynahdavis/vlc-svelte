<script lang="ts">
  import {
    AudioLines,
    Captions,
    Clapperboard,
    Disc,
    FolderOpen,
    Gauge,
    Keyboard,
    MousePointer2,
    Play,
    Puzzle,
    Search,
    Shield,
    SlidersHorizontal,
    Wifi,
    X,
  } from 'lucide-svelte';
  import AudioPanel from './settings/AudioPanel.svelte';
  import ControlsPanel from './settings/ControlsPanel.svelte';
  import ExtensionsPanel from './settings/ExtensionsPanel.svelte';
  import GeneralPanel from './settings/GeneralPanel.svelte';
  import InterfacePanel from './settings/InterfacePanel.svelte';
  import LibraryPanel from './settings/LibraryPanel.svelte';
  import NetworkPanel from './settings/NetworkPanel.svelte';
  import PerformancePanel from './settings/PerformancePanel.svelte';
  import PlaceholderPanel from './settings/PlaceholderPanel.svelte';
  import PlaybackPanel from './settings/PlaybackPanel.svelte';
  import PrivacyPanel from './settings/PrivacyPanel.svelte';
  import RecordingPanel from './settings/RecordingPanel.svelte';
  import SubtitlesPanel from './settings/SubtitlesPanel.svelte';
  import VideoPanel from './settings/VideoPanel.svelte';
import { settings, defaultSettings } from '../stores/settings';

  export let open = false;
  export let onClose: () => void = () => {};

  interface SettingsItem {
    id: string;
    label: string;
    icon: typeof SlidersHorizontal;
  }

  interface SettingsGroup {
    label: string;
    items: SettingsItem[];
  }

  const groups: SettingsGroup[] = [
    {
      label: 'App',
      items: [
        { id: 'general', label: 'General', icon: SlidersHorizontal },
        { id: 'interface', label: 'Interface', icon: MousePointer2 },
        { id: 'privacy', label: 'Privacy', icon: Shield },
        { id: 'controls', label: 'Controls', icon: Keyboard },
      ],
    },
    {
      label: 'Media',
      items: [
        { id: 'playback', label: 'Playback', icon: Play },
        { id: 'video', label: 'Video', icon: Clapperboard },
        { id: 'audio', label: 'Audio', icon: AudioLines },
        { id: 'subtitles', label: 'Subtitles', icon: Captions },
        { id: 'library', label: 'Library', icon: FolderOpen },
      ],
    },
    {
      label: 'System',
      items: [
        { id: 'network', label: 'Network', icon: Wifi },
        { id: 'performance', label: 'Performance', icon: Gauge },
        { id: 'recording', label: 'Recording', icon: Disc },
        { id: 'extensions', label: 'Extensions', icon: Puzzle },
      ],
    },
  ];

  // Keep the original `<SettingsModal onClose={...} />` usage working while
  // also supporting `<SettingsModal bind:open />` from the shell.
  const hasOpenProp = Object.prototype.hasOwnProperty.call($$props, 'open');
  $: visible = open || !hasOpenProp;

  let category = 'general';
  let query = '';
  let contentEl: HTMLElement | null = null;

  $: activeItem = groups.flatMap((group) => group.items).find((item) => item.id === category);
  $: normalizedQuery = query.trim().toLowerCase();
  $: filteredGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.label.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.items.length > 0);
  $: title =
    category === 'general'
      ? 'Global Settings'
      : category === 'audio'
        ? 'Audio Defaults'
        : category === 'subtitles'
          ? 'Subtitle Defaults'
          : `${activeItem?.label ?? 'Global'} Settings`;

  function close(): void {
    open = false;
    onClose();
  }

  function selectCategory(id: string): void {
    category = id;
    contentEl?.scrollTo({ top: 0 });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && visible) {
      event.preventDefault();
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible}
  <div
    class="fixed inset-0 z-50 bg-vlc-app/95 p-3 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div
      class="flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-vlc-border bg-vlc-app shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
    >
      <header class="flex h-16 shrink-0 items-center px-3.5">
        <label class="relative block w-[300px] shrink-0">
          <Search
            size={18}
            strokeWidth={1.7}
            class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-vlc-muted"
            aria-hidden="true"
          />
          <input
            bind:value={query}
            type="text"
            placeholder="Search"
            aria-label="Search settings"
            autocomplete="off"
            spellcheck="false"
            class="h-10 w-full rounded-[8px] bg-vlc-card pl-11 pr-3 text-[14px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50"
          />
        </label>

        <h1 class="ml-[26px] min-w-0 flex-1 truncate text-[16px] font-normal text-vlc-text">
          {title}
        </h1>

        <button
          type="button"
          class="ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
          title="Close settings"
          aria-label="Close settings"
          on:click={close}
        >
          <X size={19} strokeWidth={1.6} />
        </button>
      </header>

      <div class="flex min-h-0 flex-1">
        <aside
          class="w-[300px] shrink-0 overflow-y-auto border-r border-vlc-border px-4 py-3"
          aria-label="Settings categories"
        >
          {#each filteredGroups as group (group.label)}
            <p
              class="px-6 pb-2 pt-5 text-[12px] font-normal tracking-[0.01em] text-vlc-muted first:pt-3"
            >
              {group.label}
            </p>
            <div class="flex flex-col gap-0.5">
              {#each group.items as item (item.id)}
                {@const active = category === item.id}
                <button
                  type="button"
                  class="flex h-11 w-full items-center gap-[18px] rounded-[8px] px-6 text-left text-[14px] transition-colors"
                  class:bg-vlc-card={active}
                  class:text-vlc-text={active}
                  class:text-vlc-secondary={!active}
                  class:hover:bg-[#151515]={!active}
                  class:hover:text-vlc-text={!active}
                  aria-current={active ? 'page' : undefined}
                  on:click={() => selectCategory(item.id)}
                >
                  <span class={active ? 'shrink-0 text-vlc-orange' : 'shrink-0 text-vlc-secondary'}>
                    <svelte:component this={item.icon} size={20} strokeWidth={1.6} />
                  </span>
                  <span class="truncate">{item.label}</span>
                </button>
              {/each}
            </div>
          {/each}

          {#if filteredGroups.length === 0}
            <p class="px-6 pt-3 text-[13px] leading-5 text-vlc-muted">
              No settings found for “{query}”.
            </p>
          {/if}
        </aside>
        <button type="button" class="h-9 px-4 rounded-[8px] bg-vlc-danger/20 text-vlc-danger hover:bg-vlc-danger/30" aria-label="Reset all settings" on:click={() => { if (confirm('Reset all settings to defaults? This cannot be undone.')) { settings.set({ ...defaultSettings }); } }}>Reset All Settings</button>

        <section
          bind:this={contentEl}
          class="min-w-0 flex-1 overflow-y-auto bg-vlc-app px-10 py-6"
          aria-label="Settings content"
        >
          {#if category === 'general'}
            <GeneralPanel />
          {:else if category === 'interface'}
            <InterfacePanel />
          {:else if category === 'privacy'}
            <PrivacyPanel />
          {:else if category === 'controls'}
            <ControlsPanel />
          {:else if category === 'playback'}
            <PlaybackPanel />
          {:else if category === 'video'}
            <VideoPanel />
          {:else if category === 'audio'}
            <AudioPanel />
          {:else if category === 'subtitles'}
            <SubtitlesPanel on:navigate={(event) => selectCategory(event.detail)} />
          {:else if category === 'library'}
            <LibraryPanel />
          {:else if category === 'network'}
            <NetworkPanel />
          {:else if category === 'performance'}
            <PerformancePanel />
          {:else if category === 'recording'}
            <RecordingPanel />
          {:else if category === 'extensions'}
            <ExtensionsPanel />
          {:else}
            <PlaceholderPanel title={activeItem?.label ?? 'Settings'} />
          {/if}
        </section>
      </div>
    </div>
  </div>
{/if}
