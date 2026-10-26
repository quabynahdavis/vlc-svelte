<script lang="ts">
  import {
    AudioLines,
    Captions,
    CircleDot,
    Gauge,
    Keyboard,
    Library,
    Monitor,
    Play,
    Puzzle,
    Search,
    Shield,
    SlidersHorizontal,
    Video,
    Wifi,
    X,
  } from 'lucide-svelte';

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
        { id: 'interface', label: 'Interface', icon: Monitor },
        { id: 'privacy', label: 'Privacy', icon: Shield },
        { id: 'controls', label: 'Controls', icon: Keyboard },
      ],
    },
    {
      label: 'Media',
      items: [
        { id: 'playback', label: 'Playback', icon: Play },
        { id: 'video', label: 'Video', icon: Video },
        { id: 'audio', label: 'Audio', icon: AudioLines },
        { id: 'subtitles', label: 'Subtitles', icon: Captions },
        { id: 'library', label: 'Library', icon: Library },
      ],
    },
    {
      label: 'System',
      items: [
        { id: 'network', label: 'Network', icon: Wifi },
        { id: 'performance', label: 'Performance', icon: Gauge },
        { id: 'recording', label: 'Recording', icon: CircleDot },
        { id: 'extensions', label: 'Extensions', icon: Puzzle },
      ],
    },
  ];

  let query = '';
  let activeItem = 'general';

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="fixed inset-0 z-50 flex bg-black/70 p-3 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
  aria-label="Global settings"
>
  <div
    class="flex h-full w-full flex-col overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
  >
    <header class="flex h-16 shrink-0 items-center gap-8 border-b border-vlc-border px-4">
      <label class="relative block w-64 shrink-0">
        <Search
          size={16}
          strokeWidth={1.75}
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-vlc-muted"
        />
        <input
          bind:value={query}
          type="text"
          placeholder="Search"
          aria-label="Search settings"
          class="h-10 w-full rounded-control border border-vlc-border bg-vlc-card pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/60"
        />
      </label>

      <h1 class="truncate text-[15px] font-normal text-vlc-secondary">Global Settings</h1>

      <button
        type="button"
        class="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title="Close settings"
        aria-label="Close settings"
        on:click={onClose}
      >
        <X size={18} strokeWidth={1.75} />
      </button>
    </header>

    <div class="flex min-h-0 flex-1">
      <aside
        class="w-72 shrink-0 overflow-y-auto border-r border-vlc-border bg-vlc-app px-3 py-2"
        aria-label="Settings categories"
      >
        {#each groups as group (group.label)}
          <p
            class="px-3 pb-2 pt-5 text-[11px] font-normal uppercase tracking-[0.12em] text-vlc-muted first:pt-3"
          >
            {group.label}
          </p>
          <div class="flex flex-col gap-0.5">
            {#each group.items as item (item.id)}
              <button
                type="button"
                class="flex h-11 items-center gap-3 rounded-control px-3 text-left text-[13px] transition-colors"
                class:bg-vlc-card={activeItem === item.id}
                class:text-white={activeItem === item.id}
                class:text-vlc-secondary={activeItem !== item.id}
                class:hover:bg-vlc-card={activeItem !== item.id}
                class:hover:text-white={activeItem !== item.id}
                aria-current={activeItem === item.id ? 'page' : undefined}
                on:click={() => (activeItem = item.id)}
              >
                <span
                  class={
                    activeItem === item.id
                      ? 'shrink-0 text-vlc-orange'
                      : 'shrink-0 text-vlc-secondary'
                  }
                >
                  <svelte:component this={item.icon} size={17} strokeWidth={1.65} />
                </span>
                <span class="truncate">{item.label}</span>
              </button>
            {/each}
          </div>
        {/each}
      </aside>

      <!-- Phase 2 fills the settings content for the selected category. -->
      <section class="min-w-0 flex-1 overflow-y-auto bg-vlc-panel" aria-label="Settings content"></section>
    </div>
  </div>
</div>
